import { setGlobalOptions } from "firebase-functions/v2";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// Cost control
setGlobalOptions({ maxInstances: 10 });

// Only these emails can be admin
const ADMIN_EMAILS = new Set([
  "leslyndiz6@gmail.com",
  "l.ndizeye@alustudent.com",
]);

function requireAuth(context: any) {
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }
  return context.auth;
}

function requireAdmin(context: any) {
  const auth = requireAuth(context);
  const email = (auth.token?.email as string | undefined)?.toLowerCase();

  const isAdminClaim = Boolean(auth.token?.admin);
  const isWhitelistedEmail = Boolean(email && ADMIN_EMAILS.has(email));

  // allow if claim OR whitelisted (for bootstrap)
  if (!isAdminClaim && !isWhitelistedEmail) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }

  return { uid: auth.uid as string, email };
}

/**
 * Bootstrap admin claim for the 2 allowed admin emails.
 * Call this once after you login as those admin accounts.
 */
export const bootstrapAdmin = onCall(async (request) => {
  const auth = requireAuth(request);
  const email = (auth.token?.email as string | undefined)?.toLowerCase();

  if (!email || !ADMIN_EMAILS.has(email)) {
    throw new HttpsError("permission-denied", "Not eligible for admin bootstrap.");
  }

  await admin.auth().setCustomUserClaims(auth.uid, { admin: true, role: "admin" });

  await db.doc(`users/${auth.uid}`).set(
    {
      email,
      fullName: auth.token?.name ?? "Admin",
      role: "admin",
      status: "approved",
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true };
});

/**
 * Approve radiologist access request:
 * - Creates Auth user (no password yet)
 * - Sets custom claim role=radiologist
 * - Creates users/{uid} with approved status
 * - Marks accessRequests/{id} approved
 * - Returns password reset link (Option A)
 */
export const approveAccessRequest = onCall(async (request) => {
  const adminUser = requireAdmin(request);
  const data = request.data as any;

  const requestId = String(data?.requestId ?? "").trim();
  if (!requestId) throw new HttpsError("invalid-argument", "requestId is required.");

  const reqRef = db.doc(`accessRequests/${requestId}`);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) throw new HttpsError("not-found", "Access request not found.");

  const req = reqSnap.data() as any;
  if (req.status !== "pending") {
    throw new HttpsError("failed-precondition", `Request status is ${req.status}, not pending.`);
  }

  const email = String(req.email ?? "").trim().toLowerCase();
  const fullName = String(req.fullName ?? "").trim();
  const licenseId = String(req.licenseId ?? "").trim();
  const hospital = String(req.hospital ?? "").trim();

  // Your required fields
  if (!email || !fullName || !licenseId || !hospital) {
    throw new HttpsError(
      "failed-precondition",
      "Request must include email, fullName, licenseId, and hospital."
    );
  }

  // Create or get Auth user by email
  let userRecord: admin.auth.UserRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch {
    userRecord = await admin.auth().createUser({
      email,
      displayName: fullName,
      disabled: false,
      emailVerified: false,
    });
  }

  const uid = userRecord.uid;

  // Set radiologist role
  await admin.auth().setCustomUserClaims(uid, { role: "radiologist" });

  // Create/update user profile doc
  await db.doc(`users/${uid}`).set(
    {
      email,
      fullName,
      role: "radiologist",
      status: "approved",
      licenseId,
      hospital,
      department: req.department ?? null,
      phone: req.phone ?? null,
      yearsExperience: req.yearsExperience ?? null,
      reasonForAccess: req.reasonForAccess ?? null,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: adminUser.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Mark request approved
  await reqRef.set(
    {
      status: "approved",
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: adminUser.uid,
      approvedUid: uid,
    },
    { merge: true }
  );

  // Audit log
  await db.collection("auditLogs").add({
    actorId: adminUser.uid,
    action: "APPROVE_USER",
    targetType: "accessRequest",
    targetId: requestId,
    metadata: { email, uid },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Option A: Reset link that admin copies & sends
  const resetLink = await admin.auth().generatePasswordResetLink(email);

  return { ok: true, uid, email, resetLink };
});

export const rejectAccessRequest = onCall(async (request) => {
  const adminUser = requireAdmin(request);
  const data = request.data as any;

  const requestId = String(data?.requestId ?? "").trim();
  const reason = String(data?.reason ?? "").trim();

  if (!requestId) throw new HttpsError("invalid-argument", "requestId is required.");

  const reqRef = db.doc(`accessRequests/${requestId}`);
  const snap = await reqRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Access request not found.");

  const req = snap.data() as any;
  if (req.status !== "pending") {
    throw new HttpsError("failed-precondition", `Request status is ${req.status}, not pending.`);
  }

  await reqRef.set(
    {
      status: "rejected",
      rejectionReason: reason || null,
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: adminUser.uid,
    },
    { merge: true }
  );

  await db.collection("auditLogs").add({
    actorId: adminUser.uid,
    action: "REJECT_USER",
    targetType: "accessRequest",
    targetId: requestId,
    metadata: { reason: reason || null },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
});