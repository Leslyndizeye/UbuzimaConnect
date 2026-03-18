from dotenv import load_dotenv
load_dotenv()

from dotenv import load_dotenv
load_dotenv()

import os
import time
import uuid
import io
import json
import shutil
import asyncio
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List

from fastapi import (
    FastAPI, File, UploadFile, HTTPException, Depends,
    BackgroundTasks, Query
)
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import (
    get_db, init_db,
    User, Patient, Diagnosis, XrayUpload, RetrainJob, AuditLog, ChatMessage,
    UserStatus, UserRole, DiagnosisClass, RetrainStatus,
)
from schemas import (
    UserCreate, UserOut, UserStatusUpdate,
    PatientCreate, PatientOut,
    PredictionResponse, DiagnosisSave, DiagnosisVerify, DiagnosisOut,
    RetrainJobOut, SystemStats, ModelInfo,
)
from auth import get_current_user, get_admin_user, get_super_admin
from src.preprocessing import preprocess_image_for_inference, preprocess_bulk_upload, build_tf_dataset
from src.prediction import predict as run_predict, generate_gradcam, evaluate_on_dataset
from src.model import load_production_model, get_model_info, retrain_model, invalidate_model_cache
from fastapi import Body
from database import Hospital, HospitalApplication, HospitalAppStatus
from schemas import (
    HospitalApplicationCreate, HospitalApplicationOut,
    HospitalOut, HospitalAppStatusUpdate,
)
import random, string, base64, io
import httpx
try:
    from PIL import Image as _PILImage
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False
# APP SETUP

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


# HEALTH


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



# AUTH / USER REGISTRATION


@app.post("/auth/register", response_model=UserOut, tags=["Auth"])
def register_user(body: UserCreate, db: Session = Depends(get_db)):
    """
    Called by the React frontend immediately after Firebase signup.
    Creates user row in PostgreSQL with status='pending'.
    """
    existing = db.query(User).filter(User.firebase_uid == body.firebase_uid).first()
    if existing:
        return existing   # idempotent
    existing_email = db.query(User).filter(User.email == body.email).first()
    if existing_email:
        raise HTTPException(400, "A user with this email already exists.")
    existing_national_id = db.query(User).filter(User.national_id == body.national_id).first()
    if existing_national_id:
        raise HTTPException(400, "A user with this national ID already exists.")

    user = User(
        firebase_uid=body.firebase_uid,
        email=body.email,
        full_name=body.full_name,
        hospital=body.hospital,
        hospital_id=body.hospital_id if hasattr(body, 'hospital_id') else None,
        national_id=body.national_id,
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
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = UserOut.model_validate(current_user).model_dump()
    payload["hospital"] = _resolve_hospital_name(db, current_user) or payload.get("hospital")
    return payload



# USER MANAGEMENT (ADMIN)


@app.get("/users", response_model=List[UserOut], tags=["Admin"])
def list_users(
    status: Optional[str] = Query(None),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    q = db.query(User).filter(User.is_admin == False)
    # Middle admin: only their hospital's radiologists
    if admin.hospital_id and (admin.email or "").lower() not in {"leslyndiz6@gmail.com","byakwelianiela@gmail.com"}:
        q = q.filter(User.hospital_id == admin.hospital_id)
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



# PATIENTS


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
        # Middle admin: only patients belonging to their hospital's radiologists
        if current_user.hospital_id and (current_user.email or "").lower() not in {"leslyndiz6@gmail.com","byakwelianiela@gmail.com"}:
            rad_ids = [u.id for u in db.query(User).filter(User.hospital_id == current_user.hospital_id, User.is_admin == False).all()]
            return db.query(Patient).filter(Patient.radiologist_id.in_(rad_ids)).order_by(Patient.created_at.desc()).all()
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
    xray_storage_path = _store_diagnosis_image(image_bytes, file.filename)
    xray_b64 = _image_data_uri(image_bytes, file.content_type)

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

    return PredictionResponse(
        **result,
        gradcam_b64=gradcam_b64,
        xray_storage_path=xray_storage_path,
        xray_b64=xray_b64,
    )



# DIAGNOSES (save + manage)


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
        xray_b64=body.xray_b64,
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
    elif current_user.hospital_id and (current_user.email or "").lower() not in {"leslyndiz6@gmail.com","byakwelianiela@gmail.com"}:
        # Middle admin: only their hospital's radiologists' diagnoses
        rad_ids = [u.id for u in db.query(User).filter(User.hospital_id == current_user.hospital_id, User.is_admin == False).all()]
        q = q.filter(Diagnosis.radiologist_id.in_(rad_ids))
    if patient_id:
        q = q.filter(Diagnosis.patient_id == patient_id)
    diagnoses = q.order_by(Diagnosis.created_at.desc()).all()
    changed = False
    for diag in diagnoses:
        changed = _hydrate_diagnosis_media(db, diag) or changed
    if changed:
        db.commit()
        for diag in diagnoses:
            db.refresh(diag)
    return diagnoses


@app.get("/diagnoses/{diag_id}", response_model=DiagnosisOut, tags=["Diagnoses"])
def get_diagnosis(
    diag_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    diag = _get_or_404(db, Diagnosis, diag_id)
    _check_owner_or_admin(diag.radiologist_id, current_user)
    if _hydrate_diagnosis_media(db, diag):
        db.commit()
        db.refresh(diag)
    return diag


@app.get("/diagnoses/{diag_id}/image", tags=["Diagnoses"])
def get_diagnosis_image(
    diag_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    diag = _get_or_404(db, Diagnosis, diag_id)
    _check_owner_or_admin(diag.radiologist_id, current_user)
    if _hydrate_diagnosis_media(db, diag):
        db.commit()
        db.refresh(diag)
    if diag.xray_storage_path:
        path = Path(diag.xray_storage_path)
        if path.exists() and path.is_file():
            media_type = "image/jpeg"
            suffix = path.suffix.lower()
            if suffix == ".png":
                media_type = "image/png"
            elif suffix == ".webp":
                media_type = "image/webp"
            return FileResponse(path, media_type=media_type, filename=path.name)
    if diag.xray_b64:
        try:
            media_type, image_bytes = _decode_image_data_uri(diag.xray_b64)
            return Response(content=image_bytes, media_type=media_type)
        except Exception:
            raise HTTPException(404, "Stored diagnosis image could not be decoded.")
    raise HTTPException(404, "No stored image for this diagnosis.")


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


@app.get("/chat/contacts", tags=["Chat"])
def list_chat_contacts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.hospital_id:
        return []
    users = db.query(User).filter(
        User.hospital_id == current_user.hospital_id,
        User.is_admin == False,
        User.id != current_user.id,
    ).all()
    contacts = []
    for user in users:
        if _user_status_value(user) != "approved":
            continue
        contacts.append({
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "specialization": user.specialization,
            "hospital_id": user.hospital_id,
            "status": _user_status_value(user),
            "phone_number": user.phone_number,
            "years_experience": user.years_experience,
        })
    contacts.sort(key=lambda item: item["full_name"].lower())
    return contacts


@app.get("/chat/messages/{other_user_id}", tags=["Chat"])
def list_chat_messages(
    other_user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    other_user = _get_or_404(db, User, other_user_id)
    _require_same_hospital_colleague(current_user, other_user)
    messages = db.query(ChatMessage).filter(
        ChatMessage.hospital_id == current_user.hospital_id,
        (
            ((ChatMessage.sender_id == current_user.id) & (ChatMessage.recipient_id == other_user_id)) |
            ((ChatMessage.sender_id == other_user_id) & (ChatMessage.recipient_id == current_user.id))
        )
    ).order_by(ChatMessage.created_at.asc()).all()
    return [
        {
            "id": msg.id,
            "hospital_id": msg.hospital_id,
            "sender_id": msg.sender_id,
            "recipient_id": msg.recipient_id,
            "message": msg.message,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
        }
        for msg in messages
    ]


@app.post("/chat/messages/{other_user_id}", tags=["Chat"])
def create_chat_message(
    other_user_id: int,
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    other_user = _get_or_404(db, User, other_user_id)
    _require_same_hospital_colleague(current_user, other_user)

    shared_diagnosis_id = body.get("shared_diagnosis_id")
    forwarded_report = body.get("forwarded_report")
    free_text = (body.get("message") or "").strip()

    if shared_diagnosis_id:
        diag = _get_or_404(db, Diagnosis, int(shared_diagnosis_id))
        _check_owner_or_admin(diag.radiologist_id, current_user)
        if _hydrate_diagnosis_media(db, diag):
            db.commit()
            db.refresh(diag)
        patient = _get_or_404(db, Patient, diag.patient_id)
        hospital_name = _resolve_hospital_name(db, current_user)
        hospital_logo = _resolve_hospital_logo(db, current_user)
        final_class = diag.radiologist_override or (
            diag.ai_classification.value if hasattr(diag.ai_classification, "value") else str(diag.ai_classification)
        )
        payload = {
            "type": "diagnosis_report",
            "diagnosis_id": diag.id,
            "patient_name": patient.name,
            "patient_ref_masked": _mask_national_id(patient.patient_ref_id) if patient.patient_ref_id else None,
            "classification": final_class,
            "ai_classification": diag.ai_classification.value if hasattr(diag.ai_classification, "value") else str(diag.ai_classification),
            "confidence_score": float(diag.confidence_score or 0.0),
            "xray_b64": diag.xray_b64,
            "heatmap_b64": diag.heatmap_b64,
            "xray_filename": diag.xray_filename,
            "radiologist_name": current_user.full_name,
            "hospital": hospital_name,
            "hospital_logo_base64": hospital_logo,
            "shared_note": free_text or None,
            "radiologist_notes": diag.radiologist_notes,
            "created_at": diag.created_at.isoformat() if diag.created_at else None,
        }
        raw_message = "__UBUZIMA_SHARED_DIAGNOSIS__:" + json.dumps(payload)
    elif forwarded_report:
        if not isinstance(forwarded_report, dict):
            raise HTTPException(400, "forwarded_report must be an object.")
        payload = {
            "type": "diagnosis_report",
            "diagnosis_id": int(forwarded_report.get("diagnosis_id") or 0),
            "patient_name": str(forwarded_report.get("patient_name") or "Shared diagnosis"),
            "patient_ref_masked": forwarded_report.get("patient_ref_masked"),
            "classification": str(forwarded_report.get("classification") or "Unknown"),
            "ai_classification": forwarded_report.get("ai_classification"),
            "confidence_score": float(forwarded_report.get("confidence_score") or 0.0),
            "xray_b64": forwarded_report.get("xray_b64"),
            "heatmap_b64": forwarded_report.get("heatmap_b64"),
            "xray_filename": forwarded_report.get("xray_filename"),
            "radiologist_name": forwarded_report.get("radiologist_name") or current_user.full_name,
            "hospital": forwarded_report.get("hospital") or _resolve_hospital_name(db, current_user),
            "hospital_logo_base64": forwarded_report.get("hospital_logo_base64") or _resolve_hospital_logo(db, current_user),
            "shared_note": free_text or forwarded_report.get("shared_note"),
            "radiologist_notes": forwarded_report.get("radiologist_notes"),
            "created_at": forwarded_report.get("created_at") or datetime.now(timezone.utc).isoformat(),
        }
        raw_message = "__UBUZIMA_SHARED_DIAGNOSIS__:" + json.dumps(payload)
    else:
        if not free_text:
            raise HTTPException(400, "Message cannot be empty.")
        raw_message = free_text

    msg = ChatMessage(
        hospital_id=current_user.hospital_id,
        sender_id=current_user.id,
        recipient_id=other_user_id,
        message=raw_message,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    _audit(db, current_user.id, "send_chat_message", "chat_message", msg.id, {
        "recipient_id": other_user_id,
        "recipient_email": other_user.email,
        "shared_diagnosis_id": int(shared_diagnosis_id) if shared_diagnosis_id else None,
        "forwarded": bool(forwarded_report),
    })

    return {
        "id": msg.id,
        "hospital_id": msg.hospital_id,
        "sender_id": msg.sender_id,
        "recipient_id": msg.recipient_id,
        "message": msg.message,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


@app.delete("/chat/messages/{message_id}", tags=["Chat"])
def delete_chat_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    msg = _get_or_404(db, ChatMessage, message_id)
    if msg.hospital_id != current_user.hospital_id:
        raise HTTPException(403, "You can only manage reports from your hospital.")
    if current_user.id not in {msg.sender_id, msg.recipient_id}:
        raise HTTPException(403, "You can only delete reports you sent or received.")
    db.delete(msg)
    db.commit()
    _audit(db, current_user.id, "delete_chat_message", "chat_message", message_id, {
        "sender_id": msg.sender_id,
        "recipient_id": msg.recipient_id,
    })
    return {"detail": "Report deleted"}



# RETRAIN — upload + trigger


@app.post("/retrain/upload", tags=["Retrain"])
async def upload_for_retrain(
    label: str,
    files: Optional[List[UploadFile]] = File(None),
    archive: Optional[UploadFile] = File(None),
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
    if not files and archive is None:
        raise HTTPException(400, "Upload image files or one ZIP archive.")

    batch_id  = str(uuid.uuid4())[:8]
    dest_dir  = UPLOAD_DIR / "retrain" / label
    dest_dir.mkdir(parents=True, exist_ok=True)

    saved = []

    def _supported_retrain_name(name: str) -> bool:
        return Path(name).suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

    def _save_retrain_bytes(raw_name: str, contents: bytes) -> str | None:
        safe_name = Path(raw_name or "image").name
        if not safe_name or not _supported_retrain_name(safe_name):
            return None
        fname = f"{batch_id}_{safe_name}"
        fpath = dest_dir / fname
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
        return fname

    if files:
        for f in files:
            if not f.filename or not _supported_retrain_name(f.filename):
                raise HTTPException(400, "Only JPG, PNG, WebP or BMP images are allowed for retraining.")
            contents = await f.read()
            _save_retrain_bytes(f.filename, contents)

    if archive is not None:
        archive_name = archive.filename or ""
        if not archive_name.lower().endswith(".zip"):
            raise HTTPException(400, "Archive upload must be a ZIP file.")
        archive_bytes = await archive.read()
        try:
            with zipfile.ZipFile(io.BytesIO(archive_bytes)) as zf:
                for member in zf.infolist():
                    if member.is_dir():
                        continue
                    member_name = Path(member.filename).name
                    if not member_name or not _supported_retrain_name(member_name):
                        continue
                    _save_retrain_bytes(member_name, zf.read(member))
        except zipfile.BadZipFile:
            raise HTTPException(400, "Invalid ZIP archive.")

    if not saved:
        raise HTTPException(400, "No valid retraining images were found in the upload.")

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



# MODEL INFO + STATS


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



# BACKGROUND RETRAIN TASK


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

        # Validate: require a meaningful multi-class retrain for stable promotion.
        uploaded_classes = {k: v for k, v in counts.items() if v > 0}
        if not uploaded_classes:
            raise ValueError("No images found. Upload X-rays first before triggering retraining.")
        MIN_PER_CLASS = 5
        short = {k: v for k, v in uploaded_classes.items() if v < MIN_PER_CLASS}
        if short:
            details = ", ".join(f"{k}: {v} (need {MIN_PER_CLASS-v} more)" for k, v in short.items())
            raise ValueError(f"Need at least {MIN_PER_CLASS} images per uploaded class: {details}")
        if len(uploaded_classes) < 2:
            only_class = next(iter(uploaded_classes))
            raise ValueError(
                f"For best retraining results, prepare at least 2 classes with {MIN_PER_CLASS}+ images. "
                f"Only '{only_class}' is currently ready."
            )
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
        if upload_src.exists():
            import shutil as _shutil
            _shutil.rmtree(str(upload_src))
            upload_src.mkdir(parents=True, exist_ok=True)
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
        raise HTTPException(400, f"Unsupported file type: {file.content_type}. Use JPG or PNG images.")


def _store_diagnosis_image(image_bytes: bytes, original_name: str | None) -> str:
    suffix = Path(original_name or "xray.jpg").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        suffix = ".jpg"
    dest_dir = UPLOAD_DIR / "diagnoses"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{uuid.uuid4().hex}{suffix}"
    with open(dest, "wb") as fh:
        fh.write(image_bytes)
    return str(dest)


def _image_data_uri(image_bytes: bytes, content_type: str | None) -> str:
    media_type = content_type or "image/jpeg"
    return f"data:{media_type};base64,{base64.b64encode(image_bytes).decode('utf-8')}"


def _decode_data_uri(data_uri: str) -> tuple[str, bytes]:
    if not data_uri.startswith("data:") or ";base64," not in data_uri:
        raise ValueError("Invalid data URI")
    header, encoded = data_uri.split(",", 1)
    media_type = header[5:].split(";")[0] or "application/octet-stream"
    return media_type, base64.b64decode(encoded)


def _decode_image_data_uri(data_uri: str) -> tuple[str, bytes]:
    media_type, raw = _decode_data_uri(data_uri)
    return media_type or "image/jpeg", raw


def _mask_national_id(value: str | None) -> str | None:
    if not value:
        return None
    raw = str(value).replace(" ", "")
    if len(raw) < 6:
        return raw
    return f"{raw[:4]}**********{raw[-2:]}"


def _resolve_hospital_name(db: Session, user: User) -> str | None:
    if user.hospital_id:
        hospital = db.query(Hospital).filter(Hospital.id == user.hospital_id).first()
        if hospital and hospital.name:
            return hospital.name
    return user.hospital


def _resolve_hospital_logo(db: Session, user: User) -> str | None:
    if not user.hospital_id:
        return None
    hospital = db.query(Hospital).filter(Hospital.id == user.hospital_id).first()
    return hospital.logo_base64 if hospital else None


def _hydrate_diagnosis_media(db: Session, diag: Diagnosis) -> bool:
    if diag.xray_b64:
        return False
    if not diag.xray_storage_path:
        return False
    path = Path(diag.xray_storage_path)
    if not (path.exists() and path.is_file()):
        return False
    suffix = path.suffix.lower()
    media_type = "image/jpeg"
    if suffix == ".png":
        media_type = "image/png"
    elif suffix == ".webp":
        media_type = "image/webp"
    elif suffix == ".bmp":
        media_type = "image/bmp"
    image_bytes = path.read_bytes()
    diag.xray_b64 = _image_data_uri(image_bytes, media_type)
    if not diag.xray_filename:
        diag.xray_filename = path.name
    db.add(diag)
    return True


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


@app.delete("/retrain/staged", tags=["Retrain"])
def clear_staged(current_user: User = Depends(get_current_user)):
    """Clear all staged retrain images without triggering a job."""
    upload_src = UPLOAD_DIR / "retrain"
    if upload_src.exists():
        import shutil
        shutil.rmtree(str(upload_src))
        upload_src.mkdir(parents=True, exist_ok=True)
    return {"detail": "Staged images cleared"}


def _generate_ref() -> str:
    return "UBZ-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


# ── Public: submit hospital application (no auth required)
@app.post("/hospital/apply", response_model=HospitalApplicationOut, tags=["Hospital"])
def submit_hospital_application(
    body: HospitalApplicationCreate,
    db: Session = Depends(get_db),
):
    """Public endpoint — any hospital can submit an application."""
    # Check for duplicate email
    existing = db.query(HospitalApplication).filter(
        HospitalApplication.email == body.email
    ).first()
    if existing:
        raise HTTPException(400, "An application from this email already exists.")

    ref = _generate_ref()
    app_obj = HospitalApplication(
        ref_number=ref,
        **body.model_dump(),
        status=HospitalAppStatus.pending,
    )
    db.add(app_obj)
    db.commit()
    db.refresh(app_obj)
    return app_obj


@app.get("/hospital/applications/{app_id}/license-document", tags=["Hospital"])
def get_hospital_application_license_document(
    app_id: int,
    admin: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    app_obj = db.query(HospitalApplication).filter(HospitalApplication.id == app_id).first()
    if not app_obj:
        raise HTTPException(404, "Application not found")
    if not app_obj.license_document_base64 or not app_obj.license_document_name:
        raise HTTPException(404, "No health facility license document uploaded.")
    media_type, raw = _decode_data_uri(app_obj.license_document_base64)
    headers = {"Content-Disposition": f'inline; filename="{app_obj.license_document_name}"'}
    return Response(content=raw, media_type=media_type, headers=headers)


# ── Super admin: list all hospital applications
@app.get("/hospital/applications", response_model=list[HospitalApplicationOut], tags=["Hospital"])
def list_hospital_applications(
    status: str = Query(None),
    admin: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    q = db.query(HospitalApplication)
    if status:
        q = q.filter(HospitalApplication.status == status)
    return q.order_by(HospitalApplication.created_at.desc()).all()


# ── Super admin: get single application
@app.get("/hospital/applications/{app_id}", response_model=HospitalApplicationOut, tags=["Hospital"])
def get_hospital_application(
    app_id: int,
    admin: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    obj = db.query(HospitalApplication).filter(HospitalApplication.id == app_id).first()
    if not obj:
        raise HTTPException(404, "Application not found")
    return obj
# ─────────────────────────────────────────────────────────────
# ADD THESE to main.py
#
# 1. Add this import at the top of main.py:
#    import httpx
#
# 2. Add RESEND_API_KEY to HF Space secrets:
#    RESEND_API_KEY = re_xxxxxxxxxxxx  (from resend.com)
#    FROM_EMAIL = onboarding@resend.dev  (free tier) or your domain
#
# 3. Paste this entire block after the hospital endpoints
# ─────────────────────────────────────────────────────────────

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL     = os.getenv("FROM_EMAIL", "onboarding@resend.dev")
FROM_NAME      = "Ubuzima Connect"


async def send_email(to: str, subject: str, html: str) -> bool:
    """Send email via Resend API. Returns True if sent successfully."""
    if not RESEND_API_KEY:
        print("[email] RESEND_API_KEY not set — skipping email")
        return False
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"{FROM_NAME} <{FROM_EMAIL}>",
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
                timeout=10,
            )
        if res.status_code in (200, 201):
            print(f"[email] Sent to {to} ✓")
            return True
        else:
            print(f"[email] Failed: {res.status_code} {res.text}")
            return False
    except Exception as e:
        print(f"[email] Error: {e}")
        return False


def meet_invite_html(hospital_name: str, contact_name: str, meet_link: str,
                     meet_notes: str, ref_number: str) -> str:
    notes_block = f"""
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:16px;margin:20px 0;">
      <p style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">
        Message from Ubuzima Connect
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0;">{meet_notes}</p>
    </div>
    """ if meet_notes else ""

    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Plus Jakarta Sans',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0a2415,#1C5438);padding:32px 40px;">
      <p style="font-size:11px;font-weight:800;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Ubuzima Connect</p>
      <h1 style="font-size:22px;font-weight:900;color:#fff;margin:0;line-height:1.3;">
        Your Onboarding Meeting<br/>is Scheduled 📅
      </h1>
    </div>

    <!-- Body -->
    <div style="padding:32px 40px;">
      <p style="font-size:15px;color:#374151;margin:0 0 16px;">
        Dear <strong>{contact_name}</strong>,
      </p>
      <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0 0 20px;">
        Thank you for applying to partner with Ubuzima Connect.
        We have reviewed your application for <strong style="color:#0a2415;">{hospital_name}</strong>
        and would like to schedule an onboarding call to discuss the terms of your access
        and walk you through the platform.
      </p>

      {notes_block}

      <!-- Meet link box -->
      <div style="background:#f0fdf4;border:2px solid #34d399;border-radius:16px;padding:24px;text-align:center;margin:24px 0;">
        <p style="font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">
          Google Meet Link
        </p>
        <a href="{meet_link}"
           style="display:inline-block;background:#1C5438;color:#fff;font-size:14px;font-weight:800;
                  padding:14px 32px;border-radius:50px;text-decoration:none;letter-spacing:0.5px;">
          Join Meeting →
        </a>
        <p style="font-size:11px;color:#6b7280;margin:12px 0 0;">
          Or copy this link:<br/>
          <span style="font-family:monospace;font-size:12px;color:#1C5438;">{meet_link}</span>
        </p>
      </div>

      <p style="font-size:13px;color:#6b7280;line-height:1.7;margin:0 0 8px;">
        During the call we will:
      </p>
      <ul style="font-size:13px;color:#6b7280;line-height:1.8;padding-left:20px;margin:0 0 24px;">
        <li>Walk you through the Ubuzima Connect platform</li>
        <li>Review and confirm your Hospital Partner Agreement</li>
        <li>Answer any questions from your team</li>
        <li>Set up your admin credentials after confirmation</li>
      </ul>

      <div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:24px;">
        <p style="font-size:12px;color:#92400e;margin:0;">
          ⚠ Please ensure your Head of Radiology or IT Manager joins this call.
          Credentials will only be issued after the meeting is completed.
        </p>
      </div>

      <p style="font-size:13px;color:#6b7280;margin:0;">
        Your application reference: <strong style="font-family:monospace;color:#1C5438;">{ref_number}</strong>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:20px 40px;">
      <p style="font-size:11px;color:#9ca3af;margin:0;line-height:1.6;">
        Ubuzima Connect · AI-Powered Chest X-Ray Diagnostics · Rwanda<br/>
        Questions? Reply to this email or contact
        <a href="mailto:hospitals@ubuzimaconnect.rw" style="color:#1C5438;">hospitals@ubuzimaconnect.rw</a>
      </p>
    </div>
  </div>
</body>
</html>
"""


def approval_html(hospital_name: str, contact_name: str, ref_number: str) -> str:
    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Plus Jakarta Sans',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#0a2415,#1C5438);padding:32px 40px;">
      <p style="font-size:11px;font-weight:800;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Ubuzima Connect</p>
      <h1 style="font-size:22px;font-weight:900;color:#fff;margin:0;">Your Hospital is Approved ✅</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="font-size:15px;color:#374151;margin:0 0 16px;">Dear <strong>{contact_name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0 0 20px;">
        Congratulations! <strong style="color:#0a2415;">{hospital_name}</strong> has been approved as an
        Ubuzima Connect hospital partner. Your admin credentials will be sent shortly by our team.
      </p>
      <div style="background:#f0fdf4;border:2px solid #34d399;border-radius:16px;padding:24px;margin:24px 0;">
        <p style="font-size:13px;color:#166534;margin:0 0 8px;font-weight:700;">Next Steps</p>
        <ol style="font-size:13px;color:#166534;line-height:1.8;padding-left:20px;margin:0;">
          <li>Watch for an email with your admin credentials</li>
          <li>Log in at <a href="https://ubuzimaconnect.vercel.app" style="color:#1C5438;">ubuzimaconnect.vercel.app</a></li>
          <li>Upload your hospital logo from the Profile tab</li>
          <li>Invite your radiologists to register</li>
        </ol>
      </div>
      <p style="font-size:13px;color:#6b7280;">Reference: <strong style="font-family:monospace;color:#1C5438;">{ref_number}</strong></p>
    </div>
    <div style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:20px 40px;">
      <p style="font-size:11px;color:#9ca3af;margin:0;">Ubuzima Connect · Rwanda · <a href="mailto:hospitals@ubuzimaconnect.rw" style="color:#1C5438;">hospitals@ubuzimaconnect.rw</a></p>
    </div>
  </div>
</body>
</html>
"""


def rejection_html(hospital_name: str, contact_name: str, reason: str, ref_number: str) -> str:
    reason_block = f"""
    <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:12px;padding:16px;margin:20px 0;">
      <p style="font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Reason</p>
      <p style="font-size:14px;color:#374151;margin:0;">{reason}</p>
    </div>
    """ if reason else ""

    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Plus Jakarta Sans',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#450a0a,#991b1b);padding:32px 40px;">
      <p style="font-size:11px;font-weight:800;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Ubuzima Connect</p>
      <h1 style="font-size:22px;font-weight:900;color:#fff;margin:0;">Application Update</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="font-size:15px;color:#374151;margin:0 0 16px;">Dear <strong>{contact_name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0 0 20px;">
        Thank you for your interest in partnering with Ubuzima Connect.
        After reviewing your application for <strong style="color:#0a2415;">{hospital_name}</strong>,
        we are unable to proceed at this time.
      </p>
      {reason_block}
      <p style="font-size:13px;color:#6b7280;line-height:1.7;">
        You are welcome to reapply in the future or contact us for more information.
      </p>
      <p style="font-size:13px;color:#6b7280;margin-top:16px;">Reference: <strong style="font-family:monospace;color:#991b1b;">{ref_number}</strong></p>
    </div>
    <div style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:20px 40px;">
      <p style="font-size:11px;color:#9ca3af;margin:0;">Ubuzima Connect · Rwanda · <a href="mailto:hospitals@ubuzimaconnect.rw" style="color:#1C5438;">hospitals@ubuzimaconnect.rw</a></p>
    </div>
  </div>
</body>
</html>
"""


# ── REPLACE the existing update_hospital_application_status endpoint with this ──
@app.patch("/hospital/applications/{app_id}/status", response_model=HospitalApplicationOut, tags=["Hospital"])
async def update_hospital_application_status(
    app_id: int,
    body: HospitalAppStatusUpdate,
    admin: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    obj = db.query(HospitalApplication).filter(HospitalApplication.id == app_id).first()
    if not obj:
        raise HTTPException(404, "Application not found")

    obj.status = body.status
    obj.reviewed_by_id = admin.id

    if body.meet_link:
        obj.meet_link = body.meet_link
        obj.meet_scheduled_at = datetime.now(timezone.utc)
    if body.rejection_reason:
        obj.rejection_reason = body.rejection_reason

    db.commit()
    db.refresh(obj)
    _audit(db, admin.id, f"hospital_app_{body.status}", "hospital_application", app_id)

    # ── Send email based on status ──
    if body.status == "meeting" and body.meet_link:
        html = meet_invite_html(
            hospital_name=obj.name,
            contact_name=obj.contact_name,
            meet_link=body.meet_link,
            meet_notes=getattr(body, "meet_notes", "") or "",
            ref_number=obj.ref_number,
        )
        await send_email(obj.email, f"Your Onboarding Meeting — {obj.name}", html)

    elif body.status == "rejected":
        html = rejection_html(
            hospital_name=obj.name,
            contact_name=obj.contact_name,
            reason=body.rejection_reason or "",
            ref_number=obj.ref_number,
        )
        await send_email(obj.email, f"Your Application Update — {obj.name}", html)

    return obj


# ── REPLACE the existing approve_hospital_application endpoint with this ──
@app.post("/hospital/applications/{app_id}/approve", response_model=HospitalOut, tags=["Hospital"])
async def approve_hospital_application(
    app_id: int,
    admin: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    obj = db.query(HospitalApplication).filter(HospitalApplication.id == app_id).first()
    if not obj:
        raise HTTPException(404, "Application not found")

    # Idempotent: already fully approved — just return the hospital
    if obj.status == HospitalAppStatus.approved and obj.hospital_id:
        existing = db.query(Hospital).filter(Hospital.id == obj.hospital_id).first()
        if existing:
            return existing

    is_new = True

    # Hospital row might already exist (e.g. previous partial commit)
    if obj.hospital_id:
        hospital = db.query(Hospital).filter(Hospital.id == obj.hospital_id).first()
        if not hospital:
            raise HTTPException(500, "Hospital record missing — contact support")
        is_new = False
    else:
        hospital = Hospital(
            name=obj.name, type=obj.type, email=obj.email, phone=obj.phone,
            moh_license=obj.moh_license,
            license_document_name=obj.license_document_name,
            license_document_base64=obj.license_document_base64,
            website=obj.website,
            province=obj.province, district=obj.district, sector=obj.sector,
            address=obj.address, contact_name=obj.contact_name, contact_role=obj.contact_role,
            logo_base64=obj.logo_base64, num_radiologists=obj.num_radiologists,
            num_machines=obj.num_machines, monthly_volume=obj.monthly_volume,
            approved_at=datetime.now(timezone.utc), is_active=True,
        )
        db.add(hospital)
        db.flush()

    obj.status = HospitalAppStatus.approved
    obj.hospital_id = hospital.id
    obj.approved_at = obj.approved_at or datetime.now(timezone.utc)
    obj.reviewed_by_id = admin.id
    db.commit()
    db.refresh(hospital)

    if is_new:
        _audit(db, admin.id, "approve_hospital", "hospital", hospital.id, {"name": hospital.name})
        html = approval_html(
            hospital_name=hospital.name,
            contact_name=hospital.contact_name,
            ref_number=obj.ref_number,
        )
        await send_email(hospital.email, f"Congratulations — {hospital.name} is Approved!", html)

    return hospital

# ── Shared auth helper: super admin OR hospital's own admin ──
def _require_hospital_access(hospital_id: int, current_user: User):
    from auth import SUPER_ADMIN
    email = (current_user.email or "").lower()
    if email == SUPER_ADMIN and current_user.is_admin:
        return
    if current_user.hospital_id == hospital_id and current_user.is_admin:
        return
    raise HTTPException(403, "Access denied to this hospital.")


def _ensure_user_password_access(target_user: User, admin: User):
    from auth import SUPER_ADMIN
    admin_email = (admin.email or "").lower()
    if admin_email == SUPER_ADMIN and admin.is_admin:
        return
    if not admin.is_admin or not admin.hospital_id:
        raise HTTPException(403, "Only hospital admins can manage user passwords.")
    if target_user.hospital_id != admin.hospital_id or target_user.is_admin:
        raise HTTPException(403, "You can only manage approved radiologists in your own hospital.")

def _require_same_hospital_colleague(current_user: User, other_user: User):
    if not current_user.hospital_id:
        raise HTTPException(400, "Your account is not linked to a hospital.")
    if other_user.hospital_id != current_user.hospital_id:
        raise HTTPException(403, "You can only access radiologists in your own hospital.")
    if other_user.is_admin:
        raise HTTPException(403, "Hospital admins are not available in radiologist reports.")
    if _user_status_value(other_user).lower() != "approved":
        raise HTTPException(400, "The selected radiologist is not approved.")


def _user_status_value(user: User) -> str:
    status = getattr(user, "status", "")
    raw = status.value if hasattr(status, "value") else str(status)
    return str(raw).split(".")[-1].lower()


def _is_valid_uuid(value: str | None) -> bool:
    if not value:
        return False
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, TypeError, AttributeError):
        return False


async def _ensure_supabase_auth_user(db: Session, target_user: User, password: str) -> tuple[str | None, bool]:
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not service_key:
        raise HTTPException(500, "Password management is not configured on the server.")

    if _is_valid_uuid(target_user.firebase_uid):
        return target_user.firebase_uid, False

    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{os.getenv('SUPABASE_URL', 'https://omoinlmgsdtlzfasydgw.supabase.co')}/auth/v1/admin/users",
            headers={
                "Authorization": f"Bearer {service_key}",
                "apikey": service_key,
                "Content-Type": "application/json",
            },
            json={"email": target_user.email, "password": password, "email_confirm": True},
            timeout=10,
        )

    if res.status_code not in (200, 201):
        detail = res.json().get("message", res.text) if res.headers.get("content-type", "").startswith("application/json") else res.text
        raise HTTPException(400, f"Failed to create auth user: {detail}")

    supabase_uid = res.json().get("id")
    if not _is_valid_uuid(supabase_uid):
        raise HTTPException(500, "Supabase did not return a valid user ID.")

    target_user.firebase_uid = supabase_uid
    db.add(target_user)
    db.commit()
    db.refresh(target_user)
    return supabase_uid, True


async def _update_supabase_password(db: Session, target_user: User, new_password: str):
    supabase_uid, created = await _ensure_supabase_auth_user(db, target_user, new_password)
    if created or not supabase_uid:
        return

    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if service_key:
        async with httpx.AsyncClient() as client:
            res = await client.put(
                f"{os.getenv('SUPABASE_URL', 'https://omoinlmgsdtlzfasydgw.supabase.co')}/auth/v1/admin/users/{supabase_uid}",
                headers={
                    "Authorization": f"Bearer {service_key}",
                    "apikey": service_key,
                    "Content-Type": "application/json",
                },
                json={"password": new_password},
                timeout=10,
            )
        if res.status_code not in (200, 201):
            raise HTTPException(400, f"Password update failed: {res.json().get('message', res.text)}")


# Public: list approved hospitals for registration dropdown (no auth required)
@app.get("/hospitals/public", tags=["Hospital"])
def list_public_hospitals(db: Session = Depends(get_db)):
    hospitals = db.query(Hospital).filter(Hospital.is_active == True).order_by(Hospital.name).all()
    return [{"id": h.id, "name": h.name, "district": h.district, "province": h.province} for h in hospitals]


#  Super admin: list active hospitals
@app.get("/hospitals", response_model=list[HospitalOut], tags=["Hospital"])
def list_hospitals(
    admin: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    return db.query(Hospital).order_by(Hospital.created_at.desc()).all()

# Super admin: hospital stats summary
@app.get("/hospitals/stats/summary", tags=["Hospital"])
def hospital_stats(
    admin: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    total_apps   = db.query(HospitalApplication).count()
    pending      = db.query(HospitalApplication).filter(
        HospitalApplication.status.in_(["pending","reviewing","meeting"])
    ).count()
    active       = db.query(Hospital).filter(Hospital.is_active == True).count()
    total_rads   = db.query(User).filter(
        User.hospital_id != None, User.status == "approved"
    ).count()
    return {
        "total_applications": total_apps,
        "pending_review": pending,
        "active_hospitals": active,
        "total_radiologists": total_rads,
    }
    
# Public: get hospital branding by id (for radiologist dashboard)
@app.get("/hospitals/{hospital_id}/branding", tags=["Hospital"])
def get_hospital_branding(
    hospital_id: int,
    db: Session = Depends(get_db),
):
    h = db.query(Hospital).filter(Hospital.id == hospital_id, Hospital.is_active == True).first()
    if not h:
        raise HTTPException(404, "Hospital not found")
    return {
        "id": h.id,
        "name": h.name,
        "logo_base64": h.logo_base64,
        "district": h.district,
        "province": h.province,
    }

# Super admin OR hospital's own admin
@app.get("/hospitals/{hospital_id}", response_model=HospitalOut, tags=["Hospital"])
def get_hospital(
    hospital_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_hospital_access(hospital_id, current_user)
    h = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not h:
        raise HTTPException(404, "Hospital not found")
    return h


@app.get("/hospitals/{hospital_id}/license-document", tags=["Hospital"])
def get_hospital_license_document(
    hospital_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_hospital_access(hospital_id, current_user)
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(404, "Hospital not found")
    if not hospital.license_document_base64 or not hospital.license_document_name:
        raise HTTPException(404, "No health facility license document uploaded.")
    media_type, raw = _decode_data_uri(hospital.license_document_base64)
    headers = {"Content-Disposition": f'inline; filename="{hospital.license_document_name}"'}
    return Response(content=raw, media_type=media_type, headers=headers)


@app.patch("/users/{user_id}/assign-hospital", response_model=UserOut, tags=["Admin"])
def assign_hospital_admin(
    user_id: int,
    body: dict = Body(...),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Assign an approved user as middle admin for a specific hospital.
    - Sets user.hospital_id to link them to the hospital
    - Sets user.is_admin = True so they see the logo upload in Profile tab
    - Only platform admin (leslyndiz6@gmail.com) can do this
    """
    user = _get_or_404(db, User, user_id)
 
    if user.status != "approved":
        raise HTTPException(400, "User must be approved before being assigned as hospital admin.")
 
    hospital_id = body.get("hospital_id")
    make_admin  = body.get("make_admin", True)
 
    if hospital_id:
        # Verify hospital exists and is active
        hospital = db.query(Hospital).filter(
            Hospital.id == hospital_id,
            Hospital.is_active == True
        ).first()
        if not hospital:
            raise HTTPException(404, "Hospital not found or not active.")
 
        user.hospital_id = hospital_id
        if make_admin:
            user.is_admin = True
 
    else:
        # Remove hospital assignment (demote)
        user.hospital_id = None
        user.is_admin = False
 
    db.commit()
    db.refresh(user)
    _audit(db, admin.id, "assign_hospital_admin", "user", user_id, {
        "hospital_id": hospital_id,
        "target_email": user.email
    })
    return user


# ── Current user info ──
@app.get("/me", response_model=UserOut, tags=["Auth"])
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@app.get("/hospitals/{hospital_id}/stats", tags=["Hospital"])
def get_hospital_stats(
    hospital_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_hospital_access(hospital_id, current_user)
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(404, "Hospital not found")

    users = db.query(User).filter(User.hospital_id == hospital_id, User.is_admin == False).all()
    rad_ids = [u.id for u in users]

    # Only count patients who have at least one diagnosis
    if rad_ids:
        diagnosed_patient_ids = (
            db.query(Diagnosis.patient_id)
            .filter(Diagnosis.radiologist_id.in_(rad_ids))
            .distinct()
            .subquery()
        )
        total_patients = db.query(Patient).filter(
            Patient.radiologist_id.in_(rad_ids),
            Patient.id.in_(diagnosed_patient_ids),
        ).count()
    else:
        total_patients = 0
    total_dx = db.query(Diagnosis).filter(Diagnosis.radiologist_id.in_(rad_ids)).count() if rad_ids else 0

    last_dx = (
        db.query(Diagnosis)
        .filter(Diagnosis.radiologist_id.in_(rad_ids))
        .order_by(Diagnosis.created_at.desc())
        .first()
        if rad_ids else None
    )

    return {
        "hospital_id": hospital_id,
        "hospital_name": hospital.name,
        "radiologists": {
            "total": len(users),
            "approved": sum(1 for u in users if str(u.status) in ("approved", "UserStatus.approved")),
            "pending": sum(1 for u in users if str(u.status) in ("pending", "UserStatus.pending")),
        },
        "patients": {"total": total_patients},
        "diagnoses": {
            "total": total_dx,
        },
        "last_activity": last_dx.created_at.isoformat() if last_dx else None,
    }


@app.get("/hospitals/{hospital_id}/radiologists", tags=["Hospital"])
def get_hospital_radiologists(
    hospital_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from auth import SUPER_ADMIN
    email = (current_user.email or "").lower()
    if not (
        (email == SUPER_ADMIN and current_user.is_admin) or
        current_user.hospital_id == hospital_id
    ):
        raise HTTPException(403, "Access denied to this hospital.")
    users = db.query(User).filter(User.hospital_id == hospital_id, User.is_admin == False).all()
    result = []
    for u in users:
        dx_count = db.query(Diagnosis).filter(Diagnosis.radiologist_id == u.id).count()
        result.append({
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role.value if hasattr(u.role, "value") else str(u.role or "radiologist"),
            "hospital": u.hospital,
            "hospital_id": u.hospital_id,
            "is_admin": u.is_admin,
            "specialization": u.specialization,
            "license_number": u.license_number,
            "years_experience": u.years_experience,
            "phone_number": u.phone_number,
            "status": u.status.value if hasattr(u.status, "value") else str(u.status),
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "approved_at": u.approved_at.isoformat() if u.approved_at else None,
            "firebase_uid": u.firebase_uid,
            "total_diagnoses": dx_count,
        })
    return result


@app.post("/hospitals/{hospital_id}/create-admin", tags=["Hospital"])
async def create_hospital_admin(
    hospital_id: int,
    body: dict = Body(...),
    admin: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id, Hospital.is_active == True).first()
    if not hospital:
        raise HTTPException(404, "Hospital not found or not active")

    email = (body.get("email") or "").lower().strip()
    full_name = (body.get("full_name") or "").strip()
    password = (body.get("password") or "").strip()

    if not email or not full_name or not password:
        raise HTTPException(400, "email, full_name, and password are required")
    if len(password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(400, f"A user with email {email} already exists")

    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    supabase_uid = None

    if service_key:
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    f"{os.getenv('SUPABASE_URL', 'https://omoinlmgsdtlzfasydgw.supabase.co')}/auth/v1/admin/users",
                    headers={
                        "Authorization": f"Bearer {service_key}",
                        "apikey": service_key,
                        "Content-Type": "application/json",
                    },
                    json={"email": email, "password": password, "email_confirm": True},
                    timeout=10,
                )
            if res.status_code in (200, 201):
                supabase_uid = res.json().get("id", "")
            else:
                raise HTTPException(400, f"Supabase error: {res.json().get('message', res.text)}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, f"Failed to create auth user: {e}")

    new_user = User(
        firebase_uid=supabase_uid or f"hosp_{hospital_id}_{email}",
        email=email,
        full_name=full_name,
        hospital_id=hospital_id,
        hospital=hospital.name,
        is_admin=True,
        status=UserStatus.approved,
        approved_at=datetime.now(timezone.utc),
        approved_by_id=admin.id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    _audit(db, admin.id, "create_hospital_admin", "user", new_user.id, {
        "hospital": hospital.name, "email": email,
    })

    # Send credentials email (no-op if SMTP not configured)
    _send_admin_credentials_email(email, full_name, password, hospital.name)

    return {
        "user_id": new_user.id,
        "email": email,
        "full_name": full_name,
        "hospital_id": hospital_id,
        "hospital_name": hospital.name,
        "message": "Hospital admin created. Credentials email sent if SMTP is configured.",
    }


@app.delete("/hospitals/{hospital_id}", tags=["Hospital"])
def delete_hospital(
    hospital_id: int,
    admin: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(404, "Hospital not found")

    # Gather all linked users
    linked_users = db.query(User).filter(User.hospital_id == hospital_id).all()
    linked_ids   = [u.id for u in linked_users]

    if linked_ids:
        # Delete diagnoses for all linked users
        db.query(Diagnosis).filter(Diagnosis.radiologist_id.in_(linked_ids)).delete(synchronize_session=False)
        # Delete patients for all linked users
        db.query(Patient).filter(Patient.radiologist_id.in_(linked_ids)).delete(synchronize_session=False)
        # Delete audit logs for linked users
        db.query(AuditLog).filter(AuditLog.user_id.in_(linked_ids)).delete(synchronize_session=False)
        # Delete the users themselves
        db.query(User).filter(User.id.in_(linked_ids)).delete(synchronize_session=False)

    # Detach from application
    db.query(HospitalApplication).filter(
        HospitalApplication.hospital_id == hospital_id
    ).update({"hospital_id": None}, synchronize_session=False)

    name = hospital.name
    db.delete(hospital)
    db.commit()
    _audit(db, admin.id, "delete_hospital", "hospital", hospital_id, {
        "name": name, "users_deleted": len(linked_ids)
    })
    return {"detail": f"Hospital '{name}', {len(linked_ids)} user(s), and all their data permanently deleted."}


# ── GET hospital middle admin info ──
@app.get("/hospitals/{hospital_id}/admin", tags=["Hospital"])
def get_hospital_admin_info(
    hospital_id: int,
    admin: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    """Return the middle admin user for a hospital (super admin only)."""
    ha = db.query(User).filter(
        User.hospital_id == hospital_id,
        User.is_admin == True,
    ).first()
    if not ha:
        return {"admin": None}
    return {
        "admin": {
            "id":         ha.id,
            "email":      ha.email,
            "full_name":  ha.full_name,
            "last_login": ha.last_login.isoformat() if ha.last_login else None,
            "created_at": ha.created_at.isoformat() if ha.created_at else None,
        }
    }


# ── Super admin: change hospital admin password ──
@app.patch("/hospitals/{hospital_id}/admin-password", tags=["Hospital"])
async def change_hospital_admin_password(
    hospital_id: int,
    body: dict = Body(...),
    admin: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    """Super admin resets the middle admin's password for a hospital."""
    new_password = (body.get("password") or "").strip()
    if len(new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    ha = db.query(User).filter(
        User.hospital_id == hospital_id,
        User.is_admin == True,
    ).first()
    if not ha:
        raise HTTPException(404, "No admin found for this hospital")

    await _update_supabase_password(db, ha, new_password)

    _audit(db, admin.id, "change_admin_password", "user", ha.id, {
        "hospital_id": hospital_id, "target_email": ha.email
    })
    return {"detail": "Password updated successfully", "admin_email": ha.email}


@app.post("/users/{user_id}/generate-password", tags=["Admin"])
async def generate_user_password(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    target_user = _get_or_404(db, User, user_id)
    _ensure_user_password_access(target_user, admin)
    if _user_status_value(target_user) != "approved":
        raise HTTPException(400, "Approve the user before generating a password.")

    alphabet = string.ascii_letters + string.digits
    password = "".join(random.SystemRandom().choice(alphabet) for _ in range(12))
    await _update_supabase_password(db, target_user, password)
    _audit(db, admin.id, "admin_generate_password", "user", target_user.id, {
        "target_email": target_user.email
    })
    return {"detail": "Password generated successfully", "email": target_user.email, "password": password}


@app.post("/users/{user_id}/set-password", tags=["Admin"])
async def set_user_password(
    user_id: int,
    body: dict = Body(...),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    target_user = _get_or_404(db, User, user_id)
    _ensure_user_password_access(target_user, admin)
    if _user_status_value(target_user) != "approved":
        raise HTTPException(400, "Approve the user before setting a password.")

    new_password = (body.get("password") or "").strip()
    if len(new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    await _update_supabase_password(db, target_user, new_password)
    _audit(db, admin.id, "admin_set_password", "user", target_user.id, {
        "target_email": target_user.email
    })
    return {"detail": "Password updated successfully", "email": target_user.email}


# ── Any authenticated user: change own password ──
@app.patch("/me/password", tags=["Auth"])
async def change_my_password(
    body: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """User changes their own password. Action is audited so super admin can see it."""
    new_password = (body.get("password") or "").strip()
    if len(new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    await _update_supabase_password(db, current_user, new_password)

    _audit(db, current_user.id, "change_own_password", "user", current_user.id, {
        "email": current_user.email
    })
    return {"detail": "Password updated successfully"}


# ── Upload hospital logo via FormData (Dashboard.tsx) ──
@app.post("/hospitals/{hospital_id}/logo", tags=["Hospital"])
async def upload_hospital_logo_form(
    hospital_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Middle admin or super admin uploads logo as multipart file. Auto-resized to 400×400."""
    _require_hospital_access(hospital_id, current_user)
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(404, "Hospital not found")
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "Only JPG, PNG or WebP allowed")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 5 MB)")
    try:
        if _PIL_AVAILABLE:
            img = _PILImage.open(io.BytesIO(data)).convert("RGB")
            img.thumbnail((400, 400))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85)
            b64 = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        else:
            b64 = "data:image/jpeg;base64," + base64.b64encode(data).decode()
    except Exception:
        b64 = "data:image/jpeg;base64," + base64.b64encode(data).decode()
    hospital.logo_base64 = b64
    db.commit()
    _audit(db, current_user.id, "upload_hospital_logo", "hospital", hospital_id, {"name": hospital.name})
    return {"detail": "Logo uploaded", "logo_base64": b64}


# ── Upload hospital logo via JSON base64 (AdminDashboard.tsx) ──
@app.patch("/hospitals/{hospital_id}/logo", tags=["Hospital"])
def upload_hospital_logo_json(
    hospital_id: int,
    body: dict = Body(...),
    current_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Middle admin or super admin uploads logo as base64 JSON."""
    _require_hospital_access(hospital_id, current_user)
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(404, "Hospital not found")
    logo_b64 = body.get("logo_base64", "")
    if not logo_b64:
        raise HTTPException(400, "logo_base64 is required")
    hospital.logo_base64 = logo_b64
    db.commit()
    _audit(db, current_user.id, "upload_hospital_logo", "hospital", hospital_id, {"name": hospital.name})
    return {"detail": "Logo updated"}


# ── Super admin: remove hospital logo ──
@app.delete("/hospitals/{hospital_id}/logo", tags=["Hospital"])
def remove_hospital_logo(
    hospital_id: int,
    admin: User = Depends(get_super_admin),
    db: Session = Depends(get_db),
):
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(404, "Hospital not found")
    hospital.logo_base64 = None
    db.commit()
    _audit(db, admin.id, "remove_hospital_logo", "hospital", hospital_id, {"name": hospital.name})
    return {"detail": "Logo removed"}


# ── Email helper ──
def _send_admin_credentials_email(email: str, name: str, password: str, hospital_name: str):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")

    if not smtp_user or not smtp_pass:
        print(f"[email] SMTP not configured — skipping credential email to {email}")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Your Ubuzima Connect Admin Access — {hospital_name}"
        msg["From"]    = f"Ubuzima Connect <{smtp_user}>"
        msg["To"]      = email

        html = f"""
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1C5438;padding:28px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;font-size:20px;">Welcome to Ubuzima Connect</h1>
          </div>
          <div style="background:#f9fafb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
            <p style="color:#374151;">Dear <strong>{name}</strong>,</p>
            <p style="color:#6b7280;">You have been set up as Hospital Admin for
               <strong>{hospital_name}</strong> on Ubuzima Connect.</p>
            <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:24px 0;">
              <p style="margin:0 0 8px;color:#374151;"><strong>Your login credentials:</strong></p>
              <p style="margin:4px 0;color:#6b7280;">Email:
                <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">{email}</code></p>
              <p style="margin:4px 0;color:#6b7280;">Password:
                <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">{password}</code></p>
            </div>
            <p style="color:#6b7280;">Sign in at your hospital admin dashboard and change your password after first login.</p>
            <p style="color:#9ca3af;font-size:11px;margin-top:28px;">Ubuzima Connect · Do not share your credentials</p>
          </div>
        </div>"""

        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(smtp_host, smtp_port) as s:
            s.starttls()
            s.login(smtp_user, smtp_pass)
            s.sendmail(smtp_user, email, msg.as_string())
        print(f"[email] Credentials sent to {email}")
    except Exception as e:
        print(f"[email] Failed to send to {email}: {e}")

