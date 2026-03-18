# database.py
# PostgreSQL schema for Ubuzima Connect
# Tables: users, patients, diagnoses, xray_uploads, audit_logs, retrain_jobs,
#         hospitals, hospital_applications, chat_messages

import os
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Boolean,
    DateTime, Text, ForeignKey, Enum as SAEnum, JSON, text
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


# ─────────────────────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────────────────────

class UserStatus(str, enum.Enum):
    pending  = "pending"
    approved = "approved"
    rejected = "rejected"
    revoked  = "revoked"

class UserRole(str, enum.Enum):
    radiologist = "radiologist"
    admin       = "admin"

class DiagnosisClass(str, enum.Enum):
    Normal    = "Normal"
    TB        = "TB"
    Pneumonia = "Pneumonia"
    Unknown   = "Unknown"

class RetrainStatus(str, enum.Enum):
    pending    = "pending"
    processing = "processing"
    completed  = "completed"
    failed     = "failed"

class HospitalAppStatus(str, enum.Enum):
    pending   = "pending"
    reviewing = "reviewing"
    meeting   = "meeting"
    approved  = "approved"
    rejected  = "rejected"


# ─────────────────────────────────────────────────────────────
# TABLES
# ─────────────────────────────────────────────────────────────

class Hospital(Base):
    """
    Approved hospital partners. Created when a HospitalApplication is approved.
    Radiologists belong to a hospital via hospital_id on User.
    """
    __tablename__ = "hospitals"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(255), nullable=False)
    type            = Column(String(100))               # Public / Private / NGO / District / Referral
    email           = Column(String(255), unique=True, nullable=False)
    phone           = Column(String(50))
    moh_license     = Column(String(100))               # Ministry of Health license number
    license_document_name   = Column(String(255))
    license_document_base64 = Column(Text)
    website         = Column(String(255))
    province        = Column(String(100))
    district        = Column(String(100))
    sector          = Column(String(100))
    address         = Column(Text)
    contact_name    = Column(String(255))
    contact_role    = Column(String(255))
    logo_base64     = Column(Text)                      # base64 encoded logo image
    num_radiologists= Column(String(50))                # "2-3", "4-6", etc.
    num_machines    = Column(String(50))
    monthly_volume  = Column(String(50))
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    approved_at     = Column(DateTime(timezone=True))

    users        = relationship("User", back_populates="hospital_org")
    application  = relationship("HospitalApplication", back_populates="hospital", uselist=False)


class HospitalApplication(Base):
    """
    Hospital partnership applications submitted via the public portal.
    Progresses through: pending → reviewing → meeting → approved / rejected
    """
    __tablename__ = "hospital_applications"

    id              = Column(Integer, primary_key=True, index=True)
    ref_number      = Column(String(50), unique=True, nullable=False)  # e.g. UBZ-K3F9A2

    # Organisation
    name            = Column(String(255), nullable=False)
    type            = Column(String(100))
    email           = Column(String(255), nullable=False)
    phone           = Column(String(50))
    moh_license     = Column(String(100))
    license_document_name   = Column(String(255))
    license_document_base64 = Column(Text)
    website         = Column(String(255))
    logo_base64     = Column(Text)

    # Location
    province        = Column(String(100))
    district        = Column(String(100))
    sector          = Column(String(100))
    address         = Column(Text)
    contact_name    = Column(String(255))
    contact_role    = Column(String(255))

    # Radiology capacity
    num_radiologists= Column(String(50))
    num_machines    = Column(String(50))
    monthly_volume  = Column(String(50))
    current_system  = Column(String(100))
    primary_conditions = Column(String(255))
    heard_from      = Column(String(100))
    notes           = Column(Text)

    # Status & review
    status          = Column(SAEnum(HospitalAppStatus), default=HospitalAppStatus.pending, nullable=False)
    rejection_reason= Column(Text)
    meet_link       = Column(String(500))               # Google Meet link
    meet_scheduled_at = Column(DateTime(timezone=True))
    reviewed_by_id  = Column(Integer, ForeignKey("users.id"))
    hospital_id     = Column(Integer, ForeignKey("hospitals.id"))  # set on approval

    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())
    approved_at     = Column(DateTime(timezone=True))

    hospital     = relationship("Hospital", back_populates="application")
    reviewed_by  = relationship("User", foreign_keys=[reviewed_by_id])


class User(Base):
    """
    Radiologists and admins. Supabase UID is stored in firebase_uid.
    Status starts as 'pending' until admin approves.
    hospital_id links radiologist to their approved hospital.
    """
    __tablename__ = "users"

    id               = Column(Integer, primary_key=True, index=True)
    firebase_uid     = Column(String(128), unique=True, nullable=False, index=True)
    email            = Column(String(255), unique=True, nullable=False)
    full_name        = Column(String(255), nullable=False)
    hospital         = Column(String(255))              # free-text hospital name (legacy)
    hospital_id      = Column(Integer, ForeignKey("hospitals.id"), nullable=True)  # linked hospital
    national_id      = Column(String(16))
    license_number   = Column(String(100))
    years_experience = Column(Integer)
    phone_number     = Column(String(30))
    specialization   = Column(String(255))
    role             = Column(SAEnum(UserRole), default=UserRole.radiologist, nullable=False)
    status           = Column(SAEnum(UserStatus), default=UserStatus.pending, nullable=False)
    is_admin         = Column(Boolean, default=False)
    rejection_reason = Column(Text)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    approved_at      = Column(DateTime(timezone=True))
    approved_by_id   = Column(Integer, ForeignKey("users.id"))
    updated_at       = Column(DateTime(timezone=True), onupdate=func.now())
    last_login       = Column(DateTime(timezone=True))

    hospital_org = relationship("Hospital", back_populates="users", foreign_keys=[hospital_id])
    patients     = relationship("Patient",   back_populates="radiologist")
    diagnoses    = relationship("Diagnosis", back_populates="radiologist")
    audit_logs   = relationship("AuditLog",  back_populates="user")


class Patient(Base):
    __tablename__ = "patients"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(255), nullable=False)
    patient_ref_id  = Column(String(100))
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
    __tablename__ = "diagnoses"

    id                    = Column(Integer, primary_key=True, index=True)
    patient_id            = Column(Integer, ForeignKey("patients.id"), nullable=False)
    radiologist_id        = Column(Integer, ForeignKey("users.id"), nullable=False)
    xray_filename         = Column(String(500))
    xray_storage_path     = Column(String(1000))
    xray_b64             = Column(Text)
    heatmap_b64           = Column(Text)
    ai_classification     = Column(SAEnum(DiagnosisClass), nullable=False)
    tb_probability        = Column(Float)
    pneumonia_probability = Column(Float)
    normal_probability    = Column(Float)
    unknown_probability   = Column(Float)
    confidence_score      = Column(Float)
    ai_explanation        = Column(Text)
    radiologist_verified  = Column(Boolean, default=False)
    radiologist_override  = Column(String(50))
    radiologist_notes     = Column(Text)
    verified_at           = Column(DateTime(timezone=True))
    created_at            = Column(DateTime(timezone=True), server_default=func.now())
    updated_at            = Column(DateTime(timezone=True), onupdate=func.now())

    patient     = relationship("Patient", back_populates="diagnoses")
    radiologist = relationship("User",    back_populates="diagnoses")


class XrayUpload(Base):
    __tablename__ = "xray_uploads"

    id              = Column(Integer, primary_key=True, index=True)
    uploaded_by_id  = Column(Integer, ForeignKey("users.id"))
    filename        = Column(String(500), nullable=False)
    storage_path    = Column(String(1000))
    label           = Column(String(50))
    preprocessed    = Column(Boolean, default=False)
    used_in_retrain = Column(Boolean, default=False)
    upload_batch_id = Column(String(100))
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


class RetrainJob(Base):
    __tablename__ = "retrain_jobs"

    id              = Column(Integer, primary_key=True, index=True)
    triggered_by_id = Column(Integer, ForeignKey("users.id"))
    status          = Column(SAEnum(RetrainStatus), default=RetrainStatus.pending)
    image_counts    = Column(JSON)
    start_time      = Column(DateTime(timezone=True))
    end_time        = Column(DateTime(timezone=True))
    final_val_auc   = Column(Float)
    final_val_acc   = Column(Float)
    error_message   = Column(Text)
    history_json    = Column(JSON)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id        = Column(Integer, primary_key=True, index=True)
    user_id   = Column(Integer, ForeignKey("users.id"))
    action    = Column(String(100), nullable=False)
    entity    = Column(String(100))
    entity_id = Column(Integer)
    detail    = Column(JSON)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="audit_logs")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id           = Column(Integer, primary_key=True, index=True)
    hospital_id   = Column(Integer, ForeignKey("hospitals.id"), nullable=False)
    sender_id     = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    recipient_id  = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    message       = Column(Text, nullable=False)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())


# ─────────────────────────────────────────────────────────────
# DB DEPENDENCY and INIT
# ─────────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    print(" Database tables initialized")
    _run_migrations()


def _run_migrations():
    """Apply any ALTER TABLE migrations for columns added after initial deploy."""
    migrations = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(16);",
        "ALTER TABLE diagnoses ADD COLUMN IF NOT EXISTS xray_b64 TEXT;",
        "ALTER TABLE hospital_applications ADD COLUMN IF NOT EXISTS license_document_name VARCHAR(255);",
        "ALTER TABLE hospital_applications ADD COLUMN IF NOT EXISTS license_document_base64 TEXT;",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS license_document_name VARCHAR(255);",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS license_document_base64 TEXT;",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                print(f"[migration] {sql[:60]}… → {e}")
