# schemas.py
# Pydantic v2 schemas for all API request/response bodies

from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, field_validator


# ─────────────────────────────────────────────────────────────
# USER / AUTH
# ─────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    firebase_uid:     str
    email:            EmailStr
    full_name:        str
    hospital:         Optional[str] = None
    license_number:   Optional[str] = None
    years_experience: Optional[int] = None
    phone_number:     Optional[str] = None
    specialization:   Optional[str] = None


class UserOut(BaseModel):
    id:               int
    firebase_uid:     str
    email:            str
    full_name:        str
    hospital:         Optional[str]
    license_number:   Optional[str]
    years_experience: Optional[int]
    phone_number:     Optional[str]
    specialization:   Optional[str]
    role:             str
    status:           str
    is_admin:         bool
    created_at:       datetime
    approved_at:      Optional[datetime]
    rejection_reason: Optional[str]

    class Config:
        from_attributes = True


class UserStatusUpdate(BaseModel):
    status:           str    # "approved" | "rejected" | "revoked"
    rejection_reason: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# PATIENT
# ─────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    name:           str
    patient_ref_id: Optional[str]  = None
    age:            Optional[int]  = None
    sex:            Optional[str]  = None
    hospital:       Optional[str]  = None
    clinical_notes: Optional[str]  = None


class PatientOut(BaseModel):
    id:             int
    name:           str
    patient_ref_id: Optional[str]
    age:            Optional[int]
    sex:            Optional[str]
    hospital:       Optional[str]
    clinical_notes: Optional[str]
    radiologist_id: int
    created_at:     datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────
# PREDICTION / DIAGNOSIS
# ─────────────────────────────────────────────────────────────

class PredictionResponse(BaseModel):
    """Returned immediately from POST /predict (not saved yet)."""
    classification:        str
    confidence_score:      float
    tb_probability:        float
    pneumonia_probability: float
    normal_probability:    float
    unknown_probability:   float
    explanation:           str
    gradcam_b64:           Optional[str]   # data:image/png;base64,...


class DiagnosisSave(BaseModel):
    """Body for POST /diagnoses — saves a prediction to the DB."""
    patient_id:            int
    xray_filename:         Optional[str]  = None
    xray_storage_path:     Optional[str]  = None
    heatmap_b64:           Optional[str]  = None
    ai_classification:     str
    tb_probability:        float
    pneumonia_probability: float
    normal_probability:    float
    unknown_probability:   float
    confidence_score:      float
    ai_explanation:        Optional[str]  = None


class DiagnosisVerify(BaseModel):
    """Body for PATCH /diagnoses/{id}/verify."""
    override:          Optional[str]  = None   # null = accepted AI result
    radiologist_notes: Optional[str]  = None


class DiagnosisOut(BaseModel):
    id:                     int
    patient_id:             int
    radiologist_id:         int
    xray_filename:          Optional[str]
    xray_storage_path:      Optional[str]
    ai_classification:      str
    tb_probability:         Optional[float]
    pneumonia_probability:  Optional[float]
    normal_probability:     Optional[float]
    confidence_score:       Optional[float]
    ai_explanation:         Optional[str]
    radiologist_verified:   bool
    radiologist_override:   Optional[str]
    radiologist_notes:      Optional[str]
    verified_at:            Optional[datetime]
    created_at:             datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────
# RETRAIN
# ─────────────────────────────────────────────────────────────

class RetrainJobOut(BaseModel):
    id:             int
    status:         str
    image_counts:   Optional[dict]
    start_time:     Optional[datetime]
    end_time:       Optional[datetime]
    final_val_auc:  Optional[float]
    final_val_acc:  Optional[float]
    error_message:  Optional[str]
    created_at:     datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────
# STATS / MONITORING
# ─────────────────────────────────────────────────────────────

class SystemStats(BaseModel):
    total_radiologists:  int
    pending_requests:    int
    total_patients:      int
    total_diagnoses:     int
    model_status:        str
    model_size_mb:       Optional[float]
    model_last_updated:  Optional[str]
    uptime_seconds:      float


class ModelInfo(BaseModel):
    status:        str
    path:          str
    size_mb:       Optional[float]
    last_modified: Optional[str]
    classes:       List[str]
    architecture:  str
    input_shape:   List[int]