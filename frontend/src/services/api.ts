// src/services/api.ts
// Connects your React frontend to the FastAPI backend
// Auto-attaches Firebase ID token to every request

import { auth } from '@/components/firebaseConfig';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Core fetch wrapper 

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PredictionResult {
  classification: string;       // "TB" | "Pneumonia" | "Normal" | "Unknown"
  confidence_score: number;     // 0-100
  tb_probability: number;       // 0-1
  pneumonia_probability: number;
  normal_probability: number;
  unknown_probability: number;
  explanation: string;
  gradcam_b64: string | null;   // "data:image/png;base64,..."
}

export interface PatientRecord {
  id: number;
  name: string;
  patient_ref_id: string | null;
  age: number | null;
  sex: string | null;
  hospital: string | null;
  clinical_notes: string | null;
  radiologist_id: number;
  created_at: string;
}

export interface DiagnosisRecord {
  id: number;
  patient_id: number;
  radiologist_id: number;
  xray_filename: string | null;
  ai_classification: string;
  tb_probability: number;
  pneumonia_probability: number;
  normal_probability: number;
  confidence_score: number;
  ai_explanation: string | null;
  radiologist_verified: boolean;
  radiologist_override: string | null;
  radiologist_notes: string | null;
  verified_at: string | null;
  created_at: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const registerUser = (profileData: {
  firebase_uid: string;
  email: string;
  full_name: string;
  hospital?: string;
  license_number?: string;
  years_experience?: number | null;
  phone_number?: string;
  specialization?: string;
}) => apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(profileData) });

// ─── Prediction ───────────────────────────────────────────────────────────────

export const predictXray = async (file: File): Promise<PredictionResult> => {
  const fd = new FormData();
  fd.append('file', file);
  return apiFetch('/predict', { method: 'POST', body: fd });
};

// ─── Patients ─────────────────────────────────────────────────────────────────

export const createPatient = (data: {
  name: string;
  patient_ref_id?: string;
  age?: number | null;
  sex?: string;
  hospital?: string;
  clinical_notes?: string;
}): Promise<PatientRecord> =>
  apiFetch('/patients', { method: 'POST', body: JSON.stringify(data) });

export const listPatients = (): Promise<PatientRecord[]> =>
  apiFetch('/patients');

// ─── Diagnoses ────────────────────────────────────────────────────────────────

export const saveDiagnosis = (data: {
  patient_id: number;
  xray_filename?: string;
  heatmap_b64?: string;
  ai_classification: string;
  tb_probability: number;
  pneumonia_probability: number;
  normal_probability: number;
  unknown_probability: number;
  confidence_score: number;
  ai_explanation?: string;
}): Promise<DiagnosisRecord> =>
  apiFetch('/diagnoses', { method: 'POST', body: JSON.stringify(data) });

export const listDiagnoses = (): Promise<DiagnosisRecord[]> =>
  apiFetch('/diagnoses');

export const verifyDiagnosis = (id: number, override: string | null, notes: string) =>
  apiFetch(`/diagnoses/${id}/verify`, {
    method: 'PATCH',
    body: JSON.stringify({ override, radiologist_notes: notes }),
  });

// ─── Retrain ──────────────────────────────────────────────────────────────────

export const uploadForRetrain = async (label: string, files: File[]) => {
  const fd = new FormData();
  files.forEach(f => fd.append('files', f));
  return apiFetch(`/retrain/upload?label=${encodeURIComponent(label)}`, {
    method: 'POST', body: fd,
  });
};

export const triggerRetrain = () =>
  apiFetch('/retrain/trigger', { method: 'POST' });

export const getRetrainJob = (id: number) =>
  apiFetch(`/retrain/jobs/${id}`);

// ─── Health ────────────────────────────────────────────────────────────────────

export const healthCheck = () => apiFetch('/health');
export const getModelInfo = () => apiFetch('/model/info');