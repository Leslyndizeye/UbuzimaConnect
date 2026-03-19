# schemas.py
# Pydantic v2 schemas for all API request/response bodies

from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, field_validator
import re


NAME_RE = re.compile(r"^[A-Za-z][A-Za-z .'-]{1,98}[A-Za-z]$")
LICENSE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9/-]{3,29}$")
RW_PHONE_RE = re.compile(r"^(?:\+?250|0)?7\d{8}$")
HOSPITAL_TYPE_RE = re.compile(r"^(Public|Private)$")
LICENSE_DOC_RE = re.compile(r"^data:(application/pdf|image/png|image/jpeg|image/webp);base64,")


# USER / AUTH

class UserCreate(BaseModel):
    firebase_uid:     str
    email:            EmailStr
    full_name:        str
    hospital:         Optional[str] = None
    hospital_id:      Optional[int] = None
    national_id:      str
    license_number:   str
    years_experience: int
    phone_number:     str
    specialization:   Optional[str] = None

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        value = " ".join(value.strip().split())
        if not NAME_RE.fullmatch(value):
            raise ValueError("Full name must use letters only, without numbers or symbols.")
        return value

    @field_validator("national_id")
    @classmethod
    def validate_national_id(cls, value: str) -> str:
        value = re.sub(r"\s+", "", value)
        if not re.fullmatch(r"\d{16}", value):
            raise ValueError("National ID must be exactly 16 digits.")
        return value

    @field_validator("license_number")
    @classmethod
    def validate_license_number(cls, value: str) -> str:
        value = value.strip().upper()
        if not LICENSE_RE.fullmatch(value):
            raise ValueError("License number must be 4-30 characters using letters, numbers, slash or hyphen.")
        return value

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, value: str) -> str:
        value = re.sub(r"[^\d+]", "", value.strip())
        if not RW_PHONE_RE.fullmatch(value):
            raise ValueError("Phone number must be a valid Rwanda mobile number.")
        if value.startswith("0"):
            return "+250" + value[1:]
        if value.startswith("250"):
            return "+" + value
        return value

    @field_validator("years_experience")
    @classmethod
    def validate_years_experience(cls, value: int) -> int:
        if value < 0 or value > 50:
            raise ValueError("Years of experience must be between 0 and 50.")
        return value

    @field_validator("specialization")
    @classmethod
    def validate_specialization(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = " ".join(value.strip().split())
        if value and not NAME_RE.fullmatch(value):
            raise ValueError("Specialization must use letters only.")
        return value or None

class UserOut(BaseModel):
    id:               int
    firebase_uid:     str
    email:            str
    full_name:        str
    hospital:         Optional[str]
    hospital_id:      Optional[int]       
    national_id:      Optional[str]
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


# PATIENT


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



# PREDICTION / DIAGNOSIS


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
    xray_storage_path:     Optional[str] = None
    xray_b64:              Optional[str] = None


class DiagnosisSave(BaseModel):
    """Body for POST /diagnoses — saves a prediction to the DB."""
    patient_id:            int
    xray_filename:         Optional[str]  = None
    xray_storage_path:     Optional[str]  = None
    xray_b64:              Optional[str]  = None
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
    xray_b64:               Optional[str]
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


# RETRAINING

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



# STATS / MONITORING

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
    
# HOSPITAL SCHEMAS 


class HospitalApplicationCreate(BaseModel):
    # Organisation
    name:        str
    type:        Optional[str] = None
    email:       EmailStr
    phone:       str
    moh_license: Optional[str] = None
    license_document_name: str
    license_document_base64: str
    website:     Optional[str] = None
    logo_base64: Optional[str] = None
    # Location
    province:     str
    district:     str
    sector:       Optional[str] = None
    address:      str
    contact_name: str
    contact_role: str
    # Capacity
    num_radiologists:   str
    num_machines:       str
    monthly_volume:     str
    current_system:     Optional[str] = None
    primary_conditions: Optional[str] = None
    heard_from:         Optional[str] = None
    notes:              Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip().title()
        if not HOSPITAL_TYPE_RE.fullmatch(value):
            raise ValueError("Facility type must be Public or Private.")
        return value

    @field_validator("license_document_name")
    @classmethod
    def validate_license_document_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Health facility license document is required.")
        return value

    @field_validator("license_document_base64")
    @classmethod
    def validate_license_document_base64(cls, value: str) -> str:
        if not LICENSE_DOC_RE.match(value or ""):
            raise ValueError("Upload a PDF, PNG, JPG, or WebP health facility license.")
        return value


class HospitalApplicationOut(BaseModel):
    id:           int
    ref_number:   str
    hospital_id:  Optional[int] = None
    name:         str
    type:         Optional[str]
    email:        str
    phone:        Optional[str]
    moh_license:  Optional[str]
    license_document_name: Optional[str]
    province:     Optional[str]
    district:     Optional[str]
    address:      Optional[str]
    contact_name: Optional[str]
    contact_role: Optional[str]
    num_radiologists: Optional[str]
    num_machines:     Optional[str]
    monthly_volume:   Optional[str]
    notes:            Optional[str]
    status:           str
    meet_link:        Optional[str]
    rejection_reason: Optional[str]
    logo_base64:      Optional[str]
    created_at:       datetime
    approved_at:      Optional[datetime]

    class Config:
        from_attributes = True


class HospitalAppStatusUpdate(BaseModel):
    status: str
    meet_link: Optional[str] = None
    meet_notes: Optional[str] = None    
    rejection_reason: Optional[str] = None

class HospitalOut(BaseModel):
    id:               int
    name:             str
    type:             Optional[str]
    email:            str
    phone:            Optional[str]
    moh_license:      Optional[str]
    license_document_name: Optional[str]
    website:          Optional[str]
    province:         Optional[str]
    district:         Optional[str]
    address:          Optional[str]
    contact_name:     Optional[str]
    contact_role:     Optional[str]
    logo_base64:      Optional[str]
    num_radiologists: Optional[str]
    num_machines:     Optional[str]
    monthly_volume:   Optional[str]
    is_active:        bool
    created_at:       datetime
    approved_at:      Optional[datetime]

    class Config:
        from_attributes = True
