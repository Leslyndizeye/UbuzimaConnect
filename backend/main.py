from dotenv import load_dotenv
load_dotenv()

# main.py
# Ubuzima Connect — FastAPI Backend
# Run: uvicorn main:app --reload --port 8000
#
# Endpoints:
#  POST   /auth/register          – create user profile (called after Firebase signup)
#  GET    /auth/me                 – get own profile
#  GET    /users                   – [admin] list all users
#  PATCH  /users/{id}/status       – [admin] approve / reject / revoke
#  POST   /patients                – create patient record
#  GET    /patients                – list own patients (or all for admin)
#  DELETE /patients/{id}           – delete patient + diagnoses
#  POST   /predict                 – run AI prediction (no DB save)
#  POST   /diagnoses               – save a prediction to DB
#  GET    /diagnoses               – list own diagnoses
#  GET    /diagnoses/{id}          – single diagnosis
#  PATCH  /diagnoses/{id}/verify   – radiologist verify / override
#  DELETE /diagnoses/{id}          – delete diagnosis
#  POST   /retrain/upload          – bulk upload labelled X-rays
#  POST   /retrain/trigger         – trigger retraining job
#  GET    /retrain/jobs            – list retrain jobs
#  GET    /retrain/jobs/{id}       – job status
#  GET    /model/info              – model metadata
#  GET    /stats                   – system stats (admin)
#  GET    /audit                   – audit logs (admin)
#  GET    /health                  – uptime check

import os
import time
import uuid
import shutil
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List

from fastapi import (
    FastAPI, File, UploadFile, HTTPException, Depends,
    BackgroundTasks, Query
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import (
    get_db, init_db,
    User, Patient, Diagnosis, XrayUpload, RetrainJob, AuditLog,
    UserStatus, UserRole, DiagnosisClass, RetrainStatus,
)
from schemas import (
    UserCreate, UserOut, UserStatusUpdate,
    PatientCreate, PatientOut,
    PredictionResponse, DiagnosisSave, DiagnosisVerify, DiagnosisOut,
    RetrainJobOut, SystemStats, ModelInfo,
)
from auth import get_current_user, get_admin_user
from src.preprocessing import preprocess_image_for_inference, preprocess_bulk_upload, build_tf_dataset
from src.prediction import predict as run_predict, generate_gradcam, evaluate_on_dataset
from src.model import load_production_model, get_model_info, retrain_model, invalidate_model_cache

# ─────────────────────────────────────────────────────────────
# SUPABASE CONFIG — must be at top so helpers can use it
# ─────────────────────────────────────────────────────────────

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://omoinlmgsdtlzfasydgw.supabase.co")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ANON_KEY_VAL = os.getenv("SUPABASE_ANON_KEY", "").strip()

if not SUPABASE_SERVICE_KEY:
    print("  WARNING: SUPABASE_SERVICE_ROLE_KEY not set — approval emails will not work")
else:
    print(f" Supabase service key loaded (format: {'sb_secret' if SUPABASE_SERVICE_KEY.startswith('sb_') else 'JWT'})")

# ─────────────────────────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────────────────────────

START_TIME = time.time()
UPLOAD_DIR = Path("uploads")
DATA_DIR   = Path("data")
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(
    title="Ubuzima Connect API",
    description=(
        "AI-powered chest X-ray diagnostic API for TB and Pneumonia detection in Rwanda. "
        "ResNet-50 model, 4-class classification: Normal / Pneumonia / TB / Unknown."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_db()
    load_production_model()   # warm up


# ─────────────────────────────────────────────────────────────
# HEALTH
# ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health():
    model = load_production_model()
    return {
        "status":        "healthy",
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "model_loaded":  model is not None,
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    }


# ─────────────────────────────────────────────────────────────
# AUTH / USER REGISTRATION
# ─────────────────────────────────────────────────────────────

@app.post("/auth/register", response_model=UserOut, tags=["Auth"])
def register_user(body: UserCreate, db: Session = Depends(get_db)):
    """
    Public endpoint — no auth token required.
    Applicants submit their details; account starts as 'pending'.
    Admin approves → Supabase invite email sent → user sets password → can log in.
    """
    # Check by email first (most reliable for new applicants who have no Supabase UUID yet)
    if body.email:
        existing = db.query(User).filter(User.email == body.email).first()
        if existing:
            if body.firebase_uid and not body.firebase_uid.startswith("pending_"):
                # Real Supabase UUID — update it (handles re-registration after deletion)
                existing.firebase_uid = body.firebase_uid
                db.commit()
                db.refresh(existing)
            return existing   # idempotent

    # Also check by firebase_uid if provided
    if body.firebase_uid and not body.firebase_uid.startswith("pending_"):
        existing = db.query(User).filter(User.firebase_uid == body.firebase_uid).first()
        if existing:
            return existing

    user = User(
        firebase_uid=body.firebase_uid,
        email=body.email,
        full_name=body.full_name,
        hospital=body.hospital,
        license_number=body.license_number,
        years_experience=body.years_experience,
        phone_number=body.phone_number,
        specialization=body.specialization,
        role=UserRole.radiologist,
        status=UserStatus.pending,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _audit(db, user.id, "register", "user", user.id)
    return user


@app.get("/auth/me", response_model=UserOut, tags=["Auth"])
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# ─────────────────────────────────────────────────────────────
# USER MANAGEMENT (ADMIN)
# ─────────────────────────────────────────────────────────────

@app.patch("/users/{user_id}/profile", response_model=UserOut, tags=["Users"])
def update_profile(
    user_id: int,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Allow a user to update their own profile details."""
    # Users can only update their own profile (admins can update anyone)
    if current_user.id != user_id and not current_user.is_admin:
        raise HTTPException(403, "Cannot update another user's profile")

    user = _get_or_404(db, User, user_id)

    updatable = ["full_name", "hospital", "phone_number", "specialization", "years_experience"]
    for field in updatable:
        if field in body:
            setattr(user, field, body[field])

    db.commit()
    db.refresh(user)
    _audit(db, current_user.id, "update_profile", "user", user_id)
    return user


@app.get("/users", response_model=List[UserOut], tags=["Admin"])
def list_users(
    status: Optional[str] = Query(None),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    q = db.query(User).filter(User.is_admin == False)
    if status:
        q = q.filter(User.status == status)
    return q.order_by(User.created_at.desc()).all()


@app.patch("/users/{user_id}/status", response_model=UserOut, tags=["Admin"])
def update_user_status(
    user_id: int,
    body: UserStatusUpdate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    user = _get_or_404(db, User, user_id)
    previous_status = str(user.status)
    user.status = body.status
    if body.status == "approved":
        user.approved_at    = datetime.now(timezone.utc)
        user.approved_by_id = admin.id
    if body.rejection_reason:
        user.rejection_reason = body.rejection_reason
    db.commit()
    db.refresh(user)
    _audit(db, admin.id, f"{body.status}_user", "user", user_id, {"target_email": user.email})

    # Send invite email whenever status is set to approved
    # (fires even if re-approving, so admin can resend the email)
    if body.status == "approved":
        print(f"[approval] Sending invite to {user.email} (previous status: {previous_status})")
        try:
            supabase_uid = _invite_and_notify(user.email, user.full_name)
            if supabase_uid:
                user.firebase_uid = supabase_uid
                db.commit()
                db.refresh(user)
                print(f"[approval]  firebase_uid updated to {supabase_uid}")
        except Exception as e:
            print(f"[approval]  Email/invite failed for {user.email}: {e}")

    return user


# ─────────────────────────────────────────────────────────────
# PATIENTS
# ─────────────────────────────────────────────────────────────

@app.post("/patients", response_model=PatientOut, tags=["Patients"])
def create_patient(
    body: PatientCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # ── Deduplicate by National ID (patient_ref_id) ──────────────────────────
    # If a patient with this National ID already exists (for this radiologist
    # OR any radiologist), return that record instead of creating a duplicate.
    if body.patient_ref_id:
        existing = (
            db.query(Patient)
            .filter(Patient.patient_ref_id == body.patient_ref_id)
            .first()
        )
        if existing:
            # Return existing patient — frontend will add new scan to them
            return existing

    patient = Patient(**body.model_dump(), radiologist_id=current_user.id)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    _audit(db, current_user.id, "create_patient", "patient", patient.id)
    return patient


@app.get("/patients", response_model=List[PatientOut], tags=["Patients"])
def list_patients(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.is_admin:
        return db.query(Patient).order_by(Patient.created_at.desc()).all()
    return (
        db.query(Patient)
        .filter(Patient.radiologist_id == current_user.id)
        .order_by(Patient.created_at.desc())
        .all()
    )


@app.delete("/patients/{patient_id}", tags=["Patients"])
def delete_patient(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    patient = _get_or_404(db, Patient, patient_id)
    _check_owner_or_admin(patient.radiologist_id, current_user)
    # Cascade delete diagnoses
    db.query(Diagnosis).filter(Diagnosis.patient_id == patient_id).delete()
    db.delete(patient)
    db.commit()
    _audit(db, current_user.id, "delete_patient", "patient", patient_id)
    return {"detail": "deleted"}

# PREDICTION (no DB save — frontend decides whether to save)



@app.patch("/patients/{patient_id}", response_model=PatientOut, tags=["Patients"])
def update_patient(
    patient_id: int,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    patient = _get_or_404(db, Patient, patient_id)
    _check_owner_or_admin(patient.radiologist_id, current_user)
    if "name" in body:
        patient.name = body["name"]
    if "patient_ref_id" in body:
        patient.patient_ref_id = body["patient_ref_id"]
    if "hospital" in body:
        patient.hospital = body["hospital"]
    if "clinical_notes" in body:
        patient.clinical_notes = body["clinical_notes"]
    db.commit()
    db.refresh(patient)
    _audit(db, current_user.id, "update_patient", "patient", patient_id)
    return patient

@app.post("/predict", response_model=PredictionResponse, tags=["AI"])
async def predict_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a chest X-ray (JPG/PNG) and get instant AI prediction + Grad-CAM.
    Does NOT save to database — call POST /diagnoses to save.
    """
    _validate_image(file)

    image_bytes = await file.read()
    if len(image_bytes) > 15 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 15 MB)")

    model = load_production_model()
    if model is None:
        raise HTTPException(503, "Model not loaded. Place ubuzima_model_production.keras in /models/")

    try:
        img_batch, img_original = preprocess_image_for_inference(image_bytes)
    except ValueError as e:
        raise HTTPException(400, str(e))

    result      = run_predict(model, img_batch)
    # Only generate gradcam for known classifications
    cls = result.get("classification", "Unknown")
    # Only generate gradcam for known classifications
    cls = result.get("classification", "Unknown")
    gradcam_b64 = generate_gradcam(model, img_batch, img_original) if cls != "Unknown" else None if cls != "Unknown" else None

    _audit_simple(current_user.id, "predict_xray")

    return PredictionResponse(**result, gradcam_b64=gradcam_b64)


# ─────────────────────────────────────────────────────────────
# DIAGNOSES (save + manage)
# ─────────────────────────────────────────────────────────────

@app.post("/diagnoses", response_model=DiagnosisOut, tags=["Diagnoses"])
def save_diagnosis(
    body: DiagnosisSave,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify patient exists (any radiologist can add diagnosis to any patient)
    patient = _get_or_404(db, Patient, body.patient_id)

    # Check for duplicate: same patient + same filename already saved in last 60s
    from datetime import datetime, timedelta, timezone
    recent_cutoff = datetime.now(timezone.utc) - timedelta(seconds=60)
    if body.xray_filename:
        duplicate = (
            db.query(Diagnosis)
            .filter(
                Diagnosis.patient_id == body.patient_id,
                Diagnosis.xray_filename == body.xray_filename,
                Diagnosis.created_at >= recent_cutoff,
            )
            .first()
        )
        if duplicate:
            # Return the existing diagnosis instead of creating a duplicate
            print(f"[diagnoses] Duplicate scan detected for patient {body.patient_id}, returning existing #{duplicate.id}")
            return duplicate

    # Strip heatmap if it's somehow corrupted or too large (> 5MB)
    heatmap = body.heatmap_b64
    if heatmap and len(heatmap) > 5_000_000:
        print(f"[diagnoses] Heatmap too large ({len(heatmap)} chars), stripping")
        heatmap = None

    # Normalize AI classification to match DB enum values
    # AI model returns "Tuberculosis" but DB enum is "TB"
    CLASS_MAP = {
        "Tuberculosis": "TB",
        "tuberculosis": "TB",
        "tb": "TB",
        "normal": "Normal",
        "pneumonia": "Pneumonia",
        "unknown": "Unknown",
    }
    ai_class = CLASS_MAP.get(body.ai_classification, body.ai_classification)

    try:
        diag = Diagnosis(
            patient_id=body.patient_id,
            radiologist_id=current_user.id,
            xray_filename=body.xray_filename,
            xray_storage_path=body.xray_storage_path,
            heatmap_b64=heatmap,
            ai_classification=ai_class,
            tb_probability=body.tb_probability,
            pneumonia_probability=body.pneumonia_probability,
            normal_probability=body.normal_probability,
            unknown_probability=body.unknown_probability,
            confidence_score=body.confidence_score,
            ai_explanation=body.ai_explanation,
        )
        db.add(diag)
        db.commit()
        db.refresh(diag)
        _audit(db, current_user.id, "save_diagnosis", "diagnosis", diag.id)
        return diag
    except Exception as e:
        db.rollback()
        print(f"[diagnoses] Save failed: {e}")
        raise HTTPException(500, f"Failed to save diagnosis: {str(e)[:200]}")


@app.get("/diagnoses", response_model=List[DiagnosisOut], tags=["Diagnoses"])
def list_diagnoses(
    patient_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Diagnosis)
    if not current_user.is_admin:
        q = q.filter(Diagnosis.radiologist_id == current_user.id)
    if patient_id:
        q = q.filter(Diagnosis.patient_id == patient_id)
    return q.order_by(Diagnosis.created_at.desc()).all()


@app.get("/diagnoses/{diag_id}", response_model=DiagnosisOut, tags=["Diagnoses"])
def get_diagnosis(
    diag_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    diag = _get_or_404(db, Diagnosis, diag_id)
    _check_owner_or_admin(diag.radiologist_id, current_user)
    return diag


@app.patch("/diagnoses/{diag_id}/verify", response_model=DiagnosisOut, tags=["Diagnoses"])
def verify_diagnosis(
    diag_id: int,
    body: DiagnosisVerify,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Human-in-the-loop: radiologist accepts or overrides the AI prediction."""
    diag = _get_or_404(db, Diagnosis, diag_id)
    _check_owner_or_admin(diag.radiologist_id, current_user)
    diag.radiologist_verified = True
    diag.radiologist_override = body.override
    diag.radiologist_notes    = body.radiologist_notes
    diag.verified_at          = datetime.now(timezone.utc)
    db.commit()
    db.refresh(diag)
    action = "override_diagnosis" if body.override else "accept_diagnosis"
    _audit(db, current_user.id, action, "diagnosis", diag_id)
    return diag


@app.delete("/diagnoses/{diag_id}", tags=["Diagnoses"])
def delete_diagnosis(
    diag_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    diag = _get_or_404(db, Diagnosis, diag_id)
    _check_owner_or_admin(diag.radiologist_id, current_user)
    db.delete(diag)
    db.commit()
    _audit(db, current_user.id, "delete_diagnosis", "diagnosis", diag_id)
    return {"detail": "deleted"}


# ─────────────────────────────────────────────────────────────
# RETRAIN — upload + trigger
# ─────────────────────────────────────────────────────────────

@app.post("/retrain/upload", tags=["Retrain"])
async def upload_for_retrain(
    label: str,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Bulk upload labelled X-rays for future retraining.
    `label` must be one of: Normal, Pneumonia, Tuberculosis, Unknown
    """
    valid_labels = ["Normal", "Pneumonia", "Tuberculosis", "Unknown"]
    if label not in valid_labels:
        raise HTTPException(400, f"label must be one of: {valid_labels}")

    batch_id  = str(uuid.uuid4())[:8]
    dest_dir  = UPLOAD_DIR / "retrain" / label
    dest_dir.mkdir(parents=True, exist_ok=True)

    saved = []
    for f in files:
        _validate_image(f)
        fname    = f"{batch_id}_{f.filename}"
        fpath    = dest_dir / fname
        contents = await f.read()
        with open(fpath, "wb") as out:
            out.write(contents)

        record = XrayUpload(
            uploaded_by_id=current_user.id,
            filename=fname,
            storage_path=str(fpath),
            label=label,
            upload_batch_id=batch_id,
        )
        db.add(record)
        saved.append(fname)

    db.commit()
    _audit(db, current_user.id, "upload_retrain_data", "xray_upload", None,
           {"label": label, "count": len(saved), "batch_id": batch_id})

    return {"batch_id": batch_id, "label": label, "files_saved": len(saved)}


@app.get("/retrain/staged", tags=["Retrain"])
def get_staged_counts(current_user: User = Depends(get_current_user)):
    """Return counts of images currently staged for retraining."""
    upload_src = UPLOAD_DIR / "retrain"
    if not upload_src.exists():
        return {"counts": {}, "total": 0}
    counts: dict[str, int] = {}
    for label_dir in upload_src.iterdir():
        if label_dir.is_dir():
            n = len([f for f in label_dir.iterdir() if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}])
            if n > 0:
                counts[label_dir.name] = n
    return {"counts": counts, "total": sum(counts.values())}


@app.post("/retrain/trigger", response_model=RetrainJobOut, tags=["Retrain"])
def trigger_retrain(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Trigger a retraining job using all uploaded data.
    Runs in background — poll GET /retrain/jobs/{id} for status.
    """
    job = RetrainJob(triggered_by_id=current_user.id, status=RetrainStatus.pending)
    db.add(job)
    db.commit()
    db.refresh(job)

    _audit(db, current_user.id, "trigger_retrain", "retrain_job", job.id)
    background_tasks.add_task(_run_retrain_job, job.id)

    return job


@app.get("/retrain/jobs", response_model=List[RetrainJobOut], tags=["Retrain"])
def list_retrain_jobs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(RetrainJob).order_by(RetrainJob.created_at.desc()).limit(20).all()


@app.get("/retrain/jobs/{job_id}", response_model=RetrainJobOut, tags=["Retrain"])
def get_retrain_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_or_404(db, RetrainJob, job_id)


# ─────────────────────────────────────────────────────────────
# MODEL INFO + STATS
# ─────────────────────────────────────────────────────────────

@app.get("/model/info", response_model=ModelInfo, tags=["Model"])
def model_info():
    return get_model_info()


@app.get("/stats", response_model=SystemStats, tags=["Admin"])
def system_stats(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    info = get_model_info()
    return SystemStats(
        total_radiologists=db.query(User).filter(
            User.is_admin == False, User.status == UserStatus.approved
        ).count(),
        pending_requests=db.query(User).filter(User.status == UserStatus.pending).count(),
        total_patients=db.query(Patient).count(),
        total_diagnoses=db.query(Diagnosis).count(),
        model_status=info.get("status", "unknown"),
        model_size_mb=info.get("size_mb"),
        model_last_updated=info.get("last_modified"),
        uptime_seconds=round(time.time() - START_TIME, 1),
    )


@app.get("/audit", tags=["Admin"])
def get_audit_logs(
    limit: int = Query(200, le=1000),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": l.id, "user_id": l.user_id, "action": l.action,
            "entity": l.entity, "entity_id": l.entity_id,
            "detail": l.detail, "timestamp": l.timestamp,
        }
        for l in logs
    ]


# ─────────────────────────────────────────────────────────────
# BACKGROUND RETRAIN TASK
# ─────────────────────────────────────────────────────────────

def _run_retrain_job(job_id: int):
    """Background task: preprocess uploaded data → retrain model → update job record."""
    db = next(get_db())
    job = db.query(RetrainJob).filter(RetrainJob.id == job_id).first()
    if job is None:
        return

    try:
        job.status     = RetrainStatus.processing
        job.start_time = datetime.now(timezone.utc)
        db.commit()

        # 1. Preprocess uploaded data
        upload_src = UPLOAD_DIR / "retrain"
        processed_dst = DATA_DIR / "train"
        # Clear previous training data to avoid mixing stale uploads across jobs
        import shutil
        if processed_dst.exists():
            shutil.rmtree(str(processed_dst))
        processed_dst.mkdir(parents=True, exist_ok=True)

        print(f"  [Job {job_id}] Preprocessing uploaded images…")
        counts = preprocess_bulk_upload(str(upload_src), str(processed_dst))
        job.image_counts = counts
        db.commit()

        # Clear staging folder so next job starts fresh
        if upload_src.exists():
            shutil.rmtree(str(upload_src))
        upload_src.mkdir(parents=True, exist_ok=True)

        # Only validate classes that actually have images uploaded (skip empty classes)
        MIN_PER_CLASS = 3
        uploaded_classes = {cls: n for cls, n in counts.items() if n > 0}
        if not uploaded_classes:
            raise ValueError("No images found. Upload X-rays first before triggering retraining.")
        problem_classes = {cls: n for cls, n in uploaded_classes.items() if n < MIN_PER_CLASS}
        if problem_classes:
            details = ", ".join(f"{cls}: {n} (need {MIN_PER_CLASS - n} more)" for cls, n in problem_classes.items())
            raise ValueError(
                f"Some uploaded classes need more images: {details}."
            )
        total = sum(uploaded_classes.values())
        print(f"  [Job {job_id}] Training on {len(uploaded_classes)} classes: {uploaded_classes} (total: {total})")

        # 2. Build TF datasets
        print(f"  [Job {job_id}] Building TF datasets…")
        train_ds, val_ds, class_weights = build_tf_dataset(str(processed_dst))

        # 3. Retrain
        print(f"  [Job {job_id}] Starting retraining…")
        history = retrain_model(train_ds, val_ds, class_weights)
        invalidate_model_cache()

        job.status       = RetrainStatus.completed
        job.end_time     = datetime.now(timezone.utc)
        job.history_json = history
        job.final_val_auc = history.get("val_auc", [None])[-1]
        job.final_val_acc = history.get("val_accuracy", [None])[-1]

        # Mark uploaded files as used
        db.query(XrayUpload).filter(XrayUpload.used_in_retrain == False).update(
            {"used_in_retrain": True}
        )
        print(f"  [Job {job_id}]  Retraining complete.")

    except Exception as exc:
        job.status        = RetrainStatus.failed
        job.end_time      = datetime.now(timezone.utc)
        job.error_message = str(exc)
        print(f"  [Job {job_id}]  Failed: {exc}")

    finally:
        db.commit()
        db.close()

# HELPERS

def _get_or_404(db, model_class, record_id):
    obj = db.query(model_class).filter(model_class.id == record_id).first()
    if obj is None:
        raise HTTPException(404, f"{model_class.__name__} {record_id} not found")
    return obj


def _check_owner_or_admin(owner_id: int, user: User):
    if not user.is_admin and owner_id != user.id:
        raise HTTPException(403, "Access denied")


def _validate_image(file: UploadFile):
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}. Use JPG or PNG.")


# ─────────────────────────────────────────────────────────────
# DEBUG — test approval email (admin only, remove in production)
# ─────────────────────────────────────────────────────────────

@app.post("/debug/test-invite", tags=["Debug"])
def test_invite_email(
    body: dict,
    admin: User = Depends(get_admin_user),
):
    """Call this to test if invite email works. Body: {"email": "test@example.com"}"""
    import requests as _req
    email = body.get("email", "")
    if not email:
        raise HTTPException(400, "email required")

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").strip()
    results = {}

    # Check service key
    results["service_key_set"] = bool(SUPABASE_SERVICE_KEY)
    results["service_key_prefix"] = SUPABASE_SERVICE_KEY[:20] + "..." if SUPABASE_SERVICE_KEY else "MISSING"
    results["supabase_url"] = SUPABASE_URL

    # Step 1: List existing auth users to find this email
    list_resp = _req.get(
        f"{SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=100",
        headers=_supabase_admin_headers(),
        timeout=10,
    )
    results["list_users_status"] = list_resp.status_code
    if list_resp.ok:
        all_users = list_resp.json().get("users", [])
        match = [u for u in all_users if u.get("email", "").lower() == email.lower()]
        results["existing_auth_users"] = len(match)
        if match:
            results["existing_user_id"] = match[0].get("id")

    # Step 2: Try invite
    invite_resp = _req.post(
        f"{SUPABASE_URL}/auth/v1/admin/invite",
        headers=_supabase_admin_headers(),
        json={"email": email, "options": {"redirect_to": frontend_url}},
        timeout=10,
    )
    results["invite_status"] = invite_resp.status_code
    results["invite_response"] = invite_resp.text[:500]

    return results


# ─────────────────────────────────────────────────────────────
# SUPABASE ADMIN HELPERS
# ─────────────────────────────────────────────────────────────


def _supabase_admin_headers():
    """Build headers for Supabase Admin API.
    Works with both JWT format (eyJ...) and new sb_secret_ format keys.
    """
    key = SUPABASE_SERVICE_KEY
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _invite_and_notify(email: str, full_name: str) -> str | None:
    """
    When admin approves a radiologist:
    Uses /auth/v1/admin/generate_link (type=invite) which works on all Supabase versions.
    This creates the auth user, generates an invite link, and Supabase sends the email.
    Returns the new Supabase UUID.
    """
    import requests as _req

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").strip()

    # Step 1: Delete existing auth user if present so invite is fresh
    list_resp = _req.get(
        f"{SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000",
        headers=_supabase_admin_headers(),
        timeout=10,
    )
    if list_resp.ok:
        users_list = list_resp.json().get("users", [])
        for u in users_list:
            if u.get("email", "").lower() == email.lower():
                uid = u.get("id")
                if uid:
                    del_resp = _req.delete(
                        f"{SUPABASE_URL}/auth/v1/admin/users/{uid}",
                        headers=_supabase_admin_headers(),
                        timeout=10,
                    )
                    print(f"[invite] Deleted existing auth user {email}: {del_resp.status_code}")

    # Step 2: Use generate_link (works on all Supabase versions including older ones)
    gen_resp = _req.post(
        f"{SUPABASE_URL}/auth/v1/admin/generate_link",
        headers=_supabase_admin_headers(),
        json={
            "type": "invite",
            "email": email,
            "options": {
                "redirect_to": frontend_url,
                "data": {"full_name": full_name},
            },
        },
        timeout=10,
    )
    print(f"[invite] generate_link {email} -> {gen_resp.status_code}: {gen_resp.text[:400]}")

    if gen_resp.ok:
        data = gen_resp.json()
        uid = data.get("id") or data.get("user", {}).get("id")
        print(f"[invite]  Invite link generated for {email}, UID: {uid}")

        # Auto-confirm the email so user can log in immediately without clicking any link
        if uid:
            confirm_resp = _req.put(
                f"{SUPABASE_URL}/auth/v1/admin/users/{uid}",
                headers=_supabase_admin_headers(),
                json={"email_confirm": True},
                timeout=10,
            )
            print(f"[invite] Email auto-confirmed: {confirm_resp.status_code}")

        return uid

    raise Exception(f"generate_link failed for {email} ({gen_resp.status_code}): {gen_resp.text}")


def _delete_supabase_auth_user(firebase_uid: str):
    """Delete user from Supabase Auth using the admin API."""
    import requests as _req
    if not SUPABASE_SERVICE_KEY or not firebase_uid:
        return
    resp = _req.delete(
        f"{SUPABASE_URL}/auth/v1/admin/users/{firebase_uid}",
        headers=_supabase_admin_headers(),
        timeout=10,
    )
    if resp.status_code not in (200, 204, 404):
        raise Exception(f"Supabase auth delete returned {resp.status_code}: {resp.text}")
    print(f"[delete_user] Supabase auth user {firebase_uid} deleted: {resp.status_code}")



def _audit(db: Session, user_id: int, action: str, entity: str, entity_id, detail: dict = None):
    db.add(AuditLog(user_id=user_id, action=action, entity=entity, entity_id=entity_id, detail=detail))
    db.commit()


def _audit_simple(user_id: int, action: str):
    db = next(get_db())
    db.add(AuditLog(user_id=user_id, action=action))
    db.commit()
    db.close()

@app.delete("/users/{user_id}", tags=["Users"])
def delete_user(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    from sqlalchemy import text
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    firebase_uid = user.firebase_uid
    email = user.email

    # Cascade: delete diagnoses → patients → audit logs → user
    try:
        # Delete diagnoses for all patients of this radiologist
        db.execute(text("""
            DELETE FROM diagnoses
            WHERE patient_id IN (
                SELECT id FROM patients WHERE radiologist_id = :uid
            )
        """), {"uid": user_id})
        # Delete patients
        db.execute(text("DELETE FROM patients WHERE radiologist_id = :uid"), {"uid": user_id})
        # Delete audit logs
        db.execute(text("DELETE FROM audit_logs WHERE user_id = :uid"), {"uid": user_id})
        # Delete user
        db.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": user_id})
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Database delete failed: {e}")

    # Delete from Supabase Auth (best effort — don't fail if this errors)
    try:
        _delete_supabase_auth_user(firebase_uid)
    except Exception as e:
        print(f"[delete_user] Supabase auth delete failed for {email}: {e}")

    _audit_simple(current_user.id, f"delete_user:{user_id}")
    return {"detail": "deleted"}


# ─────────────────────────────────────────────────────────────
# PASSWORD MANAGEMENT (ADMIN)
# ─────────────────────────────────────────────────────────────

@app.post("/users/{user_id}/set-password", tags=["Admin"])
def admin_set_password(
    user_id: int,
    body: dict,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Admin sets a password for a user directly via Supabase Admin API.
    Body: {"password": "newpassword123"}
    """
    import requests as _req

    user = _get_or_404(db, User, user_id)
    new_password = body.get("password", "").strip()

    if not new_password or len(new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    if not user.firebase_uid or user.firebase_uid.startswith("pending_"):
        raise HTTPException(400, "User has no Supabase Auth account yet — approve them first")

    # Update password via Supabase Admin API
    resp = _req.put(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user.firebase_uid}",
        headers=_supabase_admin_headers(),
        json={"password": new_password},
        timeout=10,
    )

    if not resp.ok:
        raise HTTPException(500, f"Supabase error: {resp.text[:200]}")

    # Also auto-confirm email so user can log in immediately
    _req.put(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user.firebase_uid}",
        headers=_supabase_admin_headers(),
        json={"email_confirm": True},
        timeout=10,
    )

    _audit(db, admin.id, "admin_set_password", "user", user_id, {"target_email": user.email})
    print(f"[admin] Password set for {user.email} by admin")
    return {"detail": "Password updated successfully", "email": user.email}


@app.post("/users/{user_id}/generate-password", tags=["Admin"])
def admin_generate_password(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Admin generates a random password for a user and sets it via Supabase Admin API.
    Returns the generated password so admin can share it.
    """
    import requests as _req
    import random, string

    user = _get_or_404(db, User, user_id)

    if not user.firebase_uid or user.firebase_uid.startswith("pending_"):
        raise HTTPException(400, "User has no Supabase Auth account yet — approve them first")

    # Generate a strong readable password
    chars = string.ascii_letters + string.digits
    password = (
        random.choice(string.ascii_uppercase) +
        random.choice(string.ascii_lowercase) +
        random.choice(string.digits) +
        "".join(random.choices(chars, k=6)) +
        "!"
    )

    resp = _req.put(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user.firebase_uid}",
        headers=_supabase_admin_headers(),
        json={"password": password},
        timeout=10,
    )

    if not resp.ok:
        raise HTTPException(500, f"Supabase error: {resp.text[:200]}")

    # Auto-confirm email so user can log in immediately
    _req.put(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user.firebase_uid}",
        headers=_supabase_admin_headers(),
        json={"email_confirm": True},
        timeout=10,
    )

    _audit(db, admin.id, "admin_generate_password", "user", user_id, {"target_email": user.email})
    print(f"[admin] Generated password for {user.email}")
    return {
        "detail": "Password generated and set",
        "email": user.email,
        "password": password,
        "full_name": user.full_name,
    }