# database.py
# PostgreSQL schema for Ubuzima Connect
# Tables: users, patients, diagnoses, xray_uploads, audit_logs, retrain_jobs

import os
from dotenv import load_dotenv
load_dotenv()  # must be before os.getenv calls
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Boolean,
    DateTime, Text, ForeignKey, Enum as SAEnum, JSON
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.sql import func
import enum

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://ubuzima:ubuzima_pass@localhost:5432/ubuzima_connect"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()



# ENUMS


class UserStatus(str, enum.Enum):
    pending  = "pending"
    approved = "approved"
    rejected = "rejected"
    revoked  = "revoked"

class UserRole(str, enum.Enum):
    radiologist = "radiologist"
    admin       = "admin"

class DiagnosisClass(str, enum.Enum):
    Normal      = "Normal"
    TB          = "TB"
    Pneumonia   = "Pneumonia"
    Unknown     = "Unknown"

class RetrainStatus(str, enum.Enum):
    pending    = "pending"
    processing = "processing"
    completed  = "completed"
    failed     = "failed"


# TABLES


class User(Base):
    """
    Radiologists and admins. Firebase UID is the primary link to Auth.
    Status starts as 'pending' until admin approves.
    """
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    firebase_uid    = Column(String(128), unique=True, nullable=False, index=True)
    email           = Column(String(255), unique=True, nullable=False)
    full_name       = Column(String(255), nullable=False)
    hospital        = Column(String(255))
    license_number  = Column(String(100))
    years_experience= Column(Integer)
    phone_number    = Column(String(30))
    specialization  = Column(String(255))
    role            = Column(SAEnum(UserRole), default=UserRole.radiologist, nullable=False)
    status          = Column(SAEnum(UserStatus), default=UserStatus.pending, nullable=False)
    is_admin        = Column(Boolean, default=False)
    rejection_reason= Column(Text)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    approved_at     = Column(DateTime(timezone=True))
    approved_by_id  = Column(Integer, ForeignKey("users.id"))
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    patients   = relationship("Patient",   back_populates="radiologist")
    diagnoses  = relationship("Diagnosis", back_populates="radiologist")
    audit_logs = relationship("AuditLog",  back_populates="user")


class Patient(Base):
    """
    Patient records created by radiologists during X-ray upload.
    """
    __tablename__ = "patients"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(255), nullable=False)
    patient_ref_id  = Column(String(100))          # Hospital file/chart number
    age             = Column(Integer)
    sex             = Column(String(10))
    hospital        = Column(String(255))
    clinical_notes  = Column(Text)
    radiologist_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    radiologist = relationship("User",      back_populates="patients")
    diagnoses   = relationship("Diagnosis", back_populates="patient")


class Diagnosis(Base):
    """
    Each AI prediction result, linked to patient and radiologist.
    Human-in-the-loop: radiologist_verified + radiologist_override fields.
    """
    __tablename__ = "diagnoses"

    id                      = Column(Integer, primary_key=True, index=True)
    patient_id              = Column(Integer, ForeignKey("patients.id"), nullable=False)
    radiologist_id          = Column(Integer, ForeignKey("users.id"), nullable=False)

    # X-ray storage
    xray_filename           = Column(String(500))
    xray_storage_path       = Column(String(1000))   # Firebase Storage URL or local path
    heatmap_b64             = Column(Text)            # base64 Grad-CAM PNG

    # AI prediction output
    ai_classification       = Column(SAEnum(DiagnosisClass), nullable=False)
    tb_probability          = Column(Float)
    pneumonia_probability   = Column(Float)
    normal_probability      = Column(Float)
    unknown_probability     = Column(Float)
    confidence_score        = Column(Float)
    ai_explanation          = Column(Text)

    # Human-in-the-loop
    radiologist_verified    = Column(Boolean, default=False)
    radiologist_override    = Column(String(50))      # null if accepted, else overridden class
    radiologist_notes       = Column(Text)
    verified_at             = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    patient     = relationship("Patient", back_populates="diagnoses")
    radiologist = relationship("User",    back_populates="diagnoses")


class XrayUpload(Base):
    """
    Tracks bulk X-ray uploads intended for retraining.
    """
    __tablename__ = "xray_uploads"

    id              = Column(Integer, primary_key=True, index=True)
    uploaded_by_id  = Column(Integer, ForeignKey("users.id"))
    filename        = Column(String(500), nullable=False)
    storage_path    = Column(String(1000))
    label           = Column(String(50))    # class label provided by uploader
    preprocessed    = Column(Boolean, default=False)
    used_in_retrain = Column(Boolean, default=False)
    upload_batch_id = Column(String(100))   # groups files from same bulk upload
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


class RetrainJob(Base):
    """
    Tracks retraining jobs triggered via the API.
    Enables async retraining with status polling.
    """
    __tablename__ = "retrain_jobs"

    id              = Column(Integer, primary_key=True, index=True)
    triggered_by_id = Column(Integer, ForeignKey("users.id"))
    status          = Column(SAEnum(RetrainStatus), default=RetrainStatus.pending)
    image_counts    = Column(JSON)           # {"Normal":150,"Pneumonia":80,...}
    start_time      = Column(DateTime(timezone=True))
    end_time        = Column(DateTime(timezone=True))
    final_val_auc   = Column(Float)
    final_val_acc   = Column(Float)
    error_message   = Column(Text)
    history_json    = Column(JSON)           # full training history
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    """
    Immutable audit trail — every meaningful action is recorded here.
    """
    __tablename__ = "audit_logs"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    action     = Column(String(100), nullable=False)  # e.g. "approve_radiologist"
    entity     = Column(String(100))                  # e.g. "user", "diagnosis"
    entity_id  = Column(Integer)
    detail     = Column(JSON)                         # extra metadata
    timestamp  = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="audit_logs")



# DB DEPENDENCY and INIT


def get_db():
    """FastAPI dependency — yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Safe to call on startup (no-op if tables exist)."""
    Base.metadata.create_all(bind=engine)
    print(" Database tables initialized")