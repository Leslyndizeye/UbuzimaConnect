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
interface Diagnosis { id: number; patient_id: number; radiologist_id?: number; ai_classification: string; confidence_score: number; tb_probability: number; pneumonia_probability: number; normal_probability: number; unknown_probability?: number; radiologist_verified: boolean; created_at: string; }
interface Patient { id: number; name: string; patient_ref_id?: string; age?: number; sex?: string; hospital?: string; clinical_notes?: string; radiologist_id?: number; created_at: string; }
interface Stats { total_radiologists: number; pending_requests: number; total_patients: number; total_diagnoses: number; model_status: string; uptime_seconds: number; }
interface ModelInfo { status: string; path: string; size_mb: number; last_modified: string; classes: string[]; architecture: string; input_shape: number[]; }
interface AuditLog { id: number; user_id: number; action: string; entity?: string; entity_id?: number; timestamp: string; }
interface RetrainJob { id: number; status: string; created_at: string; error_message?: string; final_val_acc?: number; }
interface PredictionResult { classification: string; confidence_score: number; tb_probability: number; pneumonia_probability: number; normal_probability: number; unknown_probability?: number; explanation?: string; gradcam_b64?: string; }
interface EditPatient { id: number; name: string; patient_ref_id: string; hospital: string; clinical_notes: string; }

type Tab = "overview" | "users" | "passwords" | "predictions" | "patients" | "diagnose" | "retrain" | "model" | "audit";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-RW", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const uptimeFmt = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}h ${m}m`; };
const validateRwandaId = (id: string) => /^\d{16}$/.test(id.replace(/\s/g, ""));

function parseDuplicateError(msg: string): { type: "NATIONAL_ID" | "NAME" | null; existingId: number | null; message: string } {
  if (msg.startsWith("DUPLICATE_NATIONAL_ID|")) { const p = msg.split("|"); return { type: "NATIONAL_ID", existingId: parseInt(p[1]) || null, message: p[2] || msg }; }
  if (msg.startsWith("DUPLICATE_NAME|")) { const p = msg.split("|"); return { type: "NAME", existingId: parseInt(p[1]) || null, message: p[2] || msg }; }
  return { type: null, existingId: null, message: msg };
}

// ── Design tokens ────────────────────────────────────────────
// Fireart Managemate–style: dark green sidebar, warm cream canvas, vivid fill cards
const S = {
  canvas:  "#F2F0EB",   // warm off-white canvas
  sidebar: "#1A2E22",   // deep forest green sidebar
  sidebarHover: "#243D2C",
  sidebarActive: "#2D5038",
  card:    "#FFFFFF",
  border:  "#E8E5DE",
  text:    "#1C1C1C",
  sub:     "#8A8780",
  // vivid fill card palette
  green:   "#2D9B4F",   // emerald-ish green
  coral:   "#F4623A",   // warm coral/orange
  amber:   "#F5A623",   // golden amber
  purple:  "#7B5EA7",   // soft purple
  blue:    "#3B7DD8",   // clear blue
};

const INP = `w-full px-4 py-2.5 rounded-2xl bg-white border text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all`;

// ── Nav icons ─────────────────────────────────────────────────
const ICONS: Record<Tab, React.ReactNode> = {
  overview:    <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  users:       <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>,
  predictions: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
  patients:    <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  diagnose:    <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  retrain:     <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></>,
  model:       <><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></>,
  passwords:   <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>,
  audit:       <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
};

// ── Big fill stat card (Managemate style) ─────────────────────
function BigStatCard({ label, value, bg, sub, icon }: { label: string; value: string | number; bg: string; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl p-6 flex flex-col gap-4" style={{ backgroundColor: bg }}>
      <div className="flex items-start justify-between">
        <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">{icon}</svg>
        </div>
        <span className="text-white/60 text-xs font-semibold uppercase tracking-widest">{label}</span>
      </div>
      <div>
        <div className="text-4xl font-black text-white leading-none">{value}</div>
        {sub && <div className="text-white/60 text-xs mt-1.5 font-medium">{sub}</div>}
      </div>
    </div>
  );
}

// ── Pill badge ────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: "green" | "red" | "amber" | "gray" | "blue" | "purple" }) {
  const map = {
    green:  "bg-emerald-50 text-emerald-700 border-emerald-200",
    red:    "bg-red-50 text-red-700 border-red-200",
    amber:  "bg-amber-50 text-amber-700 border-amber-200",
    gray:   "bg-gray-100 text-gray-500 border-gray-200",
    blue:   "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  };
  return <span className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${map[color]}`}>{label}</span>;
}

function classBadge(c: string) {
  if (c === "Normal") return <Badge label={c} color="green" />;
  if (c === "Tuberculosis") return <Badge label={c} color="red" />;
  if (c === "Pneumonia") return <Badge label={c} color="amber" />;
  return <Badge label={c} color="gray" />;
}

// ── White panel card ──────────────────────────────────────────
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-3xl border shadow-sm ${className}`} style={{ borderColor: S.border }}>{children}</div>;
}

// ── Section heading ───────────────────────────────────────────
function Heading({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight" style={{ color: S.text }}>{title}</h1>
        {sub && <p className="text-sm mt-0.5" style={{ color: S.sub }}>{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────
function Table({ heads, children, empty }: { heads: string[]; children: React.ReactNode; empty?: string }) {
  return (
    <Panel>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr style={{ borderBottom: `1px solid ${S.border}`, backgroundColor: "#FAFAF8" }}>{heads.map(h => <th key={h} className="text-left px-5 py-3.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: S.sub }}>{h}</th>)}</tr></thead>
          <tbody>{children}</tbody>
        </table>
        {empty && <div className="px-5 py-10 text-center text-sm" style={{ color: S.sub }}>{empty}</div>}
      </div>
    </Panel>
  );
}
function TR({ children }: { children: React.ReactNode }) {
  return <tr className="hover:bg-stone-50 transition-colors" style={{ borderBottom: `1px solid ${S.border}` }}>{children}</tr>;
}
function TD({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <td className={`px-5 py-3.5 text-sm ${mono ? "font-mono text-xs" : ""}`} style={{ color: mono ? S.sub : S.text }}>{children}</td>;
}

// ── Password modal ────────────────────────────────────────────
function PasswordModal({ user, onClose }: { user: ApiUser; onClose: () => void }) {
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatedPw, setGeneratedPw] = useState("");
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(true);
  const [copied, setCopied] = useState(false);
  const hasAuth = user.firebase_uid && !user.firebase_uid.startsWith("pending_");

  const generate = async () => {
    setLoading(true); setMsg(""); setGeneratedPw("");
    try { const r = await adminFetch(`/users/${user.id}/generate-password`, { method: "POST" }); setGeneratedPw(r.password); setMsg(`Password set for ${r.email}`); setMsgOk(true); }
    catch (e: any) { setMsg(e.message); setMsgOk(false); } finally { setLoading(false); }
  };
  const setManual = async () => {
    if (newPw.length < 6) { setMsg("Min 6 characters"); setMsgOk(false); return; }
    setLoading(true); setMsg("");
    try { await adminFetch(`/users/${user.id}/set-password`, { method: "POST", body: JSON.stringify({ password: newPw }) }); setMsg(`Updated for ${user.email}`); setMsgOk(true); setNewPw(""); }
    catch (e: any) { setMsg(e.message); setMsgOk(false); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-7 space-y-5" style={{ border: `1px solid ${S.border}` }}>
        <div className="flex items-center justify-between">
          <div><h2 className="text-lg font-black" style={{ color: S.text }}>Manage Password</h2><p className="text-xs mt-0.5" style={{ color: S.sub }}>{user.full_name} · {user.email}</p></div>
          <button onClick={onClose} className="w-9 h-9 rounded-2xl flex items-center justify-center text-sm transition-colors hover:bg-stone-100" style={{ color: S.sub }}>✕</button>
        </div>
        {!hasAuth && <div className="p-3 rounded-2xl text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">⚠ Approve user first to enable password management.</div>}
        <div className="p-4 rounded-2xl space-y-3" style={{ backgroundColor: S.canvas }}>
          <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: S.sub }}>Auto-Generate</div>
          <button onClick={generate} disabled={loading || !hasAuth} className="w-full py-2.5 rounded-2xl text-white text-xs font-bold uppercase tracking-widest disabled:opacity-40 transition-all" style={{ backgroundColor: S.green }}>{loading ? "Generating…" : "⚡ Generate & Set Password"}</button>
          {generatedPw && <div className="p-3 rounded-2xl bg-white border" style={{ borderColor: S.border }}><div className="text-[8px] font-bold uppercase mb-1.5" style={{ color: S.sub }}>Share with user</div><div className="flex items-center gap-2"><code className="flex-1 text-sm font-mono font-bold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl">{generatedPw}</code><button onClick={() => { navigator.clipboard.writeText(generatedPw); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="px-3 py-2 text-white text-xs font-bold rounded-xl" style={{ backgroundColor: S.green }}>{copied ? "✓" : "Copy"}</button></div></div>}
        </div>
        <div className="p-4 rounded-2xl space-y-3" style={{ backgroundColor: S.canvas }}>
          <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: S.sub }}>Set Custom</div>
          <div className="relative"><input type={showPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 6 characters" className={INP + " border-gray-200 focus:ring-emerald-500/20 pr-16"} /><button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-1 rounded-xl bg-gray-100" style={{ color: S.sub }}>{showPw ? "Hide" : "Show"}</button></div>
          <button onClick={setManual} disabled={loading || !hasAuth || !newPw} className="w-full py-2.5 rounded-2xl text-white text-xs font-bold uppercase tracking-widest disabled:opacity-40 transition-all" style={{ backgroundColor: S.blue }}>Set Password</button>
        </div>
        {msg && <div className={`p-3 rounded-2xl text-xs font-semibold ${msgOk ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-600"}`}>{msg}</div>}
        <button onClick={onClose} className="w-full py-2.5 rounded-2xl text-sm font-semibold transition-colors hover:bg-stone-100" style={{ backgroundColor: S.canvas, color: S.sub }}>Close</button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
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
  const [pwUser, setPwUser] = useState<ApiUser | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editPatient, setEditPatient] = useState<EditPatient | null>(null);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [expandedPatient, setExpandedPatient] = useState<number | null>(null);
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
  const [retrainFiles, setRetrainFiles] = useState<File[]>([]);
  const [retrainLabel, setRetrainLabel] = useState("Normal");
  const [uploading, setUploading] = useState(false);
  const [retrainMsg, setRetrainMsg] = useState("");
  const [retrainMsgOk, setRetrainMsgOk] = useState(true);
  const [uploadedCounts, setUploadedCounts] = useState<Record<string, number>>({});
  const [stagedCounts, setStagedCounts] = useState<Record<string, number>>({});
  const [retrainDragging, setRetrainDragging] = useState(false);
  const retrainFileRef = useRef<HTMLInputElement>(null);

  const loadAll = useCallback(async () => {
    setError("");
    try {
      const [u, d, p, s, m, h, a, j] = await Promise.allSettled([adminFetch("/users"), adminFetch("/diagnoses"), adminFetch("/patients"), adminFetch("/stats"), adminFetch("/model/info"), adminFetch("/health"), adminFetch("/audit?limit=100"), adminFetch("/retrain/jobs")]);
      if (u.status === "fulfilled") setApiUsers(u.value);
      if (d.status === "fulfilled") setDiagnoses(d.value);
      if (p.status === "fulfilled") setPatients(p.value);
      if (s.status === "fulfilled") setStats(s.value);
      if (m.status === "fulfilled") setModelInfo(m.value);
      if (h.status === "fulfilled") setHealth(h.value);
      if (a.status === "fulfilled") { setAuditLogs(a.value); setPwLogs(a.value.filter((l: AuditLog) => l.action.includes("password") || l.action.includes("Password"))); }
      if (j.status === "fulfilled") setRetrainJobs(j.value);
      adminFetch("/retrain/staged").then(s => setStagedCounts(s.counts)).catch(() => {});
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    const hasActive = retrainJobs.some(j => j.status === "processing" || j.status === "pending");
    if (!hasActive) return;
    const id = setInterval(async () => { const jobs = await adminFetch("/retrain/jobs").catch(() => null); if (jobs) setRetrainJobs(jobs); }, 5000);
    return () => clearInterval(id);
  }, [retrainJobs]);

  const approveUser = async (id: number) => { await adminFetch(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) }); loadAll(); };
  const rejectUser = async (id: number) => { const r = prompt("Rejection reason (optional):") ?? ""; await adminFetch(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "rejected", rejection_reason: r }) }); loadAll(); };
  const deleteUser = async (id: number, name: string) => { if (!confirm(`Delete ${name}?`)) return; try { await adminFetch(`/users/${id}`, { method: "DELETE" }); loadAll(); } catch (e: any) { setError(e.message); } };
  const openEditPatient = (p: Patient) => { setEditPatient({ id: p.id, name: p.name, patient_ref_id: p.patient_ref_id || "", hospital: p.hospital || "", clinical_notes: p.clinical_notes || "" }); setEditError(""); };
  const saveEditPatient = async () => {
    if (!editPatient) return;
    if (!editPatient.name.trim()) { setEditError("Name required"); return; }
    if (editPatient.patient_ref_id && !validateRwandaId(editPatient.patient_ref_id)) { setEditError("National ID must be 16 digits"); return; }
    setEditSaving(true); setEditError("");
    try { await adminFetch(`/patients/${editPatient.id}`, { method: "PATCH", body: JSON.stringify({ name: editPatient.name, patient_ref_id: editPatient.patient_ref_id || null, hospital: editPatient.hospital || null, clinical_notes: editPatient.clinical_notes || null }) }); setEditPatient(null); loadAll(); }
    catch (e: any) { setEditError(e.message); } finally { setEditSaving(false); }
  };
  const deletePatient = async (id: number, name: string) => { if (!confirm(`Delete "${name}" and all their diagnoses?`)) return; try { await adminFetch(`/patients/${id}`, { method: "DELETE" }); loadAll(); } catch (e: any) { setError(e.message); } };
  const deletePatientDiagnosis = async (id: number) => { if (!confirm("Delete this diagnosis?")) return; try { await adminFetch(`/diagnoses/${id}`, { method: "DELETE" }); loadAll(); } catch (e: any) { setError(e.message); } };
  const handleNationalIdChange = (val: string) => { const d = val.replace(/\D/g, "").slice(0, 16); setPatientNationalId(d); setNationalIdError(d.length > 0 && d.length < 16 ? "Must be 16 digits" : ""); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f) return; setXrayFile(f); setXrayPreview(URL.createObjectURL(f)); setPrediction(null); setSavedDiagnosis(null); setPredError(""); setPredInfo(""); };

  const runPrediction = async () => {
    if (!xrayFile || !patientName.trim()) { setPredError("Enter patient name and upload an X-ray"); return; }
    if (!validateRwandaId(patientNationalId)) { setPredError("Enter a valid 16-digit Rwanda National ID"); return; }
    setPredicting(true); setPredError(""); setPredInfo(""); setPrediction(null); setSavedDiagnosis(null); setSavedPatient(null);
    try {
      let patient: Patient | null = null;
      try { patient = await adminFetch("/patients", { method: "POST", body: JSON.stringify({ name: patientName.trim(), patient_ref_id: patientNationalId }) }); setPatients(prev => [patient!, ...prev.filter(p => p.id !== patient!.id)]); }
      catch (e: any) { const { type, existingId } = parseDuplicateError(e.message); if ((type === "NATIONAL_ID" || type === "NAME") && existingId) { const ex = patients.find(p => p.id === existingId) ?? await adminFetch(`/patients/${existingId}`).catch(() => null); if (ex) { patient = ex; setPredInfo(`Using existing patient: ${ex.name}`); } else throw e; } else throw e; }
      if (!patient) throw new Error("Could not resolve patient");
      setSavedPatient(patient);
      const fd = new FormData(); fd.append("file", xrayFile);
      const { data: sd } = await supabase.auth.getSession(); const token = sd.session?.access_token;
      const res = await fetch(`${API_BASE}/predict`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Prediction failed"); }
      const result: PredictionResult = await res.json(); setPrediction(result);
      const saved: Diagnosis = await adminFetch("/diagnoses", { method: "POST", body: JSON.stringify({ patient_id: patient.id, xray_filename: xrayFile.name, ai_classification: result.classification, confidence_score: result.confidence_score, tb_probability: result.tb_probability, pneumonia_probability: result.pneumonia_probability, normal_probability: result.normal_probability, unknown_probability: result.unknown_probability ?? 0, ai_explanation: result.explanation, heatmap_b64: result.gradcam_b64 }) });
      setSavedDiagnosis(saved); setDiagnoses(prev => [saved, ...prev]); loadAll().catch(() => {});
    } catch (e: any) { setPredError(e.message); } finally { setPredicting(false); }
  };

  const uploadForRetrain = async () => {
    if (!retrainFiles.length) { setRetrainMsg("Select files first"); setRetrainMsgOk(false); return; }
    setUploading(true); setRetrainMsg("");
    try {
      const fd = new FormData(); retrainFiles.forEach(f => fd.append("files", f));
      const { data } = await supabase.auth.getSession(); const token = data.session?.access_token;
      const res = await fetch(`${API_BASE}/retrain/upload?label=${encodeURIComponent(retrainLabel)}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
      const r = await res.json(); setUploadedCounts(prev => ({ ...prev, [retrainLabel]: (prev[retrainLabel] || 0) + r.files_saved })); setRetrainMsg(`Uploaded ${r.files_saved} file(s) as "${retrainLabel}"`); setRetrainMsgOk(true); setRetrainFiles([]);
      adminFetch("/retrain/staged").then(s => setStagedCounts(s.counts)).catch(() => {});
    } catch (e: any) { setRetrainMsg(e.message); setRetrainMsgOk(false); } finally { setUploading(false); }
  };

  const triggerRetrain = async () => {
    if (!window.confirm("Start retraining?")) return;
    try { const job = await adminFetch("/retrain/trigger", { method: "POST" }); setRetrainMsg(`Job #${job.id} started`); setRetrainMsgOk(true); setUploadedCounts({}); setStagedCounts({}); loadAll(); }
    catch (e: any) { setRetrainMsg(e.message); setRetrainMsgOk(false); }
  };

  const navItems: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users", badge: apiUsers.filter(u => u.status === "pending").length || undefined },
    { id: "predictions", label: "Predictions", badge: diagnoses.length || undefined },
    { id: "patients", label: "Patients", badge: patients.length || undefined },
    { id: "diagnose", label: "Diagnose" },
    { id: "retrain", label: "Retrain AI" },
    { id: "model", label: "Model" },
    { id: "passwords", label: "Passwords" },
    { id: "audit", label: "Audit Log" },
  ];

  const pending = apiUsers.filter(u => u.status === "pending").length;

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: S.canvas, fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── MODALS ── */}
      {pwUser && <PasswordModal user={pwUser} onClose={() => setPwUser(null)} />}

      {editPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-7 space-y-5" style={{ border: `1px solid ${S.border}` }}>
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-black" style={{ color: S.text }}>Edit Patient</h2></div><button onClick={() => setEditPatient(null)} className="w-9 h-9 rounded-2xl flex items-center justify-center hover:bg-stone-100 text-sm transition-colors" style={{ color: S.sub }}>✕</button></div>
            <div className="space-y-3">
              <div><label className="block text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: S.sub }}>Full Name *</label><input value={editPatient.name} onChange={e => setEditPatient({ ...editPatient, name: e.target.value })} className={INP + " border-gray-200 focus:ring-emerald-500/20"} /></div>
              <div><label className="block text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: S.sub }}>National ID</label><input value={editPatient.patient_ref_id} onChange={e => setEditPatient({ ...editPatient, patient_ref_id: e.target.value.replace(/\D/g, "").slice(0, 16) })} className={INP + " border-gray-200 focus:ring-emerald-500/20 font-mono"} maxLength={16} inputMode="numeric" /></div>
              <div><label className="block text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: S.sub }}>Hospital</label><input value={editPatient.hospital} onChange={e => setEditPatient({ ...editPatient, hospital: e.target.value })} className={INP + " border-gray-200 focus:ring-emerald-500/20"} /></div>
              <div><label className="block text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: S.sub }}>Clinical Notes</label><textarea value={editPatient.clinical_notes} onChange={e => setEditPatient({ ...editPatient, clinical_notes: e.target.value })} className={INP + " border-gray-200 focus:ring-emerald-500/20 h-20 resize-none"} /></div>
            </div>
            {editError && <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-xs">{editError}</div>}
            <div className="flex gap-2"><button onClick={() => setEditPatient(null)} className="flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-colors hover:bg-stone-100" style={{ backgroundColor: S.canvas, color: S.sub }}>Cancel</button><button onClick={saveEditPatient} disabled={editSaving} className="flex-1 py-2.5 rounded-2xl text-white text-sm font-bold disabled:opacity-40 transition-all" style={{ backgroundColor: S.green }}>{editSaving ? "Saving…" : "Save"}</button></div>
          </div>
        </div>
      )}

      {/* ── SIDEBAR ── */}
      <aside className={`${sidebarOpen ? "w-64" : "w-20"} shrink-0 flex flex-col sticky top-0 h-screen transition-all duration-300`} style={{ backgroundColor: S.sidebar }}>
        {/* Logo */}
        <div className="h-20 flex items-center px-6 gap-3">
          <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: S.green }}>
            <div className="w-4 h-[1.5px] bg-white rounded-full" />
          </div>
          {sidebarOpen && (
            <div>
              <div className="text-[13px] font-black text-white uppercase tracking-tight leading-none">Ubuzima</div>
              <div className="text-[9px] font-semibold uppercase tracking-widest mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Connect</div>
            </div>
          )}
        </div>

        {/* Live status */}
        {health && sidebarOpen && (
          <div className="mx-4 mb-4 px-4 py-2.5 rounded-2xl flex items-center gap-2" style={{ backgroundColor: "rgba(255,255,255,0.07)" }}>
            <div className={`w-2 h-2 rounded-full shrink-0 ${health.status === "healthy" ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>{health.status === "healthy" ? `Live · ${uptimeFmt(health.uptime_seconds)}` : "Offline"}</span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {sidebarOpen && <div className="text-[8px] font-bold uppercase tracking-widest px-3 pb-2 pt-1" style={{ color: "rgba(255,255,255,0.25)" }}>Navigation</div>}
          {navItems.map(item => {
            const active = tab === item.id;
            return (
              <button key={item.id} onClick={() => { setTab(item.id); setSearch(""); setExpandedPatient(null); }}
                title={!sidebarOpen ? item.label : undefined}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all text-left relative"
                style={{ backgroundColor: active ? S.sidebarActive : "transparent", color: active ? "white" : "rgba(255,255,255,0.5)" }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = S.sidebarHover; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <svg className="w-4.5 h-4.5 shrink-0" style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">{ICONS[item.id]}</svg>
                {sidebarOpen && <span className="text-[11px] font-bold uppercase tracking-wider flex-1">{item.label}</span>}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ backgroundColor: active ? "rgba(255,255,255,0.2)" : "#F4623A", color: "white" }}>{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 space-y-1 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <button onClick={loadAll} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all" style={{ color: "rgba(255,255,255,0.4)" }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = S.sidebarHover} onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
            <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15"/></svg>
            {sidebarOpen && <span className="text-[11px] font-bold uppercase tracking-wider">Refresh</span>}
          </button>
          <button onClick={() => supabase.auth.signOut()} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all" style={{ color: "rgba(255,255,255,0.4)" }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#3D1A1A"; (e.currentTarget as HTMLElement).style.color = "#F87171"; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.4)"; }}>
            <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            {sidebarOpen && <span className="text-[11px] font-bold uppercase tracking-wider">Sign Out</span>}
          </button>
          <button onClick={() => setSidebarOpen(s => !s)} className="w-full flex items-center justify-center py-2 rounded-2xl transition-all" style={{ color: "rgba(255,255,255,0.25)" }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = S.sidebarHover} onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
            <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">{sidebarOpen ? <path d="M15 18l-6-6 6-6"/> : <path d="M9 18l6-6-6-6"/>}</svg>
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar */}
        <header className="h-20 flex items-center justify-between px-8 sticky top-0 z-20 backdrop-blur-md" style={{ backgroundColor: "rgba(242,240,235,0.85)", borderBottom: `1px solid ${S.border}` }}>
          <div className="flex items-center gap-3">
            <span className="text-xl font-black capitalize" style={{ color: S.text }}>{tab.replace("-", " ")}</span>
            <span className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: S.green }}>Admin</span>
          </div>
          <div className="flex items-center gap-3">
            {error && <div className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-semibold bg-red-50 border border-red-200 text-red-600"><span>⚠ {error}</span><button onClick={() => setError("")}>✕</button></div>}
            {pending > 0 && <div className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold" style={{ backgroundColor: "#FFF4F0", color: S.coral, border: `1px solid #FECDB8` }}><span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />{pending} pending approval</div>}
            <div className="text-xs font-semibold" style={{ color: S.sub }}>{new Date().toLocaleDateString("en-RW", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</div>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto">

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <div className="space-y-6">
              <Heading title="System Overview" sub="Live status of Ubuzima Connect" />

              {/* Big fill stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <BigStatCard label="Radiologists" value={stats?.total_radiologists ?? "—"} bg={S.green} sub="Active clinicians" icon={ICONS.users} />
                <BigStatCard label="Pending" value={stats?.pending_requests ?? 0} bg={S.coral} sub="Awaiting approval" icon={ICONS.passwords} />
                <BigStatCard label="Patients" value={patients.length} bg={S.blue} sub="Registered" icon={ICONS.patients} />
                <BigStatCard label="Diagnoses" value={diagnoses.length} bg={S.purple} sub="AI scans done" icon={ICONS.predictions} />
              </div>

              {/* Diagnosis distribution — big colored panels */}
              <Panel className="p-6">
                <div className="text-[9px] font-bold uppercase tracking-widest mb-5" style={{ color: S.sub }}>Diagnosis Distribution</div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { cls: "Normal",       bg: "#EDFAF3", accent: "#2D9B4F", bar: "#2D9B4F" },
                    { cls: "Tuberculosis", bg: "#FEF2F2", accent: "#DC2626", bar: "#EF4444" },
                    { cls: "Pneumonia",    bg: "#FFFBEB", accent: "#D97706", bar: "#F59E0B" },
                    { cls: "Unknown",      bg: "#F5F5F5", accent: "#6B7280", bar: "#9CA3AF" },
                  ].map(({ cls, bg, accent, bar }) => {
                    const count = diagnoses.filter(d => d.ai_classification === cls).length;
                    const pct = diagnoses.length ? Math.round((count / diagnoses.length) * 100) : 0;
                    return (
                      <div key={cls} className="rounded-2xl p-5" style={{ backgroundColor: bg }}>
                        <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: accent }}>{cls}</div>
                        <div className="text-4xl font-black mb-3" style={{ color: accent }}>{count}</div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${accent}25` }}>
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: bar }} />
                        </div>
                        <div className="text-[10px] font-semibold mt-1.5" style={{ color: `${accent}99` }}>{pct}% of total</div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <div className="grid lg:grid-cols-2 gap-5">
                {/* Model info */}
                <Panel className="p-6">
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-4" style={{ color: S.sub }}>AI Model</div>
                  {modelInfo ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: modelInfo.status === "loaded" ? S.green : "#9CA3AF", boxShadow: modelInfo.status === "loaded" ? `0 0 8px ${S.green}80` : "none" }} />
                        <span className="font-black capitalize" style={{ color: S.text }}>{modelInfo.status}</span>
                        <span className="text-xs font-mono" style={{ color: S.sub }}>{modelInfo.architecture}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[{ label: "Size", value: `${modelInfo.size_mb} MB` }, { label: "Classes", value: `${modelInfo.classes?.length}` }].map(r => (
                          <div key={r.label} className="rounded-2xl p-4" style={{ backgroundColor: S.canvas }}>
                            <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: S.sub }}>{r.label}</div>
                            <div className="text-2xl font-black" style={{ color: S.text }}>{r.value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">{modelInfo.classes?.map(c => classBadge(c))}</div>
                    </div>
                  ) : <div className="text-sm" style={{ color: S.sub }}>Loading…</div>}
                </Panel>

                {/* Recent predictions */}
                <Panel className="p-6">
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-4" style={{ color: S.sub }}>Recent Predictions</div>
                  <div className="space-y-2">
                    {diagnoses.slice(0, 7).map(d => {
                      const pt = patients.find(p => p.id === d.patient_id);
                      const accent = d.ai_classification === "Normal" ? S.green : d.ai_classification === "Tuberculosis" ? "#DC2626" : d.ai_classification === "Pneumonia" ? "#D97706" : "#6B7280";
                      return (
                        <div key={d.id} className="flex items-center justify-between p-3 rounded-2xl transition-colors hover:bg-stone-50" style={{ backgroundColor: S.canvas }}>
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                            <span className="text-xs font-bold" style={{ color: S.text }}>{pt?.name ?? "Unknown"}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {classBadge(d.ai_classification)}
                            <span className="text-xs font-black" style={{ color: accent }}>{d.confidence_score.toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })}
                    {diagnoses.length === 0 && <div className="text-sm text-center py-4" style={{ color: S.sub }}>No predictions yet</div>}
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {/* ── USERS ── */}
          {tab === "users" && (
            <div className="space-y-5">
              <Heading title="User Management" sub={`${apiUsers.length} users registered`}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…" className="px-4 py-2.5 rounded-2xl bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-52" style={{ border: `1px solid ${S.border}` }} />
              </Heading>
              <Table heads={["Name","Email","Hospital","License","Role","Status","Joined","Actions"]} empty={apiUsers.length === 0 ? "No users yet" : undefined}>
                {apiUsers.filter(u => !search || u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())).map(u => (
                  <TR key={u.id}>
                    <td className="px-5 py-3.5"><span className="text-sm font-bold" style={{ color: S.text }}>{u.full_name}</span></td>
                    <TD mono>{u.email}</TD><TD mono>{u.hospital || "—"}</TD><TD mono>{u.license_number || "—"}</TD>
                    <td className="px-5 py-3.5"><Badge label={u.role} color="blue" /></td>
                    <td className="px-5 py-3.5">{u.status === "approved" ? <Badge label="approved" color="green" /> : u.status === "pending" ? <Badge label="pending" color="amber" /> : <Badge label="rejected" color="red" />}</td>
                    <TD mono>{fmt(u.created_at)}</TD>
                    <td className="px-5 py-3.5"><div className="flex gap-1.5 flex-wrap">
                      {u.status === "pending" && <><button onClick={() => approveUser(u.id)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl text-white transition-all" style={{ backgroundColor: S.green }}>Approve</button><button onClick={() => rejectUser(u.id)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200 transition-all">Reject</button></>}
                      {u.status === "approved" && <button onClick={() => setPwUser(u)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 transition-all">🔑 Password</button>}
                      <button onClick={() => deleteUser(u.id, u.full_name)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all">Delete</button>
                    </div></td>
                  </TR>
                ))}
              </Table>
            </div>
          )}

          {/* ── PREDICTIONS ── */}
          {tab === "predictions" && (
            <div className="space-y-5">
              <Heading title="All Predictions" sub={`${diagnoses.length} diagnoses`}>
                <div className="flex gap-1.5">{["All","Normal","Tuberculosis","Pneumonia","Unknown"].map(f => <button key={f} onClick={() => setSearch(f === "All" ? "" : f)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl border transition-all" style={(f === "All" && !search) || search === f ? { backgroundColor: S.green, color: "white", borderColor: S.green } : { backgroundColor: "white", color: S.sub, borderColor: S.border }}>{f}</button>)}</div>
              </Heading>
              <div className="grid grid-cols-4 gap-4 mb-2">
                {[{ cls: "Normal", bg: "#EDFAF3", accent: "#2D9B4F", bar: "#2D9B4F" }, { cls: "Tuberculosis", bg: "#FEF2F2", accent: "#DC2626", bar: "#EF4444" }, { cls: "Pneumonia", bg: "#FFFBEB", accent: "#D97706", bar: "#F59E0B" }, { cls: "Unknown", bg: "#F5F5F5", accent: "#6B7280", bar: "#9CA3AF" }].map(({ cls, bg, accent, bar }) => {
                  const count = diagnoses.filter(d => d.ai_classification === cls).length;
                  const pct = diagnoses.length ? Math.round((count / diagnoses.length) * 100) : 0;
                  return <div key={cls} className="rounded-2xl p-5" style={{ backgroundColor: bg }}><div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: accent }}>{cls}</div><div className="text-3xl font-black" style={{ color: accent }}>{count}</div><div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ backgroundColor: `${accent}20` }}><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: bar }} /></div><div className="text-[9px] font-semibold mt-1" style={{ color: `${accent}99` }}>{pct}%</div></div>;
                })}
              </div>
              <Table heads={["Patient","National ID","Result","Confidence","TB%","Pneumonia%","Normal%","Radiologist","Verified","Date","Action"]} empty={diagnoses.length === 0 ? "No predictions yet" : undefined}>
                {diagnoses.filter(d => !search || d.ai_classification === search).map(d => {
                  const pt = patients.find(p => p.id === d.patient_id);
                  return (
                    <TR key={d.id}>
                      <td className="px-5 py-3.5"><span className="text-sm font-bold" style={{ color: S.text }}>{pt?.name ?? "Unknown"}</span></td>
                      <TD mono>{pt?.patient_ref_id ?? "—"}</TD>
                      <td className="px-5 py-3.5">{classBadge(d.ai_classification)}</td>
                      <td className="px-5 py-3.5"><div className="flex items-center gap-2"><div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: S.canvas }}><div className="h-full rounded-full" style={{ width: `${d.confidence_score}%`, backgroundColor: S.green }} /></div><span className="text-xs font-bold" style={{ color: S.text }}>{d.confidence_score.toFixed(1)}%</span></div></td>
                      <TD mono>{(d.tb_probability * 100).toFixed(1)}%</TD>
                      <TD mono>{(d.pneumonia_probability * 100).toFixed(1)}%</TD>
                      <TD mono>{(d.normal_probability * 100).toFixed(1)}%</TD>
                      <TD>{apiUsers.find(u => u.id === d.radiologist_id)?.full_name ?? "—"}</TD>
                      <td className="px-5 py-3.5">{d.radiologist_verified ? <Badge label="Verified" color="green" /> : <Badge label="Pending" color="gray" />}</td>
                      <TD mono>{fmt(d.created_at)}</TD>
                      <td className="px-5 py-3.5"><button onClick={() => deletePatientDiagnosis(d.id)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all">Delete</button></td>
                    </TR>
                  );
                })}
              </Table>
            </div>
          )}

          {/* ── PATIENTS ── */}
          {tab === "patients" && (
            <div className="space-y-4">
              <Heading title="Patients" sub={`${patients.length} registered`}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or ID…" className="px-4 py-2.5 rounded-2xl bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-56" style={{ border: `1px solid ${S.border}` }} />
              </Heading>
              <div className="space-y-2">
                {patients.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.patient_ref_id && p.patient_ref_id.includes(search))).map(p => {
                  const ptD = diagnoses.filter(d => d.patient_id === p.id);
                  const isExp = expandedPatient === p.id;
                  return (
                    <div key={p.id} className="bg-white rounded-3xl overflow-hidden transition-all hover:shadow-md" style={{ border: `1px solid ${S.border}` }}>
                      <div className="flex items-center gap-4 px-6 py-4">
                        <button onClick={() => setExpandedPatient(isExp ? null : p.id)} className="w-8 h-8 rounded-xl flex items-center justify-center text-xs transition-colors shrink-0" style={{ backgroundColor: S.canvas, color: S.sub }}>{isExp ? "▾" : "▸"}</button>
                        <div className="flex-1 grid grid-cols-7 gap-3 items-center min-w-0">
                          {[{ l: "Name", v: <span className="text-sm font-bold truncate" style={{ color: S.text }}>{p.name}</span> }, { l: "National ID", v: <span className="text-xs font-mono" style={{ color: S.sub }}>{p.patient_ref_id || "—"}</span> }, { l: "Age", v: <span className="text-xs" style={{ color: S.sub }}>{p.age ? `${p.age}y` : "—"}</span> }, { l: "Sex", v: <span className="text-xs" style={{ color: S.sub }}>{p.sex || "—"}</span> }, { l: "Hospital", v: <span className="text-xs truncate" style={{ color: S.sub }}>{p.hospital || "—"}</span> }, { l: "Scans", v: ptD.length > 0 ? <Badge label={`${ptD.length} scan${ptD.length !== 1 ? "s" : ""}`} color="blue" /> : <Badge label="0 scans" color="gray" /> }, { l: "Registered", v: <span className="text-xs" style={{ color: S.sub }}>{fmt(p.created_at)}</span> }].map(col => <div key={col.l}><div className="text-[8px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#C4C0B8" }}>{col.l}</div>{col.v}</div>)}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => openEditPatient(p)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all">Edit</button>
                          <button onClick={() => deletePatient(p.id, p.name)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all">Delete</button>
                        </div>
                      </div>
                      {isExp && (
                        <div className="px-6 py-4" style={{ borderTop: `1px solid ${S.border}`, backgroundColor: S.canvas }}>
                          <div className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: S.sub }}>Diagnoses for {p.name}</div>
                          {ptD.length === 0 ? <div className="text-sm" style={{ color: S.sub }}>No diagnoses yet.</div> : (
                            <div className="space-y-2">{ptD.map(d => (
                              <div key={d.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white" style={{ border: `1px solid ${S.border}` }}>
                                <div className="flex-1 grid grid-cols-5 gap-3 items-center">
                                  <div><div className="text-[8px] font-bold uppercase" style={{ color: "#C4C0B8" }}>Radiologist</div><div className="text-xs font-semibold mt-0.5" style={{ color: S.text }}>{apiUsers.find(u => u.id === d.radiologist_id)?.full_name ?? "—"}</div></div>
                                  <div><div className="text-[8px] font-bold uppercase" style={{ color: "#C4C0B8" }}>Result</div><div className="mt-0.5">{classBadge(d.ai_classification)}</div></div>
                                  <div><div className="text-[8px] font-bold uppercase" style={{ color: "#C4C0B8" }}>Confidence</div><div className="text-sm font-black mt-0.5" style={{ color: S.text }}>{d.confidence_score.toFixed(1)}%</div></div>
                                  <div><div className="text-[8px] font-bold uppercase" style={{ color: "#C4C0B8" }}>TB / Pneumo / Normal</div><div className="text-xs font-mono mt-0.5" style={{ color: S.sub }}>{(d.tb_probability*100).toFixed(0)}% / {(d.pneumonia_probability*100).toFixed(0)}% / {(d.normal_probability*100).toFixed(0)}%</div></div>
                                  <div><div className="text-[8px] font-bold uppercase" style={{ color: "#C4C0B8" }}>Date</div><div className="text-[10px] mt-0.5" style={{ color: S.sub }}>{fmt(d.created_at)}</div></div>
                                </div>
                                <button onClick={() => deletePatientDiagnosis(d.id)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 shrink-0 transition-all">Delete</button>
                              </div>
                            ))}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {patients.length === 0 && <Panel className="p-10 text-center"><span className="text-sm" style={{ color: S.sub }}>No patients yet</span></Panel>}
              </div>
            </div>
          )}

          {/* ── DIAGNOSE ── */}
          {tab === "diagnose" && (
            <div className="space-y-6">
              <Heading title="Diagnostic Station" sub="Upload a chest X-ray for AI analysis" />
              <div className="grid lg:grid-cols-2 gap-5">
                <Panel className="p-7 space-y-5">
                  <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: S.sub }}>Patient Information</div>
                  <div className="space-y-4">
                    <div><label className="block text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: S.sub }}>Full Name *</label><input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Jean Uwimana" className={INP + " border-gray-200 focus:ring-emerald-500/20"} /></div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: S.sub }}>Rwanda National ID * (16 digits)</label>
                      <input value={patientNationalId} onChange={e => handleNationalIdChange(e.target.value)} placeholder="1199080012345678" maxLength={16} inputMode="numeric" className={`${INP} font-mono ${nationalIdError ? "border-red-400 focus:ring-red-500/20" : patientNationalId.length === 16 ? "border-emerald-400 focus:ring-emerald-500/20" : "border-gray-200 focus:ring-emerald-500/20"}`} />
                      <div className="flex justify-between mt-1.5">{nationalIdError ? <span className="text-[10px] text-red-500 font-semibold">{nationalIdError}</span> : patientNationalId.length === 16 ? <span className="text-[10px] font-semibold" style={{ color: S.green }}>✓ Valid</span> : <span className="text-[10px]" style={{ color: S.sub }}>16 digits required</span>}<span className="text-[10px] font-mono" style={{ color: S.sub }}>{patientNationalId.length}/16</span></div>
                    </div>
                  </div>
                  <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all hover:border-emerald-400" style={{ borderColor: xrayPreview ? "#2D9B4F" : S.border, backgroundColor: xrayPreview ? "#EDFAF3" : S.canvas }}>
                    {xrayPreview ? <img src={xrayPreview} alt="X-ray" className="max-h-48 mx-auto rounded-xl object-contain" /> : <div className="space-y-2"><div className="text-3xl">🩻</div><div className="text-sm font-semibold" style={{ color: S.sub }}>Click to upload X-ray</div><div className="text-xs" style={{ color: "#C4C0B8" }}>JPG or PNG, max 15MB</div></div>}
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={handleFileChange} className="hidden" />
                  </div>
                  {predInfo && <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">{predInfo}</div>}
                  {predError && <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">{predError}</div>}
                  <button onClick={runPrediction} disabled={predicting || !xrayFile || !patientName.trim() || !validateRwandaId(patientNationalId)} className="w-full py-4 rounded-2xl text-white font-black disabled:opacity-40 transition-all text-sm" style={{ backgroundColor: S.green }}>{predicting ? "Analyzing X-ray…" : "Run AI Diagnosis"}</button>
                </Panel>
                <Panel className="p-7">
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-5" style={{ color: S.sub }}>Diagnostic Result</div>
                  {!prediction && !predicting && <div className="flex flex-col items-center justify-center h-64 space-y-3"><div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl" style={{ backgroundColor: S.canvas, color: "#D4D0C8" }}>◈</div><div className="text-sm font-bold uppercase tracking-widest" style={{ color: "#D4D0C8" }}>Awaiting Scan</div></div>}
                  {predicting && <div className="flex flex-col items-center justify-center h-64 space-y-4"><div className="w-12 h-12 rounded-full border-4 border-t-emerald-500 animate-spin" style={{ borderColor: `${S.canvas} ${S.canvas} ${S.canvas} ${S.green}` }} /><div className="text-sm" style={{ color: S.sub }}>Analyzing with ResNet-50…</div></div>}
                  {prediction && (
                    <div className="space-y-5">
                      <div className={`p-5 rounded-2xl text-center`} style={{ backgroundColor: prediction.classification === "Normal" ? "#EDFAF3" : prediction.classification === "Tuberculosis" ? "#FEF2F2" : prediction.classification === "Unknown" ? "#F5F5F5" : "#FFFBEB" }}>
                        <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: S.sub }}>AI Classification</div>
                        <div className="text-4xl font-black" style={{ color: prediction.classification === "Normal" ? S.green : prediction.classification === "Tuberculosis" ? "#DC2626" : prediction.classification === "Unknown" ? "#6B7280" : "#D97706" }}>{prediction.classification}</div>
                        <div className="text-sm font-semibold mt-1" style={{ color: S.sub }}>{prediction.confidence_score.toFixed(1)}% confidence</div>
                      </div>
                      <div className="space-y-3">
                        {[{ label: "Normal", value: prediction.normal_probability, color: S.green }, { label: "Pneumonia", value: prediction.pneumonia_probability, color: "#F59E0B" }, { label: "Tuberculosis", value: prediction.tb_probability, color: "#EF4444" }].map(r => (
                          <div key={r.label}><div className="flex justify-between mb-1"><span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: S.sub }}>{r.label}</span><span className="text-xs font-black" style={{ color: S.text }}>{(r.value * 100).toFixed(1)}%</span></div><div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: S.canvas }}><div className="h-full rounded-full transition-all duration-700" style={{ width: `${r.value * 100}%`, backgroundColor: r.color }} /></div></div>
                        ))}
                      </div>
                      {savedDiagnosis && <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">✅ Diagnosis #{savedDiagnosis.id} saved</div>}
                      <button onClick={() => { setPrediction(null); setSavedDiagnosis(null); setSavedPatient(null); setXrayFile(null); setXrayPreview(null); setPatientName(""); setPatientNationalId(""); setNationalIdError(""); setPredError(""); setPredInfo(""); }} className="w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-widest transition-colors" style={{ backgroundColor: S.canvas, color: S.sub }}>New Scan</button>
                    </div>
                  )}
                </Panel>
              </div>
            </div>
          )}

          {/* ── RETRAIN ── */}
          {tab === "retrain" && (
            <div className="space-y-6">
              <Heading title="Retrain AI Model" sub="Upload labelled X-rays — minimum 3 per class" />
              <div className="grid lg:grid-cols-2 gap-5">
                <Panel className="p-7 space-y-5">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: S.sub }}>Step 1 — Label</div>
                    <div className="grid grid-cols-2 gap-2">
                      {["Normal","Pneumonia","Tuberculosis","Unknown"].map(l => {
                        const active = retrainLabel === l;
                        const bg = l === "Normal" ? S.green : l === "Tuberculosis" ? "#DC2626" : l === "Pneumonia" ? "#D97706" : "#6B7280";
                        return <button key={l} onClick={() => { setRetrainLabel(l); setRetrainFiles([]); }} className="py-3 rounded-2xl text-xs font-bold border-2 transition-all" style={active ? { backgroundColor: bg, borderColor: bg, color: "white" } : { backgroundColor: "white", borderColor: S.border, color: S.sub }}>{l}{uploadedCounts[l] ? <span className="block text-[9px] font-normal opacity-70">{uploadedCounts[l]} uploaded</span> : null}</button>;
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: S.sub }}>Step 2 — Upload for "{retrainLabel}"</div>
                    <div onDragOver={e => { e.preventDefault(); setRetrainDragging(true); }} onDragLeave={() => setRetrainDragging(false)} onDrop={e => { e.preventDefault(); setRetrainDragging(false); setRetrainFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"))); }} onClick={() => retrainFileRef.current?.click()} className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all" style={{ borderColor: retrainDragging ? S.blue : retrainFiles.length > 0 ? S.blue : S.border, backgroundColor: retrainDragging || retrainFiles.length > 0 ? "#EFF6FF" : S.canvas }}>
                      {retrainFiles.length > 0 ? <div><div className="text-lg font-black text-blue-700">{retrainFiles.length} file{retrainFiles.length !== 1 ? "s" : ""} ready</div><div className="text-xs mt-1" style={{ color: S.sub }}>Click to change</div></div> : <div><div className="text-sm font-semibold" style={{ color: S.sub }}>Drop or click to browse</div><div className="text-xs mt-1" style={{ color: "#C4C0B8" }}>JPG, PNG images</div></div>}
                      <input ref={retrainFileRef} type="file" accept="image/*" multiple onChange={e => setRetrainFiles(Array.from(e.target.files || []))} className="hidden" />
                    </div>
                  </div>
                  <button onClick={uploadForRetrain} disabled={uploading || !retrainFiles.length} className="w-full py-3.5 rounded-2xl text-white font-bold disabled:opacity-40 transition-all text-sm" style={{ backgroundColor: S.blue }}>{uploading ? "Uploading…" : retrainFiles.length ? `Upload ${retrainFiles.length} file(s) as "${retrainLabel}"` : "Select files first"}</button>
                  {(() => {
                    const all = { ...stagedCounts }; const cls = Object.keys(all).filter(k => all[k] > 0); const notReady = cls.filter(k => all[k] < 3); const canTrigger = cls.length >= 2 && notReady.length === 0;
                    return (<>
                      <div className="p-4 rounded-2xl space-y-2" style={{ backgroundColor: S.canvas }}>
                        <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: S.sub }}>Staged</div>
                        {["Normal","Pneumonia","Tuberculosis","Unknown"].map(l => { const n = all[l] || 0; if (n === 0) return <div key={l} className="flex justify-between"><span className="text-xs" style={{ color: S.sub }}>{l}</span><span className="text-xs italic" style={{ color: "#C4C0B8" }}>Not uploaded</span></div>; const ok = n >= 3; return <div key={l} className="flex justify-between"><span className="text-xs font-semibold" style={{ color: S.text }}>{l}</span><span className={`text-xs font-bold ${ok ? "text-emerald-600" : "text-amber-600"}`}>{n} img{n !== 1 ? "s" : ""} {ok ? "✓" : `— need ${3-n} more`}</span></div>; })}
                        {cls.length === 0 && <div className="text-xs italic" style={{ color: "#C4C0B8" }}>Nothing staged yet</div>}
                      </div>
                      <div><div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: S.sub }}>Step 3 — Start</div><button onClick={triggerRetrain} disabled={!canTrigger} className="w-full py-3.5 rounded-2xl text-white font-bold disabled:opacity-40 transition-all text-sm" style={{ backgroundColor: S.purple }}>{canTrigger ? "⚡ Trigger Retraining" : notReady.length > 0 ? `Need more (${notReady.join(", ")})` : "Upload to 2+ classes first"}</button></div>
                    </>);
                  })()}
                  {retrainMsg && <div className={`p-3 rounded-2xl text-xs font-semibold ${retrainMsgOk ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-600"}`}>{retrainMsg}</div>}
                </Panel>
                <Panel className="p-7 space-y-4">
                  <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: S.sub }}>Retrain Jobs</div>
                  {retrainJobs.length === 0 ? <div className="text-sm py-8 text-center" style={{ color: S.sub }}>No retrain jobs yet</div> : (
                    <div className="space-y-3">{retrainJobs.map(j => {
                      const bg = j.status === "failed" ? "#FEF2F2" : j.status === "completed" ? "#EDFAF3" : S.canvas;
                      const border = j.status === "failed" ? "#FECACA" : j.status === "completed" ? "#A7F3D0" : S.border;
                      return <div key={j.id} className="p-4 rounded-2xl" style={{ backgroundColor: bg, border: `1px solid ${border}` }}><div className="flex items-center justify-between mb-2"><span className="text-sm font-black" style={{ color: S.text }}>Job #{j.id}</span>{j.status === "completed" ? <Badge label="completed" color="green" /> : j.status === "processing" ? <Badge label="processing" color="blue" /> : j.status === "failed" ? <Badge label="failed" color="red" /> : <Badge label="pending" color="amber" />}</div>{j.final_val_acc && <div className="text-xs" style={{ color: S.sub }}>Accuracy: <span className="font-black text-emerald-600">{(j.final_val_acc * 100).toFixed(1)}%</span></div>}{j.error_message && <div className="mt-2 p-2.5 rounded-xl bg-red-100 text-xs text-red-700">{j.error_message}</div>}<div className="text-[9px] mt-2" style={{ color: S.sub }}>{fmt(j.created_at)}</div></div>;
                    })}</div>
                  )}
                </Panel>
              </div>
            </div>
          )}

          {/* ── MODEL ── */}
          {tab === "model" && (
            <div className="space-y-6">
              <Heading title="AI Model" sub="ResNet-50 production model" />
              {modelInfo && <div className="grid lg:grid-cols-2 gap-5">
                <Panel className="p-7 space-y-4"><div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: S.sub }}>Details</div>{[{ l: "Status", v: modelInfo.status }, { l: "Architecture", v: modelInfo.architecture }, { l: "Size", v: `${modelInfo.size_mb} MB` }, { l: "Input Shape", v: modelInfo.input_shape?.join(" × ") }, { l: "Last Modified", v: fmt(modelInfo.last_modified) }].map(r => <div key={r.l} className="flex justify-between py-3" style={{ borderBottom: `1px solid ${S.border}` }}><span className="text-xs font-bold uppercase tracking-widest" style={{ color: S.sub }}>{r.l}</span><span className="text-sm font-bold" style={{ color: S.text }}>{r.v}</span></div>)}</Panel>
                <Panel className="p-7 space-y-4"><div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: S.sub }}>Classes</div><div className="flex flex-wrap gap-2">{modelInfo.classes?.map(c => classBadge(c))}</div></Panel>
              </div>}
            </div>
          )}

          {/* ── PASSWORDS ── */}
          {tab === "passwords" && (
            <div className="space-y-6">
              <Heading title="Password Management" sub="Set passwords for approved users" />
              <Table heads={["User","Email","Status","Last Action","Actions"]} empty={apiUsers.filter(u => u.status === "approved").length === 0 ? "No approved users yet" : undefined}>
                {apiUsers.filter(u => u.status === "approved").map(u => {
                  const last = pwLogs.filter(l => l.entity_id === u.id).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                  return (<TR key={u.id}><td className="px-5 py-3.5"><span className="text-sm font-bold" style={{ color: S.text }}>{u.full_name}</span></td><TD mono>{u.email}</TD><td className="px-5 py-3.5"><Badge label="Approved" color="green" /></td><TD mono>{last ? `${last.action === "admin_generate_password" ? "🔑 Generated" : "✏️ Set"} · ${fmt(last.timestamp)}` : "—"}</TD><td className="px-5 py-3.5"><button onClick={() => setPwUser(u)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-all">🔑 Manage</button></td></TR>);
                })}
              </Table>
              <Panel className="p-6">
                <div className="text-[9px] font-bold uppercase tracking-widest mb-4" style={{ color: S.sub }}>Password Activity</div>
                {pwLogs.length === 0 ? <div className="text-sm text-center py-8" style={{ color: S.sub }}>No activity yet</div> : (
                  <Table heads={["Action","Target","Done By","When"]}>
                    {pwLogs.map(l => { const target = apiUsers.find(u => u.id === l.entity_id); return (<TR key={l.id}><td className="px-5 py-3.5">{l.action === "admin_generate_password" ? <Badge label="🔑 Auto-generated" color="purple" /> : <Badge label="✏️ Manual" color="blue" />}</td><TD>{target?.full_name ?? "—"}</TD><TD>{apiUsers.find(u => u.id === l.user_id)?.full_name ?? "Admin"}</TD><TD mono>{fmt(l.timestamp)}</TD></TR>); })}
                  </Table>
                )}
              </Panel>
            </div>
          )}

          {/* ── AUDIT ── */}
          {tab === "audit" && (
            <div className="space-y-5">
              <Heading title="Audit Log" sub={`Last ${auditLogs.length} events`} />
              <Table heads={["#","User","Action","Entity","Entity ID","Timestamp"]} empty={auditLogs.length === 0 ? "No audit logs yet" : undefined}>
                {auditLogs.map(l => (
                  <TR key={l.id}>
                    <TD mono>#{l.id}</TD>
                    <TD>{apiUsers.find(u => u.id === l.user_id)?.full_name ?? `User ${l.user_id}`}</TD>
                    <td className="px-5 py-3.5">
                      {l.action.includes("password") ? <Badge label={l.action} color="purple" /> : l.action.includes("predict") ? <Badge label={l.action} color="blue" /> : l.action.includes("approve") ? <Badge label={l.action} color="green" /> : l.action.includes("delete") ? <Badge label={l.action} color="red" /> : <Badge label={l.action} color="gray" />}
                    </td>
                    <TD mono>{l.entity || "—"}</TD>
                    <TD mono>{l.entity_id ?? "—"}</TD>
                    <TD mono>{fmt(l.timestamp)}</TD>
                  </TR>
                ))}
              </Table>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}