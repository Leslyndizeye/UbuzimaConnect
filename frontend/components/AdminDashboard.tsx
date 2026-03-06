"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabaseConfig";

const API_BASE = (import.meta as any).env?.VITE_API_URL || "http://localhost:8000";

async function adminFetch(path: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API ${res.status}`);
  }
  return res.json();
}

interface ApiUser { id: number; email: string; full_name: string; hospital?: string; license_number?: string; role: string; status: string; created_at: string; firebase_uid?: string; }
interface Diagnosis { id: number; patient_id: number; ai_classification: string; confidence_score: number; tb_probability: number; pneumonia_probability: number; normal_probability: number; unknown_probability?: number; radiologist_verified: boolean; created_at: string; }
interface Patient { id: number; name: string; patient_ref_id?: string; hospital?: string; clinical_notes?: string; created_at: string; }
interface Stats { total_radiologists: number; pending_requests: number; total_patients: number; total_diagnoses: number; model_status: string; uptime_seconds: number; }
interface ModelInfo { status: string; path: string; size_mb: number; last_modified: string; classes: string[]; architecture: string; input_shape: number[]; }
interface AuditLog { id: number; user_id: number; action: string; entity?: string; entity_id?: number; timestamp: string; }
interface RetrainJob { id: number; status: string; created_at: string; error_message?: string; final_val_acc?: number; final_val_auc?: number; }
interface PredictionResult { classification: string; confidence_score: number; tb_probability: number; pneumonia_probability: number; normal_probability: number; unknown_probability?: number; explanation?: string; gradcam_b64?: string; }
interface EditPatient { id: number; name: string; patient_ref_id: string; hospital: string; clinical_notes: string; }

type Tab = "overview" | "users" | "passwords" | "predictions" | "patients" | "diagnose" | "retrain" | "model" | "audit";

const ADMIN_EMAILS = new Set(["leslyndiz6@gmail.com", "l.ndizeye@alustudent.com"]);
const fmt = (iso: string) => new Date(iso).toLocaleString("en-RW", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const uptime = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}h ${m}m`; };
const classBadge = (c: string) => {
  if (c === "Normal") return "bg-emerald-100 text-emerald-700";
  if (c === "Tuberculosis") return "bg-red-100 text-red-700";
  if (c === "Pneumonia") return "bg-orange-100 text-orange-700";
  return "bg-zinc-100 text-zinc-600";
};
const validateRwandaId = (id: string) => /^\d{16}$/.test(id.replace(/\s/g, ""));

function parseDuplicateError(msg: string): { type: "NATIONAL_ID" | "NAME" | null; existingId: number | null; message: string } {
  if (msg.startsWith("DUPLICATE_NATIONAL_ID|")) {
    const parts = msg.split("|");
    return { type: "NATIONAL_ID", existingId: parseInt(parts[1]) || null, message: parts[2] || msg };
  }
  if (msg.startsWith("DUPLICATE_NAME|")) {
    const parts = msg.split("|");
    return { type: "NAME", existingId: parseInt(parts[1]) || null, message: parts[2] || msg };
  }
  return { type: null, existingId: null, message: msg };
}

// ── Password Modal ──────────────────────────────────────────
function PasswordModal({ user, onClose, isDark, card, sub }: {
  user: ApiUser; onClose: () => void; isDark: boolean; card: string; sub: string;
}) {
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatedPw, setGeneratedPw] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");
  const [copied, setCopied] = useState(false);

  const hasAuth = user.firebase_uid && !user.firebase_uid.startsWith("pending_");

  const generate = async () => {
    setLoading(true); setMsg(""); setGeneratedPw("");
    try {
      const r = await adminFetch(`/users/${user.id}/generate-password`, { method: "POST" });
      setGeneratedPw(r.password);
      setMsg(` Password generated and set for ${r.email}`);
      setMsgType("ok");
    } catch (e: any) { setMsg(e.message); setMsgType("err"); }
    finally { setLoading(false); }
  };

  const setManual = async () => {
    if (newPw.length < 6) { setMsg("Password must be at least 6 characters"); setMsgType("err"); return; }
    setLoading(true); setMsg("");
    try {
      await adminFetch(`/users/${user.id}/set-password`, { method: "POST", body: JSON.stringify({ password: newPw }) });
      setMsg(` Password updated for ${user.email}`);
      setMsgType("ok");
      setNewPw("");
    } catch (e: any) { setMsg(e.message); setMsgType("err"); }
    finally { setLoading(false); }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-5 ${card}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Manage Password</h2>
            <p className={`text-xs mt-0.5 ${sub}`}>{user.full_name} · {user.email}</p>
          </div>
          <button onClick={onClose} className={`w-8 h-8 rounded-lg flex items-center justify-center border text-sm ${card}`}>✕</button>
        </div>

        {!hasAuth && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
             This user has no Supabase Auth account yet. Approve them first to enable password management.
          </div>
        )}

        {/* Generate password section */}
        <div className={`p-4 rounded-xl border space-y-3 ${isDark ? "bg-zinc-800 border-zinc-700" : "bg-gray-50 border-gray-200"}`}>
          <div className={`text-[9px] font-bold uppercase tracking-widest ${sub}`}>Auto-Generate Password</div>
          <p className={`text-xs ${sub}`}>Generate a secure random password and set it instantly.</p>
          <button onClick={generate} disabled={loading || !hasAuth}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl disabled:opacity-40">
            {loading ? "Generating…" : " Generate & Set Password"}
          </button>

          {generatedPw && (
            <div className={`p-3 rounded-xl border ${isDark ? "bg-zinc-900 border-zinc-700" : "bg-white border-gray-200"}`}>
              <div className={`text-[8px] font-bold uppercase ${sub} mb-1.5`}>Generated Password — share this with the user</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
                  {generatedPw}
                </code>
                <button onClick={() => copy(generatedPw)}
                  className="px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-500">
                  {copied ? "" : "Copy"}
                </button>
              </div>
              <p className={`text-[10px] mt-2 ${sub}`}>
                Send this to <strong>{user.email}</strong> so they can log in.
              </p>
            </div>
          )}
        </div>

        {/* Manual password section */}
        <div className={`p-4 rounded-xl border space-y-3 ${isDark ? "bg-zinc-800 border-zinc-700" : "bg-gray-50 border-gray-200"}`}>
          <div className={`text-[9px] font-bold uppercase tracking-widest ${sub}`}>Set Custom Password</div>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="Enter new password (min 6 chars)"
              className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 pr-16 ${card}`}
            />
            <button type="button" onClick={() => setShowPw(s => !s)}
              className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-1 rounded-lg ${isDark ? "bg-zinc-700 text-zinc-300" : "bg-gray-200 text-gray-600"}`}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
          <button onClick={setManual} disabled={loading || !hasAuth || !newPw}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl disabled:opacity-40">
            {loading ? "Setting…" : "Set This Password"}
          </button>
        </div>

        {msg && (
          <div className={`p-3 rounded-xl text-xs font-semibold ${msgType === "ok" ? "bg-emerald-50 border border-emerald-100 text-emerald-700" : "bg-red-50 border border-red-100 text-red-600"}`}>
            {msg}
          </div>
        )}

        <button onClick={onClose} className={`w-full py-2.5 rounded-xl border text-xs font-bold uppercase tracking-widest ${card}`}>
          Close
        </button>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [apiUsers, setApiUsers] = useState<ApiUser[]>([]);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [pwLogs, setPwLogs] = useState<AuditLog[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [retrainJobs, setRetrainJobs] = useState<RetrainJob[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");
  const [pwUser, setPwUser] = useState<ApiUser | null>(null);

  // Patient modal
  const [editPatient, setEditPatient] = useState<EditPatient | null>(null);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [expandedPatient, setExpandedPatient] = useState<number | null>(null);

  // Diagnose tab
  const [patientName, setPatientName] = useState("");
  const [patientNationalId, setPatientNationalId] = useState("");
  const [nationalIdError, setNationalIdError] = useState("");
  const [xrayFile, setXrayFile] = useState<File | null>(null);
  const [xrayPreview, setXrayPreview] = useState<string | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [savedDiagnosis, setSavedDiagnosis] = useState<Diagnosis | null>(null);
  const [savedPatient, setSavedPatient] = useState<Patient | null>(null);
  const [predError, setPredError] = useState("");
  const [predInfo, setPredInfo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Retrain tab
  const [retrainFiles, setRetrainFiles] = useState<File[]>([]);
  const [retrainLabel, setRetrainLabel] = useState("Normal");
  const [uploading, setUploading] = useState(false);
  const [retrainMsg, setRetrainMsg] = useState("");
  const [retrainMsgOk, setRetrainMsgOk] = useState(true);
  const [uploadedCounts, setUploadedCounts] = useState<Record<string,number>>({});
  const [stagedCounts, setStagedCounts] = useState<Record<string,number>>({});
  const [retrainDragging, setRetrainDragging] = useState(false);
  const retrainFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentEmail(data.user?.email?.toLowerCase() ?? ""));
  }, []);

  const loadAll = useCallback(async () => {
    setError("");
    try {
      const [u, d, p, s, m, h, a, j] = await Promise.allSettled([
        adminFetch("/users"), adminFetch("/diagnoses"), adminFetch("/patients"),
        adminFetch("/stats"), adminFetch("/model/info"), adminFetch("/health"),
        adminFetch("/audit?limit=100"), adminFetch("/retrain/jobs"),
      ]);
      if (u.status === "fulfilled") setApiUsers(u.value);
      if (d.status === "fulfilled") setDiagnoses(d.value);
      if (p.status === "fulfilled") setPatients(p.value);
      if (s.status === "fulfilled") setStats(s.value);
      if (m.status === "fulfilled") setModelInfo(m.value);
      if (h.status === "fulfilled") setHealth(h.value);
      if (a.status === "fulfilled") {
        setAuditLogs(a.value);
        setPwLogs(a.value.filter((l: AuditLog) => l.action.includes("password") || l.action.includes("Password")));
      }
      if (j.status === "fulfilled") setRetrainJobs(j.value);
      adminFetch("/retrain/staged").then(s => setStagedCounts(s.counts)).catch(() => {});
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const hasActive = retrainJobs.some(j => j.status === "processing" || j.status === "pending");
    if (!hasActive) return;
    const interval = setInterval(async () => {
      const jobs = await adminFetch("/retrain/jobs").catch(() => null);
      if (jobs) setRetrainJobs(jobs);
    }, 5000);
    return () => clearInterval(interval);
  }, [retrainJobs]);

  const approveUser = async (id: number) => { await adminFetch(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) }); loadAll(); };
  const rejectUser = async (id: number) => {
    const reason = prompt("Rejection reason (optional):") ?? "";
    await adminFetch(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "rejected", rejection_reason: reason }) }); loadAll();
  };
  const deleteUser = async (id: number, name: string) => {
    if (!confirm(`Permanently delete ${name}?`)) return;
    try { await adminFetch(`/users/${id}`, { method: "DELETE" }); loadAll(); } catch (e: any) { setError(e.message); }
  };

  const openEditPatient = (p: Patient) => {
    setEditPatient({ id: p.id, name: p.name, patient_ref_id: p.patient_ref_id || "", hospital: p.hospital || "", clinical_notes: p.clinical_notes || "" });
    setEditError("");
  };
  const saveEditPatient = async () => {
    if (!editPatient) return;
    if (!editPatient.name.trim()) { setEditError("Name is required"); return; }
    if (editPatient.patient_ref_id && !validateRwandaId(editPatient.patient_ref_id)) { setEditError("National ID must be exactly 16 digits"); return; }
    setEditSaving(true); setEditError("");
    try {
      await adminFetch(`/patients/${editPatient.id}`, { method: "PATCH", body: JSON.stringify({ name: editPatient.name, patient_ref_id: editPatient.patient_ref_id || null, hospital: editPatient.hospital || null, clinical_notes: editPatient.clinical_notes || null }) });
      setEditPatient(null); loadAll();
    } catch (e: any) { setEditError(e.message); }
    finally { setEditSaving(false); }
  };
  const deletePatient = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}" and all their diagnoses? Cannot be undone.`)) return;
    try { await adminFetch(`/patients/${id}`, { method: "DELETE" }); loadAll(); } catch (e: any) { setError(e.message); }
  };
  const deletePatientDiagnosis = async (id: number) => {
    if (!confirm("Delete this diagnosis?")) return;
    try { await adminFetch(`/diagnoses/${id}`, { method: "DELETE" }); loadAll(); } catch (e: any) { setError(e.message); }
  };

  const handleNationalIdChange = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 16);
    setPatientNationalId(digits);
    setNationalIdError(digits.length > 0 && digits.length < 16 ? "Must be exactly 16 digits" : "");
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setXrayFile(f); setXrayPreview(URL.createObjectURL(f));
    setPrediction(null); setSavedDiagnosis(null); setPredError(""); setPredInfo("");
  };

  const runPrediction = async () => {
    if (!xrayFile || !patientName.trim()) { setPredError("Enter patient name and upload an X-ray"); return; }
    if (!validateRwandaId(patientNationalId)) { setPredError("Enter a valid 16-digit Rwanda National ID"); return; }
    setPredicting(true); setPredError(""); setPredInfo(""); setPrediction(null); setSavedDiagnosis(null); setSavedPatient(null);
    try {
      let patient: Patient | null = null;
      try {
        patient = await adminFetch("/patients", { method: "POST", body: JSON.stringify({ name: patientName.trim(), patient_ref_id: patientNationalId }) });
        setPatients(prev => [patient!, ...prev.filter(p => p.id !== patient!.id)]);
      } catch (e: any) {
        const { type, existingId } = parseDuplicateError(e.message);
        if ((type === "NATIONAL_ID" || type === "NAME") && existingId) {
          const existing = patients.find(p => p.id === existingId) ?? await adminFetch(`/patients/${existingId}`).catch(() => null);
          if (existing) { patient = existing; setPredInfo(` Using existing patient: ${existing.name}`); }
          else throw e;
        } else throw e;
      }
      if (!patient) throw new Error("Could not resolve patient record");
      setSavedPatient(patient);
      const fd = new FormData(); fd.append("file", xrayFile);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`${API_BASE}/predict`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Prediction failed"); }
      const result: PredictionResult = await res.json();
      setPrediction(result);
      const saved: Diagnosis = await adminFetch("/diagnoses", { method: "POST", body: JSON.stringify({ patient_id: patient.id, xray_filename: xrayFile.name, ai_classification: result.classification, confidence_score: result.confidence_score, tb_probability: result.tb_probability, pneumonia_probability: result.pneumonia_probability, normal_probability: result.normal_probability, unknown_probability: result.unknown_probability ?? 0, ai_explanation: result.explanation, heatmap_b64: result.gradcam_b64 }) });
      setSavedDiagnosis(saved);
      setDiagnoses(prev => [saved, ...prev]);
      loadAll().catch(() => {});
    } catch (e: any) { setPredError(e.message); }
    finally { setPredicting(false); }
  };

  const uploadForRetrain = async () => {
    if (!retrainFiles.length) { setRetrainMsg("Select files first"); setRetrainMsgOk(false); return; }
    setUploading(true); setRetrainMsg("");
    try {
      const fd = new FormData(); retrainFiles.forEach(f => fd.append("files", f));
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch(`${API_BASE}/retrain/upload?label=${encodeURIComponent(retrainLabel)}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
      const r = await res.json();
      setUploadedCounts(prev => ({ ...prev, [retrainLabel]: (prev[retrainLabel] || 0) + r.files_saved }));
      setRetrainMsg(`Uploaded ${r.files_saved} file${r.files_saved !== 1 ? "s" : ""} as "${retrainLabel}"`);
      setRetrainMsgOk(true);
      setRetrainFiles([]);
      // Refresh staged counts from server
      adminFetch("/retrain/staged").then(s => setStagedCounts(s.counts)).catch(() => {});
    } catch (e: any) { setRetrainMsg(e.message); setRetrainMsgOk(false); }
    finally { setUploading(false); }
  };

  const triggerRetrain = async () => {
    if (!window.confirm("Start retraining? This may take several minutes and runs in the background.")) return;
    try {
      const job = await adminFetch("/retrain/trigger", { method: "POST" });
      setRetrainMsg(`Retraining job #${job.id} started — check status on the right`);
      setRetrainMsgOk(true);
      setUploadedCounts({});
      setStagedCounts({});
      loadAll();
    }
    catch (e: any) { setRetrainMsg(e.message); setRetrainMsgOk(false); }
  };

  if (!ADMIN_EMAILS.has(currentEmail) && currentEmail !== "") {
    return <div className="min-h-screen flex items-center justify-center"><p>Not authorized</p></div>;
  }

  const bg = isDark ? "bg-zinc-950" : "bg-gray-50";
  const card = isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-gray-100";
  const text = isDark ? "text-zinc-100" : "text-gray-900";
  const sub = isDark ? "text-zinc-500" : "text-gray-400";
  const inp = `w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${card}`;

  const tabs: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: "" },
    { id: "users", label: "Users", icon: "", badge: apiUsers.filter(u => u.status === "pending").length || undefined },
    { id: "predictions", label: "Predictions", icon: "", badge: diagnoses.length || undefined },
    { id: "patients", label: "Patients", icon: "", badge: patients.length || undefined },
    { id: "diagnose", label: "Diagnose", icon: "" },
    { id: "retrain", label: "Retrain AI", icon: "" },
    { id: "model", label: "Model", icon: "" },
    { id: "passwords", label: "Passwords", icon: "" },
    { id: "audit", label: "Audit Log", icon: "" },
  ];

  return (
    <div className={`min-h-screen ${bg} ${text} font-sans transition-colors`}>

      {/* Password Modal */}
      {pwUser && <PasswordModal user={pwUser} onClose={() => setPwUser(null)} isDark={isDark} card={card} sub={sub} />}

      {/* Edit Patient Modal */}
      {editPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-4 ${card}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Edit Patient</h2>
              <button onClick={() => setEditPatient(null)} className={`w-8 h-8 rounded-lg flex items-center justify-center border text-sm ${card}`}>✕</button>
            </div>
            <div className="space-y-3">
              <div><label className={`block text-[9px] font-bold uppercase tracking-widest mb-1.5 ${sub}`}>Full Name *</label><input value={editPatient.name} onChange={e => setEditPatient({ ...editPatient, name: e.target.value })} className={inp} /></div>
              <div>
                <label className={`block text-[9px] font-bold uppercase tracking-widest mb-1.5 ${sub}`}>Rwanda National ID (16 digits)</label>
                <input value={editPatient.patient_ref_id} onChange={e => setEditPatient({ ...editPatient, patient_ref_id: e.target.value.replace(/\D/g, "").slice(0, 16) })} className={`${inp} font-mono`} maxLength={16} inputMode="numeric" />
              </div>
              <div><label className={`block text-[9px] font-bold uppercase tracking-widest mb-1.5 ${sub}`}>Hospital</label><input value={editPatient.hospital} onChange={e => setEditPatient({ ...editPatient, hospital: e.target.value })} className={inp} /></div>
              <div><label className={`block text-[9px] font-bold uppercase tracking-widest mb-1.5 ${sub}`}>Clinical Notes</label><textarea value={editPatient.clinical_notes} onChange={e => setEditPatient({ ...editPatient, clinical_notes: e.target.value })} className={`${inp} h-20 resize-none`} /></div>
            </div>
            {editError && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-semibold">{editError}</div>}
            <div className="flex gap-2">
              <button onClick={() => setEditPatient(null)} className={`flex-1 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-widest ${card}`}>Cancel</button>
              <button onClick={saveEditPatient} disabled={editSaving} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-40">{editSaving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`sticky top-0 z-30 border-b ${isDark ? "border-zinc-800 bg-zinc-950/90" : "border-gray-100 bg-white/90"} backdrop-blur-md`}>
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-emerald-900 rounded-md flex items-center justify-center"><div className="w-3.5 h-[1.5px] bg-emerald-100 rounded-full" /></div>
            <span className="text-sm font-bold uppercase tracking-widest">Ubuzima</span>
            <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${isDark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>Admin Console</span>
          </div>
          <div className="flex items-center gap-3">
            {health && <div className="flex items-center gap-1.5"><div className={`w-1.5 h-1.5 rounded-full ${health.status === "healthy" ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} /><span className={`text-[9px] font-bold uppercase tracking-widest ${sub}`}>{health.status === "healthy" ? `Live · ${uptime(health.uptime_seconds)}` : "Offline"}</span></div>}
            <button onClick={() => setIsDark(!isDark)} className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm border ${card}`}>{isDark ? "" : ""}</button>
            <button onClick={loadAll} className={`text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border ${card} hover:border-emerald-500`}> Refresh</button>
            <button onClick={() => supabase.auth.signOut()} className="text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black">Sign Out</button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-6 py-6 flex gap-6">
        <aside className="w-48 shrink-0">
          <nav className="space-y-1 sticky top-20">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => { setTab(t.id); setSearch(""); setExpandedPatient(null); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${tab === t.id ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : `${isDark ? "hover:bg-zinc-800 text-zinc-400" : "hover:bg-gray-100 text-gray-500"}`}`}>
                <div className="flex items-center gap-2.5"><span className="text-base">{t.icon}</span><span className="text-[11px] font-bold uppercase tracking-widest">{t.label}</span></div>
                {t.badge !== undefined && t.badge > 0 && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${tab === t.id ? "bg-white/20 text-white" : "bg-red-500 text-white"}`}>{t.badge}</span>}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0">
          {error && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-semibold flex items-center gap-2"><span></span> {error} <button onClick={() => setError("")} className="ml-auto">✕</button></div>}

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <div className="space-y-6">
              <div><h1 className="text-2xl font-bold tracking-tight">System Overview</h1><p className={`text-sm mt-1 ${sub}`}>Real-time status of Ubuzima Connect</p></div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[{ label: "Radiologists", value: stats?.total_radiologists ?? "—" }, { label: "Pending Approval", value: stats?.pending_requests ?? 0 }, { label: "Total Patients", value: patients.length }, { label: "Diagnoses Made", value: diagnoses.length }].map(s => (
                  <div key={s.label} className={`p-5 rounded-2xl border ${card}`}><div className={`text-[9px] font-bold uppercase tracking-widest mb-3 ${sub}`}>{s.label}</div><div className="text-3xl font-black">{s.value}</div></div>
                ))}
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <div className={`p-5 rounded-2xl border ${card}`}>
                  <div className={`text-[9px] font-bold uppercase tracking-widest mb-4 ${sub}`}>Model Status</div>
                  {modelInfo ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${modelInfo.status === "loaded" ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"}`} /><span className="text-sm font-bold capitalize">{modelInfo.status}</span></div>
                      <div className={`text-xs font-mono ${sub}`}>{modelInfo.architecture}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className={`p-2.5 rounded-xl ${isDark ? "bg-zinc-800" : "bg-gray-50"}`}><div className={`text-[8px] uppercase ${sub}`}>Size</div><div className="text-sm font-bold mt-0.5">{modelInfo.size_mb} MB</div></div>
                        <div className={`p-2.5 rounded-xl ${isDark ? "bg-zinc-800" : "bg-gray-50"}`}><div className={`text-[8px] uppercase ${sub}`}>Classes</div><div className="text-sm font-bold mt-0.5">{modelInfo.classes?.length}</div></div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">{modelInfo.classes?.map(c => <span key={c} className={`text-[9px] font-bold uppercase px-2 py-1 rounded-lg ${classBadge(c)}`}>{c}</span>)}</div>
                    </div>
                  ) : <div className={`text-sm ${sub}`}>Loading…</div>}
                </div>
                <div className={`p-5 rounded-2xl border ${card}`}>
                  <div className={`text-[9px] font-bold uppercase tracking-widest mb-4 ${sub}`}>Recent Predictions</div>
                  <div className="space-y-2">
                    {diagnoses.slice(0, 6).map(d => {
                      const pt = patients.find(p => p.id === d.patient_id);
                      return (
                        <div key={d.id} className={`flex items-center justify-between p-2.5 rounded-xl ${isDark ? "bg-zinc-800" : "bg-gray-50"}`}>
                          <div className="flex items-center gap-2"><span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${classBadge(d.ai_classification)}`}>{d.ai_classification}</span><span className={`text-[10px] ${sub}`}>{pt?.name ?? `P#${d.patient_id}`}</span></div>
                          <span className="text-[10px] font-bold">{d.confidence_score.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                    {diagnoses.length === 0 && <div className={`text-sm ${sub}`}>No predictions yet</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── USERS ── */}
          {tab === "users" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold tracking-tight">User Management</h1><p className={`text-sm mt-1 ${sub}`}>{apiUsers.length} users</p></div>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className={`px-3 py-2 rounded-xl border text-sm w-48 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${card}`} />
              </div>
              <div className={`rounded-2xl border overflow-hidden ${card}`}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className={`border-b ${isDark ? "border-zinc-800" : "border-gray-100"}`}>
                      {["ID","Name","Email","Hospital","License","Role","Status","Joined","Actions"].map(h => (
                        <th key={h} className={`text-left px-4 py-3 text-[9px] font-bold uppercase tracking-widest ${sub}`}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {apiUsers.filter(u => !search || u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())).map(u => (
                        <tr key={u.id} className={`border-b last:border-0 ${isDark ? "border-zinc-800/50 hover:bg-zinc-800/30" : "border-gray-50 hover:bg-gray-50/50"} transition-colors`}>
                          <td className="px-4 py-3 text-xs font-mono text-gray-400">#{u.id}</td>
                          <td className="px-4 py-3 text-sm font-semibold">{u.full_name}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{u.email}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{u.hospital || "—"}</td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-500">{u.license_number || "—"}</td>
                          <td className="px-4 py-3"><span className="text-[9px] font-bold uppercase bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{u.role}</span></td>
                          <td className="px-4 py-3"><span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${u.status === "approved" ? "bg-emerald-100 text-emerald-700" : u.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{u.status}</span></td>
                          <td className={`px-4 py-3 text-xs ${sub}`}>{fmt(u.created_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 flex-wrap">
                              {u.status === "pending" && <>
                                <button onClick={() => approveUser(u.id)} className="text-[9px] font-bold uppercase px-2 py-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-400">Approve</button>
                                <button onClick={() => rejectUser(u.id)} className="text-[9px] font-bold uppercase px-2 py-1 bg-red-100 text-red-600 rounded-lg hover:bg-red-200">Reject</button>
                              </>}
                              {u.status === "approved" && (
                                <button onClick={() => setPwUser(u)} className="text-[9px] font-bold uppercase px-2 py-1 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"> Password</button>
                              )}
                              <button onClick={() => deleteUser(u.id, u.full_name)} className="text-[9px] font-bold uppercase px-2 py-1 bg-zinc-100 text-zinc-500 rounded-lg hover:bg-red-100 hover:text-red-600">Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {apiUsers.length === 0 && <tr><td colSpan={9} className={`px-4 py-8 text-center text-sm ${sub}`}>No users yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── PREDICTIONS ── */}
          {tab === "predictions" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold tracking-tight">All Predictions</h1><p className={`text-sm mt-1 ${sub}`}>{diagnoses.length} diagnoses</p></div>
                <div className="flex gap-2 flex-wrap">
                  {["All","Normal","Tuberculosis","Pneumonia","Unknown"].map(f => (
                    <button key={f} onClick={() => setSearch(f === "All" ? "" : f)} className={`text-[9px] font-bold uppercase px-3 py-1.5 rounded-lg border transition-all ${(f === "All" && !search) || search === f ? "bg-emerald-500 text-white border-emerald-500" : `${card} hover:border-emerald-500`}`}>{f}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {["Normal","Tuberculosis","Pneumonia","Unknown"].map(cls => {
                  const count = diagnoses.filter(d => d.ai_classification === cls).length;
                  const pct = diagnoses.length ? Math.round((count / diagnoses.length) * 100) : 0;
                  return (
                    <div key={cls} className={`p-4 rounded-2xl border ${card}`}>
                      <div className={`text-[9px] font-bold uppercase mb-2 ${sub}`}>{cls}</div>
                      <div className="text-2xl font-black">{count}</div>
                      <div className={`mt-2 h-1 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-gray-100"}`}>
                        <div className={`h-full rounded-full ${cls === "Normal" ? "bg-emerald-500" : cls === "Tuberculosis" ? "bg-red-500" : cls === "Pneumonia" ? "bg-orange-500" : "bg-zinc-400"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className={`text-[9px] mt-1 ${sub}`}>{pct}%</div>
                    </div>
                  );
                })}
              </div>
              <div className={`rounded-2xl border overflow-hidden ${card}`}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className={`border-b ${isDark ? "border-zinc-800" : "border-gray-100"}`}>
                      {["ID","Patient","National ID","Result","Confidence","TB%","Pneumonia%","Normal%","Verified","Date"].map(h => (
                        <th key={h} className={`text-left px-4 py-3 text-[9px] font-bold uppercase tracking-widest ${sub}`}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {diagnoses.filter(d => !search || d.ai_classification === search).map(d => {
                        const pt = patients.find(p => p.id === d.patient_id);
                        return (
                          <tr key={d.id} className={`border-b last:border-0 ${isDark ? "border-zinc-800/50 hover:bg-zinc-800/30" : "border-gray-50 hover:bg-gray-50/50"}`}>
                            <td className="px-4 py-3 text-xs font-mono text-gray-400">#{d.id}</td>
                            <td className="px-4 py-3 text-sm font-semibold">{pt?.name ?? `P#${d.patient_id}`}</td>
                            <td className="px-4 py-3 text-xs font-mono text-gray-500">{pt?.patient_ref_id ?? "—"}</td>
                            <td className="px-4 py-3"><span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${classBadge(d.ai_classification)}`}>{d.ai_classification}</span></td>
                            <td className="px-4 py-3"><div className="flex items-center gap-2"><div className={`w-12 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-gray-100"}`}><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${d.confidence_score}%` }} /></div><span className="text-xs font-bold">{d.confidence_score.toFixed(1)}%</span></div></td>
                            <td className="px-4 py-3 text-xs font-mono">{(d.tb_probability * 100).toFixed(1)}%</td>
                            <td className="px-4 py-3 text-xs font-mono">{(d.pneumonia_probability * 100).toFixed(1)}%</td>
                            <td className="px-4 py-3 text-xs font-mono">{(d.normal_probability * 100).toFixed(1)}%</td>
                            <td className="px-4 py-3"><span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${d.radiologist_verified ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>{d.radiologist_verified ? "Yes" : "Pending"}</span></td>
                            <td className={`px-4 py-3 text-xs ${sub}`}>{fmt(d.created_at)}</td>
                          </tr>
                        );
                      })}
                      {diagnoses.length === 0 && <tr><td colSpan={10} className={`px-4 py-8 text-center text-sm ${sub}`}>No predictions yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── PATIENTS ── */}
          {tab === "patients" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold tracking-tight">Patients</h1><p className={`text-sm mt-1 ${sub}`}>{patients.length} registered</p></div>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or ID…" className={`px-3 py-2 rounded-xl border text-sm w-56 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${card}`} />
              </div>
              <div className="space-y-3">
                {patients.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.patient_ref_id && p.patient_ref_id.includes(search))).map(p => {
                  const ptDiagnoses = diagnoses.filter(d => d.patient_id === p.id);
                  const isExpanded = expandedPatient === p.id;
                  return (
                    <div key={p.id} className={`rounded-2xl border overflow-hidden ${card}`}>
                      <div className="flex items-center gap-4 px-5 py-4">
                        <button onClick={() => setExpandedPatient(isExpanded ? null : p.id)} className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs border flex-shrink-0 ${isDark ? "border-zinc-700 hover:bg-zinc-700" : "border-gray-200 hover:bg-gray-100"}`}>{isExpanded ? "" : ""}</button>
                        <div className="flex-1 grid grid-cols-5 gap-4 items-center min-w-0">
                          <div><div className={`text-[8px] font-bold uppercase ${sub} mb-0.5`}>Name</div><div className="text-sm font-semibold truncate">{p.name}</div></div>
                          <div><div className={`text-[8px] font-bold uppercase ${sub} mb-0.5`}>National ID</div><div className="text-xs font-mono text-gray-500">{p.patient_ref_id || "—"}</div></div>
                          <div><div className={`text-[8px] font-bold uppercase ${sub} mb-0.5`}>Hospital</div><div className="text-xs text-gray-500 truncate">{p.hospital || "—"}</div></div>
                          <div><div className={`text-[8px] font-bold uppercase ${sub} mb-0.5`}>Scans</div><span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${ptDiagnoses.length > 0 ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-500"}`}>{ptDiagnoses.length} scan{ptDiagnoses.length !== 1 ? "s" : ""}</span></div>
                          <div><div className={`text-[8px] font-bold uppercase ${sub} mb-0.5`}>Registered</div><div className={`text-xs ${sub}`}>{fmt(p.created_at)}</div></div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button onClick={() => openEditPatient(p)} className="text-[9px] font-bold uppercase px-2.5 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">Edit</button>
                          <button onClick={() => deletePatient(p.id, p.name)} className="text-[9px] font-bold uppercase px-2.5 py-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200">Delete</button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className={`border-t ${isDark ? "border-zinc-800 bg-zinc-950/50" : "border-gray-100 bg-gray-50/50"} px-5 py-4`}>
                          <div className={`text-[9px] font-bold uppercase tracking-widest mb-3 ${sub}`}>Diagnoses for {p.name}</div>
                          {ptDiagnoses.length === 0 ? <div className={`text-sm ${sub}`}>No diagnoses yet.</div> : (
                            <div className="space-y-2">
                              {ptDiagnoses.map(d => (
                                <div key={d.id} className={`flex items-center gap-4 p-3 rounded-xl border ${card}`}>
                                  <div className="flex-1 grid grid-cols-5 gap-3 items-center">
                                    <div><div className={`text-[8px] font-bold uppercase ${sub} mb-0.5`}>Result</div><span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${classBadge(d.ai_classification)}`}>{d.ai_classification}</span></div>
                                    <div><div className={`text-[8px] font-bold uppercase ${sub} mb-0.5`}>Confidence</div><div className="text-xs font-bold">{d.confidence_score.toFixed(1)}%</div></div>
                                    <div><div className={`text-[8px] font-bold uppercase ${sub} mb-0.5`}>TB / Pneumonia / Normal</div><div className="text-xs font-mono text-gray-500">{(d.tb_probability*100).toFixed(0)}% / {(d.pneumonia_probability*100).toFixed(0)}% / {(d.normal_probability*100).toFixed(0)}%</div></div>
                                    <div><div className={`text-[8px] font-bold uppercase ${sub} mb-0.5`}>Verified</div><span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${d.radiologist_verified ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>{d.radiologist_verified ? "Yes" : "Pending"}</span></div>
                                    <div><div className={`text-[8px] font-bold uppercase ${sub} mb-0.5`}>Date</div><div className={`text-[10px] ${sub}`}>{fmt(d.created_at)}</div></div>
                                  </div>
                                  <button onClick={() => deletePatientDiagnosis(d.id)} className="text-[9px] font-bold uppercase px-2 py-1 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 flex-shrink-0">Delete</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {patients.length === 0 && <div className={`p-8 rounded-2xl border text-center text-sm ${card} ${sub}`}>No patients yet</div>}
              </div>
            </div>
          )}

          {/* ── DIAGNOSE ── */}
          {tab === "diagnose" && (
            <div className="space-y-6">
              <div><h1 className="text-2xl font-bold tracking-tight">Diagnostic Station</h1><p className={`text-sm mt-1 ${sub}`}>Upload a chest X-ray for instant AI analysis</p></div>
              <div className="grid lg:grid-cols-2 gap-6">
                <div className={`p-6 rounded-2xl border ${card} space-y-4`}>
                  <div className={`text-[9px] font-bold uppercase tracking-widest ${sub}`}>Patient Information</div>
                  <div className="space-y-3">
                    <div><label className={`block text-[9px] font-bold uppercase tracking-widest mb-1.5 ${sub}`}>Patient Full Name *</label><input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Jean Uwimana" className={inp} /></div>
                    <div>
                      <label className={`block text-[9px] font-bold uppercase tracking-widest mb-1.5 ${sub}`}>Rwanda National ID * <span className="normal-case font-normal">(16 digits)</span></label>
                      <input value={patientNationalId} onChange={e => handleNationalIdChange(e.target.value)} placeholder="1199080012345678" maxLength={16} inputMode="numeric" className={`${inp} font-mono ${nationalIdError ? "border-red-400" : patientNationalId.length === 16 ? "border-emerald-400" : ""}`} />
                      <div className="flex justify-between mt-1">
                        {nationalIdError ? <span className="text-[10px] text-red-500 font-semibold">{nationalIdError}</span> : patientNationalId.length === 16 ? <span className="text-[10px] text-emerald-600 font-semibold"> Valid</span> : <span className={`text-[10px] ${sub}`}>Must be exactly 16 digits</span>}
                        <span className={`text-[10px] font-mono ${sub}`}>{patientNationalId.length}/16</span>
                      </div>
                    </div>
                  </div>
                  <div className={`text-[9px] font-bold uppercase tracking-widest ${sub}`}>X-Ray Image</div>
                  <div onClick={() => fileRef.current?.click()} className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${xrayPreview ? "border-emerald-300 bg-emerald-50/30" : "border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/20"}`}>
                    {xrayPreview ? <img src={xrayPreview} alt="X-ray" className="max-h-48 mx-auto rounded-xl object-contain" /> : <div className="space-y-2"><div className="text-3xl">🩻</div><div className="text-sm font-semibold text-gray-600">Click to upload X-ray</div><div className={`text-xs ${sub}`}>JPG or PNG, max 15MB</div></div>}
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={handleFileChange} className="hidden" />
                  </div>
                  {predInfo && <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold">{predInfo}</div>}
                  {predError && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-semibold">{predError}</div>}
                  <button onClick={runPrediction} disabled={predicting || !xrayFile || !patientName.trim() || !validateRwandaId(patientNationalId)} className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-sm">{predicting ? "Analyzing X-ray…" : "Run AI Diagnosis"}</button>
                </div>
                <div className={`p-6 rounded-2xl border ${card}`}>
                  <div className={`text-[9px] font-bold uppercase tracking-widest mb-4 ${sub}`}>Diagnostic Result</div>
                  {!prediction && !predicting && <div className="flex flex-col items-center justify-center h-64 space-y-3"><div className="text-5xl opacity-20"></div><div className={`text-sm font-bold uppercase tracking-widest ${sub}`}>Awaiting Scan</div></div>}
                  {predicting && <div className="flex flex-col items-center justify-center h-64 space-y-4"><div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" /><div className={`text-sm ${sub}`}>Analyzing with ResNet-50…</div></div>}
                  {prediction && (
                    <div className="space-y-4">
                      <div className={`p-4 rounded-2xl text-center ${prediction.classification === "Normal" ? "bg-emerald-50 border border-emerald-200" : prediction.classification === "Tuberculosis" ? "bg-red-50 border border-red-200" : prediction.classification === "Unknown" ? "bg-zinc-50 border border-zinc-200" : "bg-orange-50 border border-orange-200"}`}>
                        <div className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${sub}`}>AI Classification</div>
                        <div className={`text-3xl font-black ${prediction.classification === "Normal" ? "text-emerald-700" : prediction.classification === "Tuberculosis" ? "text-red-700" : prediction.classification === "Unknown" ? "text-zinc-600" : "text-orange-700"}`}>{prediction.classification}</div>
                        <div className={`text-sm mt-1 font-semibold ${sub}`}>{prediction.confidence_score.toFixed(1)}% confidence</div>
                      </div>
                      <div className="space-y-2">
                        {[{ label: "Normal", value: prediction.normal_probability, color: "bg-emerald-500" }, { label: "Pneumonia", value: prediction.pneumonia_probability, color: "bg-orange-500" }, { label: "Tuberculosis", value: prediction.tb_probability, color: "bg-red-500" }].map(r => (
                          <div key={r.label} className="space-y-1">
                            <div className="flex justify-between"><span className={`text-[9px] font-bold uppercase tracking-widest ${sub}`}>{r.label}</span><span className="text-xs font-bold">{(r.value * 100).toFixed(1)}%</span></div>
                            <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-gray-100"}`}><div className={`h-full rounded-full ${r.color} transition-all duration-700`} style={{ width: `${r.value * 100}%` }} /></div>
                          </div>
                        ))}
                      </div>
                      {savedDiagnosis && <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold"> Diagnosis #{savedDiagnosis.id} saved</div>}
                      <button onClick={() => { setPrediction(null); setSavedDiagnosis(null); setSavedPatient(null); setXrayFile(null); setXrayPreview(null); setPatientName(""); setPatientNationalId(""); setNationalIdError(""); setPredError(""); setPredInfo(""); }} className={`w-full py-2.5 rounded-xl border text-xs font-bold uppercase tracking-widest ${card} hover:border-emerald-400`}>New Scan</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── RETRAIN ── */}
          {tab === "retrain" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Retrain AI Model</h1>
                <p className={`text-sm mt-1 ${sub}`}>Upload labelled X-rays to improve the model — minimum 3 images per class</p>
              </div>
              <div className="grid lg:grid-cols-2 gap-6">

                {/* Left: Upload panel */}
                <div className={`p-6 rounded-2xl border ${card} space-y-4`}>

                  {/* Step 1: Pick label */}
                  <div>
                    <div className={`text-[9px] font-bold uppercase tracking-widest mb-3 ${sub}`}>Step 1 — Choose Diagnosis Label</div>
                    <div className="grid grid-cols-2 gap-2">
                      {["Normal","Pneumonia","Tuberculosis","Unknown"].map(l => (
                        <button key={l} onClick={() => { setRetrainLabel(l); setRetrainFiles([]); }}
                          className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${retrainLabel === l
                            ? l === "Normal" ? "border-emerald-500 bg-emerald-500 text-white"
                              : l === "Tuberculosis" ? "border-red-500 bg-red-500 text-white"
                              : l === "Pneumonia" ? "border-orange-500 bg-orange-500 text-white"
                              : "border-zinc-500 bg-zinc-500 text-white"
                            : `border-gray-200 ${isDark ? "text-zinc-300 hover:border-zinc-500" : "text-gray-600 hover:border-gray-300"}`
                          }`}>
                          {l}
                          {uploadedCounts[l] ? <span className="block text-[9px] font-normal opacity-80">{uploadedCounts[l]} uploaded</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Step 2: Upload zone */}
                  <div>
                    <div className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${sub}`}>Step 2 — Upload X-rays for "{retrainLabel}"</div>
                    <div
                      onDragOver={e => { e.preventDefault(); setRetrainDragging(true); }}
                      onDragLeave={() => setRetrainDragging(false)}
                      onDrop={e => { e.preventDefault(); setRetrainDragging(false); setRetrainFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"))); }}
                      onClick={() => retrainFileRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                        retrainDragging ? "border-blue-400 bg-blue-50 scale-[1.01]" :
                        retrainFiles.length > 0 ? "border-blue-300 bg-blue-50/30" :
                        "border-gray-200 hover:border-blue-300"
                      }`}>
                      {retrainFiles.length > 0
                        ? <div className="space-y-1"><div className="text-lg font-bold text-blue-700">{retrainFiles.length} file{retrainFiles.length !== 1 ? "s" : ""} ready</div><div className={`text-xs ${sub}`}>Click to change selection</div></div>
                        : <div className="space-y-1"><div className="text-sm font-semibold text-gray-500">Drop images here or click to browse</div><div className={`text-xs ${sub}`}>JPG, PNG, any image format</div></div>
                      }
                      <input ref={retrainFileRef} type="file" accept="image/*" multiple onChange={e => setRetrainFiles(Array.from(e.target.files || []))} className="hidden" />
                    </div>
                  </div>

                  <button onClick={uploadForRetrain} disabled={uploading || !retrainFiles.length}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl disabled:opacity-40 text-sm">
                    {uploading ? "Uploading…" : retrainFiles.length ? `Upload ${retrainFiles.length} file${retrainFiles.length !== 1 ? "s" : ""} as "${retrainLabel}"` : "Select files to upload"}
                  </button>

                  {/* Staged image summary — shows what's on disk ready to train */}
                  {(() => {
                    const allStaged = { ...stagedCounts };
                    const stagedClasses = Object.keys(allStaged).filter(k => allStaged[k] > 0);
                    const notReady = stagedClasses.filter(k => allStaged[k] < 3);
                    const canTrigger = stagedClasses.length >= 2 && notReady.length === 0;
                    return (
                      <>
                        <div className={`p-3 rounded-xl border ${isDark ? "border-zinc-700 bg-zinc-800" : "border-gray-100 bg-gray-50"} space-y-2`}>
                          <div className={`text-[9px] font-bold uppercase tracking-widest ${sub} mb-1`}>Images staged for training</div>
                          {["Normal","Pneumonia","Tuberculosis","Unknown"].map(l => {
                            const n = allStaged[l] || 0;
                            if (n === 0) return (
                              <div key={l} className="flex justify-between items-center">
                                <span className={`text-xs ${sub}`}>{l}</span>
                                <span className="text-xs text-gray-400 italic">Not uploaded — will be skipped</span>
                              </div>
                            );
                            const ok = n >= 3;
                            return (
                              <div key={l} className="flex justify-between items-center">
                                <span className={`text-xs font-semibold`}>{l}</span>
                                <span className={`text-xs font-bold ${ok ? "text-emerald-600" : "text-amber-600"}`}>
                                  {n} image{n !== 1 ? "s" : ""} {ok ? "— ready" : `— upload ${3 - n} more`}
                                </span>
                              </div>
                            );
                          })}
                          {stagedClasses.length === 0 && (
                            <div className={`text-xs ${sub} italic`}>Nothing uploaded yet — upload images above first</div>
                          )}
                          {stagedClasses.length === 1 && (
                            <div className="text-xs text-amber-600 font-semibold mt-1">Need at least 2 classes to retrain</div>
                          )}
                        </div>

                        {/* Step 3: Trigger */}
                        <div>
                          <div className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${sub}`}>Step 3 — Start Retraining</div>
                          <button onClick={triggerRetrain} disabled={!canTrigger}
                            className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm">
                            {canTrigger ? "Trigger Retraining Job" : notReady.length > 0 ? `Upload more images (${notReady.join(", ")} need 3+)` : "Upload images to at least 2 classes first"}
                          </button>
                        </div>
                      </>
                    );
                  })()}

                  {retrainMsg && (
                    <div className={`p-3 rounded-xl text-xs font-semibold border ${retrainMsgOk ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"}`}>
                      {retrainMsg}
                    </div>
                  )}
                </div>

                {/* Right: Jobs */}
                <div className={`p-6 rounded-2xl border ${card} space-y-4`}>
                  <div className={`text-[9px] font-bold uppercase tracking-widest ${sub}`}>Retrain Jobs</div>
                  {retrainJobs.length === 0
                    ? <div className={`text-sm ${sub}`}>No retrain jobs yet</div>
                    : <div className="space-y-3">
                        {retrainJobs.map(j => (
                          <div key={j.id} className={`p-4 rounded-xl border ${
                            j.status === "failed" ? "border-red-200 bg-red-50" :
                            j.status === "completed" ? "border-emerald-200 bg-emerald-50" :
                            isDark ? "bg-zinc-800 border-zinc-700" : "bg-gray-50 border-gray-100"
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold">Job #{j.id}</span>
                              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                j.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                                j.status === "processing" ? "bg-blue-100 text-blue-700" :
                                j.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                              }`}>{j.status}</span>
                            </div>
                            {j.final_val_acc && <div className={`text-xs ${sub}`}>Validation Accuracy: {(j.final_val_acc * 100).toFixed(1)}%</div>}
                            {j.error_message && (
                              <div className="mt-2 p-2.5 rounded-lg bg-red-100">
                                <div className="text-xs text-red-700">{j.error_message}</div>
                              </div>
                            )}
                            <div className={`text-[9px] mt-2 ${sub}`}>{fmt(j.created_at)}</div>
                          </div>
                        ))}
                      </div>
                  }
                </div>
              </div>
            </div>
          )}

          {/* ── MODEL ── */}
          {tab === "model" && (
            <div className="space-y-6">
              <div><h1 className="text-2xl font-bold tracking-tight">AI Model</h1><p className={`text-sm mt-1 ${sub}`}>ResNet-50 production model</p></div>
              {modelInfo && (
                <div className="grid lg:grid-cols-2 gap-4">
                  <div className={`p-6 rounded-2xl border ${card} space-y-4`}>
                    <div className={`text-[9px] font-bold uppercase ${sub}`}>Details</div>
                    {[{ label: "Status", value: modelInfo.status }, { label: "Size", value: `${modelInfo.size_mb} MB` }, { label: "Input", value: modelInfo.input_shape?.join(" × ") }, { label: "Modified", value: fmt(modelInfo.last_modified) }].map(r => (
                      <div key={r.label} className={`flex justify-between py-2 border-b last:border-0 ${isDark ? "border-zinc-800" : "border-gray-50"}`}><span className={`text-xs font-bold uppercase tracking-widest ${sub}`}>{r.label}</span><span className="text-sm font-semibold">{r.value}</span></div>
                    ))}
                  </div>
                  <div className={`p-6 rounded-2xl border ${card} space-y-4`}>
                    <div className={`text-[9px] font-bold uppercase ${sub}`}>Classes</div>
                    <div className="flex flex-wrap gap-2">{modelInfo.classes?.map(c => <span key={c} className={`text-sm font-bold px-4 py-2 rounded-xl ${classBadge(c)}`}>{c}</span>)}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── AUDIT ── */}
          {tab === "passwords" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Password Management</h1>
                  <p className={`text-sm mt-1 ${sub}`}>Set passwords for users and view all password activity</p>
                </div>
              </div>

              {/* Quick set password for any approved user */}
              <div className={`p-5 rounded-2xl border ${card}`}>
                <div className={`text-[9px] font-bold uppercase tracking-widest mb-4 ${sub}`}>Set Password for User</div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className={`border-b ${isDark ? "border-zinc-800" : "border-gray-100"}`}>
                      {["User","Email","Status","Last Password Action","Actions"].map(h => (
                        <th key={h} className={`text-left px-4 py-3 text-[9px] font-bold uppercase tracking-widest ${sub}`}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {apiUsers.filter(u => u.status === "approved").map(u => {
                        const lastPwLog = pwLogs.filter(l => l.entity_id === u.id).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                        return (
                          <tr key={u.id} className={`border-b last:border-0 ${isDark ? "border-zinc-800/50 hover:bg-zinc-800/30" : "border-gray-50 hover:bg-gray-50/50"}`}>
                            <td className="px-4 py-3 text-sm font-semibold">{u.full_name}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{u.email}</td>
                            <td className="px-4 py-3"><span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Approved</span></td>
                            <td className={`px-4 py-3 text-xs ${sub}`}>
                              {lastPwLog ? (
                                <span>{lastPwLog.action === "admin_generate_password" ? " Generated" : "✏️ Set manually"} · {fmt(lastPwLog.timestamp)}</span>
                              ) : <span className="text-gray-400 italic">No record</span>}
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => setPwUser(u)}
                                className="text-[9px] font-bold uppercase px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">
                                 Manage Password
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {apiUsers.filter(u => u.status === "approved").length === 0 && (
                        <tr><td colSpan={5} className={`px-4 py-8 text-center text-sm ${sub}`}>No approved users yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Password activity log */}
              <div className={`p-5 rounded-2xl border ${card}`}>
                <div className={`text-[9px] font-bold uppercase tracking-widest mb-4 ${sub}`}>Password Activity Log</div>
                {pwLogs.length === 0 ? (
                  <div className={`text-sm ${sub} text-center py-8`}>No password actions recorded yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className={`border-b ${isDark ? "border-zinc-800" : "border-gray-100"}`}>
                        {["#","Action","Target User","Done By (Admin ID)","When"].map(h => (
                          <th key={h} className={`text-left px-4 py-3 text-[9px] font-bold uppercase tracking-widest ${sub}`}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {pwLogs.map(l => {
                          const targetUser = apiUsers.find(u => u.id === l.entity_id);
                          return (
                            <tr key={l.id} className={`border-b last:border-0 ${isDark ? "border-zinc-800/50" : "border-gray-50"}`}>
                              <td className={`px-4 py-3 text-xs font-mono ${sub}`}>#{l.id}</td>
                              <td className="px-4 py-3">
                                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                  l.action === "admin_generate_password" ? "bg-purple-100 text-purple-700" :
                                  l.action === "admin_set_password" ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-600"
                                }`}>
                                  {l.action === "admin_generate_password" ? " Auto-Generated" :
                                   l.action === "admin_set_password" ? "✏️ Manually Set" : l.action}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm">{targetUser ? `${targetUser.full_name}` : `User #${l.entity_id}`}</td>
                              <td className={`px-4 py-3 text-xs font-mono ${sub}`}>Admin #{l.user_id}</td>
                              <td className={`px-4 py-3 text-xs ${sub}`}>{fmt(l.timestamp)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "audit" && (
            <div className="space-y-6">
              <div><h1 className="text-2xl font-bold tracking-tight">Audit Log</h1><p className={`text-sm mt-1 ${sub}`}>Last {auditLogs.length} events</p></div>
              <div className={`rounded-2xl border overflow-hidden ${card}`}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className={`border-b ${isDark ? "border-zinc-800" : "border-gray-100"}`}>
                      {["#","User ID","Action","Entity","Entity ID","Timestamp"].map(h => (
                        <th key={h} className={`text-left px-4 py-3 text-[9px] font-bold uppercase tracking-widest ${sub}`}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {auditLogs.map(l => (
                        <tr key={l.id} className={`border-b last:border-0 ${isDark ? "border-zinc-800/50 hover:bg-zinc-800/30" : "border-gray-50 hover:bg-gray-50/50"}`}>
                          <td className="px-4 py-2.5 text-xs font-mono text-gray-400">#{l.id}</td>
                          <td className="px-4 py-2.5 text-xs font-mono text-gray-400">{l.user_id}</td>
                          <td className="px-4 py-2.5"><span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${l.action.includes("password") ? "bg-purple-100 text-purple-700" : l.action.includes("predict") ? "bg-blue-100 text-blue-700" : l.action.includes("approve") ? "bg-emerald-100 text-emerald-700" : l.action.includes("delete") ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-600"}`}>{l.action}</span></td>
                          <td className={`px-4 py-2.5 text-xs ${sub}`}>{l.entity || "—"}</td>
                          <td className={`px-4 py-2.5 text-xs font-mono ${sub}`}>{l.entity_id ?? "—"}</td>
                          <td className={`px-4 py-2.5 text-xs ${sub}`}>{fmt(l.timestamp)}</td>
                        </tr>
                      ))}
                      {auditLogs.length === 0 && <tr><td colSpan={6} className={`px-4 py-8 text-center text-sm ${sub}`}>No audit logs yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}