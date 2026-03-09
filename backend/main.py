from dotenv import load_dotenv
load_dotenv()

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
    # Model loads lazily on first /predict call — avoids blocking startup on HF free tier


# ─────────────────────────────────────────────────────────────
# HEALTH
# ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health():
    # Do NOT load model here — HF pings /health every few seconds
    # calling load_production_model() here causes infinite restart loop on free tier
    return {
        "status":        "healthy",
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "model_loaded":  True,
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    }


# ─────────────────────────────────────────────────────────────
# AUTH / USER REGISTRATION
# ─────────────────────────────────────────────────────────────

@app.post("/auth/register", response_model=UserOut, tags=["Auth"])
def register_user(body: UserCreate, db: Session = Depends(get_db)):
    """
    Called by the React frontend immediately after Firebase signup.
    Creates user row in PostgreSQL with status='pending'.
    """
    existing = db.query(User).filter(User.firebase_uid == body.firebase_uid).first()
    if existing:
        return existing   # idempotent

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
    user.status = body.status
    if body.status == "approved":
        user.approved_at    = datetime.now(timezone.utc)
        user.approved_by_id = admin.id
    if body.rejection_reason:
        user.rejection_reason = body.rejection_reason
    db.commit()
    db.refresh(user)
    _audit(db, admin.id, f"{body.status}_user", "user", user_id, {"target_email": user.email})
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
    # Verify patient belongs to this radiologist (or admin)
    patient = _get_or_404(db, Patient, body.patient_id)
    _check_owner_or_admin(patient.radiologist_id, current_user)

    diag = Diagnosis(
        patient_id=body.patient_id,
        radiologist_id=current_user.id,
        xray_filename=body.xray_filename,
        xray_storage_path=body.xray_storage_path,
        heatmap_b64=body.heatmap_b64,
        ai_classification=body.ai_classification,
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

        # Clear and rebuild with all 4 class folders so TF label indices
        # always match original model: 0=Normal,1=Pneumonia,2=TB,3=Unknown
        import shutil as _shutil
        if processed_dst.exists():
            _shutil.rmtree(str(processed_dst))
        processed_dst.mkdir(parents=True, exist_ok=True)
        for _cls in ["Normal", "Pneumonia", "Tuberculosis", "Unknown"]:
            (processed_dst / _cls).mkdir(parents=True, exist_ok=True)

        print(f"  [Job {job_id}] Preprocessing uploaded images…")
        counts = preprocess_bulk_upload(str(upload_src), str(processed_dst))
        job.image_counts = counts
        db.commit()

        # Validate: need at least 1 class with images
        uploaded_classes = {k: v for k, v in counts.items() if v > 0}
        if not uploaded_classes:
            raise ValueError("No images found. Upload X-rays first before triggering retraining.")
        MIN_PER_CLASS = 5
        short = {k: v for k, v in uploaded_classes.items() if v < MIN_PER_CLASS}
        if short:
            details = ", ".join(f"{k}: {v} (need {MIN_PER_CLASS-v} more)" for k, v in short.items())
            raise ValueError(f"Need at least {MIN_PER_CLASS} images per uploaded class: {details}")
        total = sum(uploaded_classes.values())

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
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
    _audit_simple(current_user.id, f"delete_user:{user_id}")
    return {"detail": "deleted"}