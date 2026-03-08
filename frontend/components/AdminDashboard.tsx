"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabaseConfig";

// Lottie via CDN (loaded dynamically)
declare global { interface Window { lottie: any; } }

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

// ── Types ─────────────────────────────────────────────────────
interface ApiUser { id: number; email: string; full_name: string; hospital?: string; license_number?: string; role: string; status: string; created_at: string; firebase_uid?: string; }
interface Diagnosis { id: number; patient_id: number; radiologist_id?: number; ai_classification: string; confidence_score: number; tb_probability: number; pneumonia_probability: number; normal_probability: number; unknown_probability?: number; radiologist_verified: boolean; created_at: string; }
interface Patient { id: number; name: string; patient_ref_id?: string; age?: number; sex?: string; hospital?: string; clinical_notes?: string; radiologist_id?: number; created_at: string; }
interface Stats { total_radiologists: number; pending_requests: number; total_patients: number; total_diagnoses: number; model_status: string; uptime_seconds: number; }
interface ModelInfo { status: string; path: string; size_mb: number; last_modified: string; classes: string[]; architecture: string; input_shape: number[]; }
interface AuditLog { id: number; user_id: number; action: string; entity?: string; entity_id?: number; timestamp: string; }
interface RetrainJob { id: number; status: string; created_at: string; error_message?: string; final_val_acc?: number; }
interface PredictionResult { classification: string; confidence_score: number; tb_probability: number; pneumonia_probability: number; normal_probability: number; unknown_probability?: number; explanation?: string; gradcam_b64?: string; }
interface EditPatient { id: number; name: string; patient_ref_id: string; hospital: string; clinical_notes: string; }
type Tab = "overview"|"users"|"passwords"|"predictions"|"patients"|"diagnose"|"retrain"|"model"|"audit";

// ── Helpers ───────────────────────────────────────────────────
const fmt = (iso: string) => new Date(iso).toLocaleString("en-RW", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const uptimeFmt = (s: number) => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return `${h}h ${m}m`; };
const validateRwandaId = (id: string) => /^\d{16}$/.test(id.replace(/\s/g,""));
function parseDuplicateError(msg: string): { type: "NATIONAL_ID"|"NAME"|null; existingId: number|null; message: string } {
  if (msg.startsWith("DUPLICATE_NATIONAL_ID|")) { const p=msg.split("|"); return { type:"NATIONAL_ID", existingId:parseInt(p[1])||null, message:p[2]||msg }; }
  if (msg.startsWith("DUPLICATE_NAME|")) { const p=msg.split("|"); return { type:"NAME", existingId:parseInt(p[1])||null, message:p[2]||msg }; }
  return { type:null, existingId:null, message:msg };
}

// ── Lottie inline JSON (minimal, CDN-independent) ─────────────
// We embed tiny SVG-based CSS animations instead of full Lottie to avoid CDN deps
// These mimic lottie-style micro animations with pure CSS

// ── Design tokens ─────────────────────────────────────────────
// Sidebar: medium forest green (lighter than before)
// Main: pure white
// Cards: very light pastel fills, smooth shadows
const SIDEBAR_BG    = "#2D5A3D";   // medium forest green (reduced darkness)
const SIDEBAR_HOVER = "#3A6E4C";
const SIDEBAR_ACTIVE= "#4A8B5E";
const ACCENT        = "#3A7D52";   // primary green for buttons

// Pastel card palette (soft, light, smooth)
const CARDS = [
  { bg:"#E8F5EE", border:"#C5E8D1", accent:"#2D7A4F", icon:"🩺", lottieColor:"#2D7A4F" },
  { bg:"#FFF3E8", border:"#FFD9B5", accent:"#D4750A", icon:"⏳", lottieColor:"#D4750A" },
  { bg:"#E8F0FF", border:"#C5D5FF", accent:"#3557D4", icon:"👥", lottieColor:"#3557D4" },
  { bg:"#F3E8FF", border:"#DCC5FF", accent:"#7B3DD4", icon:"🔬", lottieColor:"#7B3DD4" },
];

const INP = "w-full px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all";

// ── CSS animations injected once ─────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
  
  * { box-sizing: border-box; }
  
  @keyframes fadeSlideUp {
    from { opacity:0; transform:translateY(16px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes scaleIn {
    from { opacity:0; transform:scale(0.92); }
    to   { opacity:1; transform:scale(1); }
  }
  @keyframes pulse-ring {
    0%   { transform:scale(1); opacity:1; }
    100% { transform:scale(1.8); opacity:0; }
  }
  @keyframes float {
    0%,100% { transform:translateY(0); }
    50%      { transform:translateY(-5px); }
  }
  @keyframes spin-slow { to { transform:rotate(360deg); } }
  @keyframes count-up {
    from { opacity:0; transform:translateY(10px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes shimmer {
    0%   { background-position:-200% 0; }
    100% { background-position:200% 0; }
  }
  @keyframes blob {
    0%,100% { border-radius:60% 40% 30% 70% / 60% 30% 70% 40%; }
    50%      { border-radius:30% 60% 70% 40% / 50% 60% 30% 60%; }
  }
  @keyframes progress-fill {
    from { width:0%; }
    to   { width:var(--target); }
  }

  .fade-slide-up  { animation:fadeSlideUp 0.45s cubic-bezier(.22,1,.36,1) both; }
  .scale-in       { animation:scaleIn 0.35s cubic-bezier(.22,1,.36,1) both; }
  .float-anim     { animation:float 3s ease-in-out infinite; }
  .spin-slow      { animation:spin-slow 8s linear infinite; }
  .count-up       { animation:count-up 0.5s cubic-bezier(.22,1,.36,1) both; }
  .progress-bar   { animation:progress-fill 1s cubic-bezier(.22,1,.36,1) both; }

  .stat-card {
    transition: transform 0.25s cubic-bezier(.22,1,.36,1), box-shadow 0.25s cubic-bezier(.22,1,.36,1);
  }
  .stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 20px 40px rgba(0,0,0,0.10);
  }

  .nav-item {
    transition: background-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
  }
  .nav-item:hover { transform: translateX(3px); }

  .btn-primary {
    transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
  }
  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(42,125,78,0.35);
    filter: brightness(1.05);
  }
  .btn-primary:active:not(:disabled) { transform:scale(0.98); }

  .table-row { transition:background-color 0.15s ease; }
  .table-row:hover { background-color:#F8FFF9; }

  .modal-overlay { animation:fadeSlideUp 0.2s ease both; }

  .panel-card {
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .panel-card:hover { box-shadow:0 8px 24px rgba(0,0,0,0.08); border-color:#C5E8D1; }

  /* Lottie-style blob decoration */
  .lottie-blob {
    animation:blob 6s ease-in-out infinite;
    opacity:0.15;
  }

  /* Live pulse dot */
  .live-dot::before {
    content:'';
    position:absolute;
    inset:0;
    border-radius:50%;
    background:currentColor;
    animation:pulse-ring 1.5s ease-out infinite;
  }

  /* Stagger delays */
  .delay-1 { animation-delay:0.05s; }
  .delay-2 { animation-delay:0.10s; }
  .delay-3 { animation-delay:0.15s; }
  .delay-4 { animation-delay:0.20s; }
`;

// ── Lottie-style animated icon (CSS-only, mimics Lottie) ──────
function AnimIcon({ type, color }: { type: string; color: string }) {
  if (type === "pulse") return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      <div className="absolute inset-0 rounded-full opacity-20" style={{ backgroundColor: color, animation: "blob 3s ease-in-out infinite" }} />
      <svg className="w-5 h-5 relative z-10" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    </div>
  );
  if (type === "spin") return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      <svg className="w-10 h-10 absolute opacity-10 spin-slow" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="18" stroke={color} strokeWidth="2" strokeDasharray="8 4"/>
      </svg>
      <svg className="w-5 h-5 relative z-10" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
      </svg>
    </div>
  );
  if (type === "float") return (
    <div className="w-10 h-10 flex items-center justify-center float-anim">
      <svg className="w-5 h-5" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    </div>
  );
  // default: microscope
  return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      <div className="absolute inset-0 rounded-full opacity-15" style={{ backgroundColor: color, animation: "blob 4s ease-in-out infinite" }} />
      <svg className="w-5 h-5 relative z-10" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    </div>
  );
}

// ── Stat card (pastel, smooth, animated) ─────────────────────
function StatCard({ label, value, sub, bg, border, accent, animType, delay }: {
  label:string; value:string|number; sub?:string; bg:string; border:string; accent:string; animType:string; delay:number;
}) {
  return (
    <div className={`stat-card fade-slide-up delay-${delay} rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden`}
      style={{ backgroundColor: bg, border: `1.5px solid ${border}` }}>
      {/* Decorative blob */}
      <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full lottie-blob" style={{ backgroundColor: accent }} />
      <div className="flex items-center justify-between relative z-10">
        <AnimIcon type={animType} color={accent} />
        <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ backgroundColor:`${accent}18`, color:accent }}>{label}</span>
      </div>
      <div className="relative z-10">
        <div className="text-4xl font-black count-up" style={{ color: accent }}>{value}</div>
        {sub && <div className="text-xs font-medium mt-0.5" style={{ color:`${accent}99` }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Smooth progress bar ───────────────────────────────────────
function ProgressBar({ value, color, bg }: { value:number; color:string; bg?:string }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: bg || "#F0F0F0" }}>
      <div className="h-full rounded-full progress-bar" style={{ "--target":`${value}%`, width:`${value}%`, backgroundColor:color } as any} />
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────
function Badge({ label, color="gray" }: { label:string; color?:"green"|"red"|"amber"|"gray"|"blue"|"purple" }) {
  const map = { green:"#E8F5EE #C5E8D1 #2D7A4F", red:"#FEE8E8 #FFBCBC #C53030", amber:"#FFF3E8 #FFD9B5 #C47A0A", gray:"#F4F4F4 #E0E0E0 #777", blue:"#E8F0FF #C5D5FF #3557D4", purple:"#F3E8FF #DCC5FF #7B3DD4" };
  const [bg,border,text] = (map[color]||map.gray).split(" ");
  return <span className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full" style={{ backgroundColor:bg, border:`1px solid ${border}`, color:text }}>{label}</span>;
}
function classBadge(c:string) {
  if (c==="Normal") return <Badge label={c} color="green"/>;
  if (c==="Tuberculosis") return <Badge label={c} color="red"/>;
  if (c==="Pneumonia") return <Badge label={c} color="amber"/>;
  return <Badge label={c} color="gray"/>;
}

// ── Panel ─────────────────────────────────────────────────────
function Panel({ children, className="" }: { children:React.ReactNode; className?:string }) {
  return <div className={`panel-card bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`}>{children}</div>;
}

function Heading({ title, sub, children }: { title:string; sub?:string; children?:React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

function Table({ heads, children, empty }: { heads:string[]; children:React.ReactNode; empty?:string }) {
  return (
    <Panel>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-gray-100 bg-gray-50/60">{heads.map(h=><th key={h} className="text-left px-5 py-3.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">{h}</th>)}</tr></thead>
          <tbody>{children}</tbody>
        </table>
        {empty && <div className="px-5 py-10 text-center text-sm text-gray-400">{empty}</div>}
      </div>
    </Panel>
  );
}
function TR({ children }:{ children:React.ReactNode }) { return <tr className="table-row border-b border-gray-50 last:border-0">{children}</tr>; }
function TD({ children, mono }:{ children:React.ReactNode; mono?:boolean }) { return <td className={`px-5 py-3.5 text-sm ${mono?"font-mono text-xs text-gray-400":"text-gray-700"}`}>{children}</td>; }

// ── Nav icons ─────────────────────────────────────────────────
const ICONS: Record<Tab,React.ReactNode> = {
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

// ── Password Modal ────────────────────────────────────────────
function PasswordModal({ user, onClose }: { user:ApiUser; onClose:()=>void }) {
  const [newPw,setNewPw]=useState(""); const [showPw,setShowPw]=useState(false); const [loading,setLoading]=useState(false);
  const [generatedPw,setGeneratedPw]=useState(""); const [msg,setMsg]=useState(""); const [msgOk,setMsgOk]=useState(true); const [copied,setCopied]=useState(false);
  const hasAuth = user.firebase_uid && !user.firebase_uid.startsWith("pending_");
  const generate = async () => { setLoading(true);setMsg("");setGeneratedPw(""); try{const r=await adminFetch(`/users/${user.id}/generate-password`,{method:"POST"});setGeneratedPw(r.password);setMsg(`Password set for ${r.email}`);setMsgOk(true);}catch(e:any){setMsg(e.message);setMsgOk(false);}finally{setLoading(false);} };
  const setManual = async () => { if(newPw.length<6){setMsg("Min 6 chars");setMsgOk(false);return;} setLoading(true);setMsg(""); try{await adminFetch(`/users/${user.id}/set-password`,{method:"POST",body:JSON.stringify({password:newPw})});setMsg(`Updated for ${user.email}`);setMsgOk(true);setNewPw("");}catch(e:any){setMsg(e.message);setMsgOk(false);}finally{setLoading(false);} };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="modal-overlay w-full max-w-md bg-white rounded-3xl shadow-2xl p-7 space-y-5 border border-gray-100">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold text-gray-900">Manage Password</h2><p className="text-xs text-gray-400 mt-0.5">{user.full_name} · {user.email}</p></div><button onClick={onClose} className="w-9 h-9 rounded-xl bg-gray-100 text-gray-400 hover:bg-gray-200 flex items-center justify-center text-sm transition-colors">✕</button></div>
        {!hasAuth && <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs">⚠ Approve user first.</div>}
        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-3">
          <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Auto-Generate</div>
          <button onClick={generate} disabled={loading||!hasAuth} className="btn-primary w-full py-2.5 rounded-xl text-white text-xs font-bold uppercase tracking-widest disabled:opacity-40" style={{backgroundColor:ACCENT}}>{loading?"Generating…":"⚡ Generate & Set Password"}</button>
          {generatedPw&&<div className="p-3 rounded-xl bg-white border border-gray-200"><div className="text-[8px] font-bold uppercase text-gray-400 mb-1.5">Share with user</div><div className="flex items-center gap-2"><code className="flex-1 text-sm font-mono font-bold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">{generatedPw}</code><button onClick={()=>{navigator.clipboard.writeText(generatedPw);setCopied(true);setTimeout(()=>setCopied(false),2000);}} className="px-3 py-2 text-white text-xs font-bold rounded-lg btn-primary" style={{backgroundColor:ACCENT}}>{copied?"✓":"Copy"}</button></div></div>}
        </div>
        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-3">
          <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Set Custom</div>
          <div className="relative"><input type={showPw?"text":"password"} value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Min 6 characters" className={INP+" pr-16"}/><button type="button" onClick={()=>setShowPw(s=>!s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-200 text-gray-600">{showPw?"Hide":"Show"}</button></div>
          <button onClick={setManual} disabled={loading||!hasAuth||!newPw} className="btn-primary w-full py-2.5 rounded-xl text-white text-xs font-bold uppercase tracking-widest disabled:opacity-40" style={{backgroundColor:"#3557D4"}}>Set Password</button>
        </div>
        {msg&&<div className={`p-3 rounded-xl text-xs font-semibold ${msgOk?"bg-emerald-50 border border-emerald-200 text-emerald-700":"bg-red-50 border border-red-200 text-red-600"}`}>{msg}</div>}
        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-500 text-xs font-bold uppercase tracking-widest hover:bg-gray-200 transition-colors">Close</button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [tab,setTab]=useState<Tab>("overview");
  const [apiUsers,setApiUsers]=useState<ApiUser[]>([]);
  const [diagnoses,setDiagnoses]=useState<Diagnosis[]>([]);
  const [patients,setPatients]=useState<Patient[]>([]);
  const [stats,setStats]=useState<Stats|null>(null);
  const [modelInfo,setModelInfo]=useState<ModelInfo|null>(null);
  const [auditLogs,setAuditLogs]=useState<AuditLog[]>([]);
  const [pwLogs,setPwLogs]=useState<AuditLog[]>([]);
  const [health,setHealth]=useState<any>(null);
  const [retrainJobs,setRetrainJobs]=useState<RetrainJob[]>([]);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [pwUser,setPwUser]=useState<ApiUser|null>(null);
  const [collapsed,setCollapsed]=useState(false);
  const [editPatient,setEditPatient]=useState<EditPatient|null>(null);
  const [editError,setEditError]=useState(""); const [editSaving,setEditSaving]=useState(false);
  const [expandedPatient,setExpandedPatient]=useState<number|null>(null);
  const [patientName,setPatientName]=useState(""); const [patientNationalId,setPatientNationalId]=useState(""); const [nationalIdError,setNationalIdError]=useState("");
  const [xrayFile,setXrayFile]=useState<File|null>(null); const [xrayPreview,setXrayPreview]=useState<string|null>(null);
  const [predicting,setPredicting]=useState(false); const [prediction,setPrediction]=useState<PredictionResult|null>(null);
  const [savedDiagnosis,setSavedDiagnosis]=useState<Diagnosis|null>(null); const [savedPatient,setSavedPatient]=useState<Patient|null>(null);
  const [predError,setPredError]=useState(""); const [predInfo,setPredInfo]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);
  const [retrainFiles,setRetrainFiles]=useState<File[]>([]); const [retrainLabel,setRetrainLabel]=useState("Normal");
  const [uploading,setUploading]=useState(false); const [retrainMsg,setRetrainMsg]=useState(""); const [retrainMsgOk,setRetrainMsgOk]=useState(true);
  const [uploadedCounts,setUploadedCounts]=useState<Record<string,number>>({}); const [stagedCounts,setStagedCounts]=useState<Record<string,number>>({});
  const [retrainDragging,setRetrainDragging]=useState(false); const retrainFileRef=useRef<HTMLInputElement>(null);

  const loadAll=useCallback(async()=>{
    setError("");
    try {
      const [u,d,p,s,m,h,a,j]=await Promise.allSettled([adminFetch("/users"),adminFetch("/diagnoses"),adminFetch("/patients"),adminFetch("/stats"),adminFetch("/model/info"),adminFetch("/health"),adminFetch("/audit?limit=100"),adminFetch("/retrain/jobs")]);
      if(u.status==="fulfilled")setApiUsers(u.value); if(d.status==="fulfilled")setDiagnoses(d.value); if(p.status==="fulfilled")setPatients(p.value);
      if(s.status==="fulfilled")setStats(s.value); if(m.status==="fulfilled")setModelInfo(m.value); if(h.status==="fulfilled")setHealth(h.value);
      if(a.status==="fulfilled"){setAuditLogs(a.value);setPwLogs(a.value.filter((l:AuditLog)=>l.action.includes("password")||l.action.includes("Password")));}
      if(j.status==="fulfilled")setRetrainJobs(j.value);
      adminFetch("/retrain/staged").then(s=>setStagedCounts(s.counts)).catch(()=>{});
    }catch(e:any){setError(e.message);}
  },[]);

  useEffect(()=>{loadAll();},[loadAll]);
  useEffect(()=>{
    const active=retrainJobs.some(j=>j.status==="processing"||j.status==="pending"); if(!active)return;
    const id=setInterval(async()=>{const jobs=await adminFetch("/retrain/jobs").catch(()=>null);if(jobs)setRetrainJobs(jobs);},5000);
    return()=>clearInterval(id);
  },[retrainJobs]);

  const approveUser=async(id:number)=>{await adminFetch(`/users/${id}/status`,{method:"PATCH",body:JSON.stringify({status:"approved"})});loadAll();};
  const rejectUser=async(id:number)=>{const r=prompt("Rejection reason:")??"";await adminFetch(`/users/${id}/status`,{method:"PATCH",body:JSON.stringify({status:"rejected",rejection_reason:r})});loadAll();};
  const deleteUser=async(id:number,name:string)=>{if(!confirm(`Delete ${name}?`))return;try{await adminFetch(`/users/${id}`,{method:"DELETE"});loadAll();}catch(e:any){setError(e.message);}};
  const openEditPatient=(p:Patient)=>{setEditPatient({id:p.id,name:p.name,patient_ref_id:p.patient_ref_id||"",hospital:p.hospital||"",clinical_notes:p.clinical_notes||""});setEditError("");};
  const saveEditPatient=async()=>{
    if(!editPatient)return; if(!editPatient.name.trim()){setEditError("Name required");return;}
    if(editPatient.patient_ref_id&&!validateRwandaId(editPatient.patient_ref_id)){setEditError("National ID must be 16 digits");return;}
    setEditSaving(true);setEditError("");
    try{await adminFetch(`/patients/${editPatient.id}`,{method:"PATCH",body:JSON.stringify({name:editPatient.name,patient_ref_id:editPatient.patient_ref_id||null,hospital:editPatient.hospital||null,clinical_notes:editPatient.clinical_notes||null})});setEditPatient(null);loadAll();}
    catch(e:any){setEditError(e.message);}finally{setEditSaving(false);}
  };
  const deletePatient=async(id:number,name:string)=>{if(!confirm(`Delete "${name}"?`))return;try{await adminFetch(`/patients/${id}`,{method:"DELETE"});loadAll();}catch(e:any){setError(e.message);}};
  const deletePatientDiagnosis=async(id:number)=>{if(!confirm("Delete this diagnosis?"))return;try{await adminFetch(`/diagnoses/${id}`,{method:"DELETE"});loadAll();}catch(e:any){setError(e.message);}};
  const handleNationalIdChange=(val:string)=>{const d=val.replace(/\D/g,"").slice(0,16);setPatientNationalId(d);setNationalIdError(d.length>0&&d.length<16?"Must be 16 digits":"");};
  const handleFileChange=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;setXrayFile(f);setXrayPreview(URL.createObjectURL(f));setPrediction(null);setSavedDiagnosis(null);setPredError("");setPredInfo("");};

  const runPrediction=async()=>{
    if(!xrayFile||!patientName.trim()){setPredError("Enter patient name and upload X-ray");return;}
    if(!validateRwandaId(patientNationalId)){setPredError("Enter valid 16-digit Rwanda National ID");return;}
    setPredicting(true);setPredError("");setPredInfo("");setPrediction(null);setSavedDiagnosis(null);setSavedPatient(null);
    try{
      let patient:Patient|null=null;
      try{patient=await adminFetch("/patients",{method:"POST",body:JSON.stringify({name:patientName.trim(),patient_ref_id:patientNationalId})});setPatients(prev=>[patient!,...prev.filter(p=>p.id!==patient!.id)]);}
      catch(e:any){const{type,existingId}=parseDuplicateError(e.message);if((type==="NATIONAL_ID"||type==="NAME")&&existingId){const ex=patients.find(p=>p.id===existingId)??await adminFetch(`/patients/${existingId}`).catch(()=>null);if(ex){patient=ex;setPredInfo(`Using existing: ${ex.name}`);}else throw e;}else throw e;}
      if(!patient)throw new Error("Could not resolve patient");
      setSavedPatient(patient);
      const fd=new FormData();fd.append("file",xrayFile);
      const{data:sd}=await supabase.auth.getSession();const token=sd.session?.access_token;
      const res=await fetch(`${API_BASE}/predict`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:fd});
      if(!res.ok){const e=await res.json();throw new Error(e.detail||"Prediction failed");}
      const result:PredictionResult=await res.json();setPrediction(result);
      const saved:Diagnosis=await adminFetch("/diagnoses",{method:"POST",body:JSON.stringify({patient_id:patient.id,xray_filename:xrayFile.name,ai_classification:result.classification,confidence_score:result.confidence_score,tb_probability:result.tb_probability,pneumonia_probability:result.pneumonia_probability,normal_probability:result.normal_probability,unknown_probability:result.unknown_probability??0,ai_explanation:result.explanation,heatmap_b64:result.gradcam_b64})});
      setSavedDiagnosis(saved);setDiagnoses(prev=>[saved,...prev]);loadAll().catch(()=>{});
    }catch(e:any){setPredError(e.message);}finally{setPredicting(false);}
  };

  const uploadForRetrain=async()=>{
    if(!retrainFiles.length){setRetrainMsg("Select files first");setRetrainMsgOk(false);return;}
    setUploading(true);setRetrainMsg("");
    try{
      const fd=new FormData();retrainFiles.forEach(f=>fd.append("files",f));
      const{data}=await supabase.auth.getSession();const token=data.session?.access_token;
      const res=await fetch(`${API_BASE}/retrain/upload?label=${encodeURIComponent(retrainLabel)}`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:fd});
      if(!res.ok){const e=await res.json();throw new Error(e.detail);}
      const r=await res.json();setUploadedCounts(prev=>({...prev,[retrainLabel]:(prev[retrainLabel]||0)+r.files_saved}));setRetrainMsg(`Uploaded ${r.files_saved} file(s) as "${retrainLabel}"`);setRetrainMsgOk(true);setRetrainFiles([]);
      adminFetch("/retrain/staged").then(s=>setStagedCounts(s.counts)).catch(()=>{});
    }catch(e:any){setRetrainMsg(e.message);setRetrainMsgOk(false);}finally{setUploading(false);}
  };

  const triggerRetrain=async()=>{
    if(!window.confirm("Start retraining?"))return;
    try{const job=await adminFetch("/retrain/trigger",{method:"POST"});setRetrainMsg(`Job #${job.id} started`);setRetrainMsgOk(true);setUploadedCounts({});setStagedCounts({});loadAll();}
    catch(e:any){setRetrainMsg(e.message);setRetrainMsgOk(false);}
  };

  const navItems: {id:Tab;label:string;badge?:number}[] = [
    {id:"overview",label:"Overview"},
    {id:"users",label:"Users",badge:apiUsers.filter(u=>u.status==="pending").length||undefined},
    {id:"predictions",label:"Predictions",badge:diagnoses.length||undefined},
    {id:"patients",label:"Patients",badge:patients.length||undefined},
    {id:"diagnose",label:"Diagnose"},
    {id:"retrain",label:"Retrain AI"},
    {id:"model",label:"Model"},
    {id:"passwords",label:"Passwords"},
    {id:"audit",label:"Audit Log"},
  ];

  const pending=apiUsers.filter(u=>u.status==="pending").length;

  const DIST=[
    {cls:"Normal",       bg:"#E8F5EE",border:"#C5E8D1",accent:"#2D7A4F",bar:"#3A9D63"},
    {cls:"Tuberculosis", bg:"#FEE8E8",border:"#FFBCBC",accent:"#B52A2A",bar:"#D44040"},
    {cls:"Pneumonia",    bg:"#FFF3E8",border:"#FFD9B5",accent:"#C47A0A",bar:"#E59420"},
    {cls:"Unknown",      bg:"#F3F3F3",border:"#E0E0E0",accent:"#666",   bar:"#888"},
  ];

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div className="min-h-screen flex" style={{fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif"}}>

        {/* ── MODALS ── */}
        {pwUser&&<PasswordModal user={pwUser} onClose={()=>setPwUser(null)}/>}

        {editPatient&&(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
            <div className="modal-overlay w-full max-w-md bg-white rounded-3xl shadow-2xl p-7 space-y-5 border border-gray-100">
              <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold text-gray-900">Edit Patient</h2><button onClick={()=>setEditPatient(null)} className="w-9 h-9 rounded-xl bg-gray-100 text-gray-400 hover:bg-gray-200 flex items-center justify-center text-sm transition-colors">✕</button></div>
              <div className="space-y-3">
                <div><label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Full Name *</label><input value={editPatient.name} onChange={e=>setEditPatient({...editPatient,name:e.target.value})} className={INP}/></div>
                <div><label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">National ID (16 digits)</label><input value={editPatient.patient_ref_id} onChange={e=>setEditPatient({...editPatient,patient_ref_id:e.target.value.replace(/\D/g,"").slice(0,16)})} className={INP+" font-mono"} maxLength={16} inputMode="numeric"/></div>
                <div><label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Hospital</label><input value={editPatient.hospital} onChange={e=>setEditPatient({...editPatient,hospital:e.target.value})} className={INP}/></div>
                <div><label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Clinical Notes</label><textarea value={editPatient.clinical_notes} onChange={e=>setEditPatient({...editPatient,clinical_notes:e.target.value})} className={INP+" h-20 resize-none"}/></div>
              </div>
              {editError&&<div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs">{editError}</div>}
              <div className="flex gap-2"><button onClick={()=>setEditPatient(null)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold uppercase tracking-widest hover:bg-gray-200 transition-colors">Cancel</button><button onClick={saveEditPatient} disabled={editSaving} className="btn-primary flex-1 py-2.5 rounded-xl text-white text-xs font-bold uppercase tracking-widest disabled:opacity-40" style={{backgroundColor:ACCENT}}>{editSaving?"Saving…":"Save"}</button></div>
            </div>
          </div>
        )}

        {/* ── SIDEBAR ── */}
        <aside className={`${collapsed?"w-[68px]":"w-[230px]"} shrink-0 flex flex-col sticky top-0 h-screen transition-all duration-300`} style={{backgroundColor:SIDEBAR_BG}}>
          
          {/* Logo — matches landing page exactly */}
          <div className="h-16 flex items-center px-4 gap-3 border-b border-white/10">
            <div className="w-7 h-7 bg-emerald-900 rounded-md flex items-center justify-center shrink-0">
              <div className="w-4 h-[1.5px] bg-emerald-100 rounded-full"/>
            </div>
            {!collapsed&&(
              <div>
                <span className="text-[13px] font-bold text-white uppercase tracking-tight">Ubuzima Connect</span>
              </div>
            )}
          </div>

          {/* Live status */}
          {health&&!collapsed&&(
            <div className="mx-3 mt-3 px-3 py-2 rounded-xl flex items-center gap-2" style={{backgroundColor:"rgba(255,255,255,0.08)"}}>
              <div className="relative w-2 h-2 shrink-0 live-dot" style={{color:health.status==="healthy"?"#4ADE80":"#F87171"}}>
                <div className="w-2 h-2 rounded-full" style={{backgroundColor:health.status==="healthy"?"#4ADE80":"#F87171"}}/>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/50">{health.status==="healthy"?`Live · ${uptimeFmt(health.uptime_seconds)}`:"Offline"}</span>
            </div>
          )}

          {/* Nav */}
          <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
            {!collapsed&&<div className="text-[8px] font-bold uppercase tracking-widest px-3 py-2 text-white/25">Navigation</div>}
            {navItems.map(item=>{
              const active=tab===item.id;
              return(
                <button key={item.id} onClick={()=>{setTab(item.id);setSearch("");setExpandedPatient(null);}}
                  title={collapsed?item.label:undefined}
                  className="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left relative"
                  style={{backgroundColor:active?SIDEBAR_ACTIVE:"transparent",color:active?"white":"rgba(255,255,255,0.55)"}}>
                  {active&&<div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-white/60"/>}
                  <svg className="shrink-0" style={{width:16,height:16}} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">{ICONS[item.id]}</svg>
                  {!collapsed&&<span className="text-[11px] font-bold uppercase tracking-wider flex-1">{item.label}</span>}
                  {item.badge!==undefined&&item.badge>0&&(
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{backgroundColor:active?"rgba(255,255,255,0.2)":"#F4623A",color:"white"}}>{item.badge}</span>
                  )}
                  {collapsed&&item.badge!==undefined&&item.badge>0&&<span className="absolute top-1 right-1 w-2 h-2 bg-orange-400 rounded-full"/>}
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-2 space-y-1 border-t border-white/10">
            <button onClick={loadAll} className="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 hover:text-white/70 transition-colors">
              <svg style={{width:15,height:15}} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15"/></svg>
              {!collapsed&&<span className="text-[11px] font-bold uppercase tracking-wider">Refresh</span>}
            </button>
            <button onClick={()=>supabase.auth.signOut()} className="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 hover:text-red-300 transition-colors">
              <svg style={{width:15,height:15}} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              {!collapsed&&<span className="text-[11px] font-bold uppercase tracking-wider">Sign Out</span>}
            </button>
            <button onClick={()=>setCollapsed(s=>!s)} className="w-full flex items-center justify-center py-2 rounded-xl text-white/25 hover:text-white/50 transition-colors">
              <svg style={{width:14,height:14}} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">{collapsed?<path d="M9 18l6-6-6-6"/>:<path d="M15 18l-6-6 6-6"/>}</svg>
            </button>
          </div>
        </aside>

        {/* ── MAIN (pure white) ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">

          {/* Topbar */}
          <header className="h-16 flex items-center justify-between px-8 sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-lg font-extrabold text-gray-900 capitalize">{tab.replace("-"," ")}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-white px-2.5 py-1 rounded-full" style={{backgroundColor:ACCENT}}>Admin</span>
            </div>
            <div className="flex items-center gap-3">
              {error&&<div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-semibold"><span>⚠ {error}</span><button onClick={()=>setError("")}>✕</button></div>}
              {pending>0&&<div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-50 text-orange-600 border border-orange-200"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"/>{pending} pending</div>}
              <div className="text-xs font-medium text-gray-400">{new Date().toLocaleDateString("en-RW",{weekday:"short",day:"2-digit",month:"short",year:"numeric"})}</div>
            </div>
          </header>

          <main className="flex-1 p-8 overflow-y-auto bg-gray-50/30">

            {/* ── OVERVIEW ── */}
            {tab==="overview"&&(
              <div className="space-y-6">
                <Heading title="System Overview" sub="Live status across the platform"/>
                
                {/* Stat cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                  <StatCard label="Radiologists" value={stats?.total_radiologists??"—"} sub="Active clinicians" bg={CARDS[0].bg} border={CARDS[0].border} accent={CARDS[0].accent} animType="spin" delay={1}/>
                  <StatCard label="Pending" value={stats?.pending_requests??0} sub="Awaiting approval" bg={CARDS[1].bg} border={CARDS[1].border} accent={CARDS[1].accent} animType="pulse" delay={2}/>
                  <StatCard label="Patients" value={patients.length} sub="Registered" bg={CARDS[2].bg} border={CARDS[2].border} accent={CARDS[2].accent} animType="float" delay={3}/>
                  <StatCard label="Diagnoses" value={diagnoses.length} sub="AI scans done" bg={CARDS[3].bg} border={CARDS[3].border} accent={CARDS[3].accent} animType="micro" delay={4}/>
                </div>

                {/* Distribution */}
                <Panel className="p-6 fade-slide-up">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-5">Diagnosis Distribution</div>
                  <div className="grid grid-cols-4 gap-4">
                    {DIST.map(({cls,bg,border,accent,bar})=>{
                      const count=diagnoses.filter(d=>d.ai_classification===cls).length;
                      const pct=diagnoses.length?Math.round((count/diagnoses.length)*100):0;
                      return(
                        <div key={cls} className="stat-card rounded-2xl p-5" style={{backgroundColor:bg,border:`1.5px solid ${border}`}}>
                          <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{color:accent}}>{cls}</div>
                          <div className="text-3xl font-black mb-3" style={{color:accent}}>{count}</div>
                          <ProgressBar value={pct} color={bar} bg={`${accent}20`}/>
                          <div className="text-[10px] font-semibold mt-1.5" style={{color:`${accent}99`}}>{pct}%</div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>

                <div className="grid lg:grid-cols-2 gap-5">
                  {/* Model */}
                  <Panel className="p-6 fade-slide-up">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-4">AI Model</div>
                    {modelInfo?(
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${modelInfo.status==="loaded"?"bg-emerald-500":"bg-gray-300"}`} style={modelInfo.status==="loaded"?{boxShadow:"0 0 8px #4ADE8088"}:{}}/>
                          <span className="font-extrabold text-gray-900 capitalize">{modelInfo.status}</span>
                          <span className="text-xs font-mono text-gray-400">{modelInfo.architecture}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl p-4 bg-gray-50 border border-gray-100"><div className="text-[9px] uppercase font-bold text-gray-400 mb-1">Size</div><div className="text-2xl font-black text-gray-900">{modelInfo.size_mb} <span className="text-xs font-bold text-gray-400">MB</span></div></div>
                          <div className="rounded-xl p-4 bg-gray-50 border border-gray-100"><div className="text-[9px] uppercase font-bold text-gray-400 mb-1">Classes</div><div className="text-2xl font-black text-gray-900">{modelInfo.classes?.length}</div></div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">{modelInfo.classes?.map(c=>classBadge(c))}</div>
                      </div>
                    ):<div className="text-sm text-gray-400">Loading…</div>}
                  </Panel>

                  {/* Recent preds */}
                  <Panel className="p-6 fade-slide-up">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-4">Recent Predictions</div>
                    <div className="space-y-2">
                      {diagnoses.slice(0,7).map(d=>{
                        const pt=patients.find(p=>p.id===d.patient_id);
                        const dotColor=d.ai_classification==="Normal"?"#2D7A4F":d.ai_classification==="Tuberculosis"?"#B52A2A":d.ai_classification==="Pneumonia"?"#C47A0A":"#888";
                        return(
                          <div key={d.id} className="panel-card flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 hover:bg-white transition-colors">
                            <div className="flex items-center gap-2.5"><div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:dotColor}}/><span className="text-xs font-semibold text-gray-800">{pt?.name??"Unknown"}</span></div>
                            <div className="flex items-center gap-2.5">
                              {classBadge(d.ai_classification)}
                              <div className="flex items-center gap-1.5"><div className="w-14 h-1.5 rounded-full bg-gray-200 overflow-hidden"><div className="h-full rounded-full" style={{width:`${d.confidence_score}%`,backgroundColor:dotColor}}/></div><span className="text-[10px] font-black" style={{color:dotColor}}>{d.confidence_score.toFixed(0)}%</span></div>
                            </div>
                          </div>
                        );
                      })}
                      {diagnoses.length===0&&<div className="text-sm text-gray-400 text-center py-6">No predictions yet</div>}
                    </div>
                  </Panel>
                </div>
              </div>
            )}

            {/* ── USERS ── */}
            {tab==="users"&&(
              <div className="space-y-5 fade-slide-up">
                <Heading title="User Management" sub={`${apiUsers.length} users`}>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search users…" className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 w-48 shadow-sm"/>
                </Heading>
                <Table heads={["Name","Email","Hospital","License","Role","Status","Joined","Actions"]} empty={apiUsers.length===0?"No users yet":undefined}>
                  {apiUsers.filter(u=>!search||u.full_name.toLowerCase().includes(search.toLowerCase())||u.email.toLowerCase().includes(search.toLowerCase())).map(u=>(
                    <TR key={u.id}>
                      <td className="px-5 py-3.5"><span className="text-sm font-bold text-gray-900">{u.full_name}</span></td>
                      <TD mono>{u.email}</TD><TD mono>{u.hospital||"—"}</TD><TD mono>{u.license_number||"—"}</TD>
                      <td className="px-5 py-3.5"><Badge label={u.role} color="blue"/></td>
                      <td className="px-5 py-3.5">{u.status==="approved"?<Badge label="approved" color="green"/>:u.status==="pending"?<Badge label="pending" color="amber"/>:<Badge label="rejected" color="red"/>}</td>
                      <TD mono>{fmt(u.created_at)}</TD>
                      <td className="px-5 py-3.5"><div className="flex gap-1.5 flex-wrap">
                        {u.status==="pending"&&<><button onClick={()=>approveUser(u.id)} className="btn-primary text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl text-white" style={{backgroundColor:ACCENT}}>Approve</button><button onClick={()=>rejectUser(u.id)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">Reject</button></>}
                        {u.status==="approved"&&<button onClick={()=>setPwUser(u)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors">🔑 Password</button>}
                        <button onClick={()=>deleteUser(u.id,u.full_name)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors">Delete</button>
                      </div></td>
                    </TR>
                  ))}
                </Table>
              </div>
            )}

            {/* ── PREDICTIONS ── */}
            {tab==="predictions"&&(
              <div className="space-y-5 fade-slide-up">
                <Heading title="All Predictions" sub={`${diagnoses.length} diagnoses`}>
                  <div className="flex gap-1.5">{["All","Normal","Tuberculosis","Pneumonia","Unknown"].map(f=><button key={f} onClick={()=>setSearch(f==="All"?"":f)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl border transition-all btn-primary" style={(f==="All"&&!search)||search===f?{backgroundColor:ACCENT,color:"white",borderColor:ACCENT}:{backgroundColor:"white",color:"#999",borderColor:"#e5e7eb"}}>{f}</button>)}</div>
                </Heading>
                <div className="grid grid-cols-4 gap-4">
                  {DIST.map(({cls,bg,border,accent,bar})=>{const count=diagnoses.filter(d=>d.ai_classification===cls).length;const pct=diagnoses.length?Math.round((count/diagnoses.length)*100):0;return<div key={cls} className="stat-card rounded-2xl p-5" style={{backgroundColor:bg,border:`1.5px solid ${border}`}}><div className="text-[9px] font-bold uppercase mb-2" style={{color:accent}}>{cls}</div><div className="text-2xl font-black" style={{color:accent}}>{count}</div><ProgressBar value={pct} color={bar} bg={`${accent}20`}/><div className="text-[9px] font-semibold mt-1" style={{color:`${accent}99`}}>{pct}%</div></div>;})}
                </div>
                <Table heads={["Patient","National ID","Result","Confidence","TB%","Pneumonia%","Normal%","Radiologist","Verified","Date","Action"]} empty={diagnoses.length===0?"No predictions yet":undefined}>
                  {diagnoses.filter(d=>!search||d.ai_classification===search).map(d=>{
                    const pt=patients.find(p=>p.id===d.patient_id);
                    return(<TR key={d.id}>
                      <td className="px-5 py-3.5"><span className="text-sm font-bold text-gray-900">{pt?.name??"Unknown"}</span></td>
                      <TD mono>{pt?.patient_ref_id??"—"}</TD>
                      <td className="px-5 py-3.5">{classBadge(d.ai_classification)}</td>
                      <td className="px-5 py-3.5"><div className="flex items-center gap-2"><div className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{width:`${d.confidence_score}%`,backgroundColor:ACCENT}}/></div><span className="text-xs font-bold text-gray-700">{d.confidence_score.toFixed(1)}%</span></div></td>
                      <TD mono>{(d.tb_probability*100).toFixed(1)}%</TD><TD mono>{(d.pneumonia_probability*100).toFixed(1)}%</TD><TD mono>{(d.normal_probability*100).toFixed(1)}%</TD>
                      <TD>{apiUsers.find(u=>u.id===d.radiologist_id)?.full_name??"—"}</TD>
                      <td className="px-5 py-3.5">{d.radiologist_verified?<Badge label="Verified" color="green"/>:<Badge label="Pending" color="gray"/>}</td>
                      <TD mono>{fmt(d.created_at)}</TD>
                      <td className="px-5 py-3.5"><button onClick={()=>deletePatientDiagnosis(d.id)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">Delete</button></td>
                    </TR>);
                  })}
                </Table>
              </div>
            )}

            {/* ── PATIENTS ── */}
            {tab==="patients"&&(
              <div className="space-y-4 fade-slide-up">
                <Heading title="Patients" sub={`${patients.length} registered`}>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or ID…" className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 w-56 shadow-sm"/>
                </Heading>
                <div className="space-y-2">
                  {patients.filter(p=>!search||p.name.toLowerCase().includes(search.toLowerCase())||(p.patient_ref_id&&p.patient_ref_id.includes(search))).map(p=>{
                    const ptD=diagnoses.filter(d=>d.patient_id===p.id); const isExp=expandedPatient===p.id;
                    return(<div key={p.id} className="panel-card bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:border-emerald-200 transition-all">
                      <div className="flex items-center gap-4 px-6 py-4">
                        <button onClick={()=>setExpandedPatient(isExp?null:p.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-xs text-gray-400 border border-gray-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 shrink-0 transition-all">{isExp?"▾":"▸"}</button>
                        <div className="flex-1 grid grid-cols-7 gap-3 items-center min-w-0">
                          {[{l:"Name",v:<span className="text-sm font-bold text-gray-900 truncate">{p.name}</span>},{l:"National ID",v:<span className="text-xs font-mono text-gray-400">{p.patient_ref_id||"—"}</span>},{l:"Age",v:<span className="text-xs text-gray-400">{p.age?`${p.age}y`:"—"}</span>},{l:"Sex",v:<span className="text-xs text-gray-400">{p.sex||"—"}</span>},{l:"Hospital",v:<span className="text-xs text-gray-400 truncate">{p.hospital||"—"}</span>},{l:"Scans",v:ptD.length>0?<Badge label={`${ptD.length} scan${ptD.length!==1?"s":""}`} color="blue"/>:<Badge label="0 scans" color="gray"/>},{l:"Date",v:<span className="text-xs text-gray-400">{fmt(p.created_at)}</span>}].map(col=><div key={col.l}><div className="text-[8px] font-bold uppercase text-gray-300 mb-0.5">{col.l}</div>{col.v}</div>)}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={()=>openEditPatient(p)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors">Edit</button>
                          <button onClick={()=>deletePatient(p.id,p.name)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">Delete</button>
                        </div>
                      </div>
                      {isExp&&(
                        <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4">
                          <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-3">Diagnoses for {p.name}</div>
                          {ptD.length===0?<div className="text-sm text-gray-400">No diagnoses yet.</div>:(
                            <div className="space-y-2">{ptD.map(d=>(
                              <div key={d.id} className="flex items-center gap-4 p-3 rounded-xl bg-white border border-gray-100 shadow-sm">
                                <div className="flex-1 grid grid-cols-5 gap-3 items-center">
                                  <div><div className="text-[8px] font-bold uppercase text-gray-300 mb-0.5">Radiologist</div><div className="text-xs font-semibold text-gray-700">{apiUsers.find(u=>u.id===d.radiologist_id)?.full_name??"—"}</div></div>
                                  <div><div className="text-[8px] font-bold uppercase text-gray-300 mb-0.5">Result</div><div className="mt-0.5">{classBadge(d.ai_classification)}</div></div>
                                  <div><div className="text-[8px] font-bold uppercase text-gray-300 mb-0.5">Confidence</div><div className="text-xs font-black text-gray-700">{d.confidence_score.toFixed(1)}%</div></div>
                                  <div><div className="text-[8px] font-bold uppercase text-gray-300 mb-0.5">TB / Pneumo / Normal</div><div className="text-xs font-mono text-gray-400">{(d.tb_probability*100).toFixed(0)}% / {(d.pneumonia_probability*100).toFixed(0)}% / {(d.normal_probability*100).toFixed(0)}%</div></div>
                                  <div><div className="text-[8px] font-bold uppercase text-gray-300 mb-0.5">Date</div><div className="text-[10px] text-gray-400">{fmt(d.created_at)}</div></div>
                                </div>
                                <button onClick={()=>deletePatientDiagnosis(d.id)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 shrink-0 transition-colors">Delete</button>
                              </div>
                            ))}</div>
                          )}
                        </div>
                      )}
                    </div>);
                  })}
                  {patients.length===0&&<Panel className="p-10 text-center"><span className="text-sm text-gray-400">No patients yet</span></Panel>}
                </div>
              </div>
            )}

            {/* ── DIAGNOSE ── */}
            {tab==="diagnose"&&(
              <div className="space-y-6 fade-slide-up">
                <Heading title="Diagnostic Station" sub="Upload a chest X-ray for AI analysis"/>
                <div className="grid lg:grid-cols-2 gap-5">
                  <Panel className="p-7 space-y-5">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Patient Information</div>
                    <div className="space-y-4">
                      <div><label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Full Name *</label><input value={patientName} onChange={e=>setPatientName(e.target.value)} placeholder="Jean Uwimana" className={INP}/></div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Rwanda National ID * (16 digits)</label>
                        <input value={patientNationalId} onChange={e=>handleNationalIdChange(e.target.value)} placeholder="1199080012345678" maxLength={16} inputMode="numeric" className={`${INP} font-mono ${nationalIdError?"border-red-400 focus:ring-red-500/10":patientNationalId.length===16?"border-emerald-400":""}`}/>
                        <div className="flex justify-between mt-1.5">{nationalIdError?<span className="text-[10px] text-red-500 font-semibold">{nationalIdError}</span>:patientNationalId.length===16?<span className="text-[10px] font-semibold text-emerald-600">✓ Valid</span>:<span className="text-[10px] text-gray-400">16 digits required</span>}<span className="text-[10px] font-mono text-gray-400">{patientNationalId.length}/16</span></div>
                      </div>
                    </div>
                    <div onClick={()=>fileRef.current?.click()} className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all hover:border-emerald-400" style={{borderColor:xrayPreview?"#3A9D63":"#e5e7eb",backgroundColor:xrayPreview?"#F0FFF6":"#FAFAFA"}}>
                      {xrayPreview?<img src={xrayPreview} alt="X-ray" className="max-h-48 mx-auto rounded-xl object-contain"/>:<div className="space-y-2 float-anim"><div className="text-3xl">🩻</div><div className="text-sm font-semibold text-gray-500">Click to upload X-ray</div><div className="text-xs text-gray-400">JPG or PNG</div></div>}
                      <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={handleFileChange} className="hidden"/>
                    </div>
                    {predInfo&&<div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">{predInfo}</div>}
                    {predError&&<div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">{predError}</div>}
                    <button onClick={runPrediction} disabled={predicting||!xrayFile||!patientName.trim()||!validateRwandaId(patientNationalId)} className="btn-primary w-full py-4 rounded-2xl text-white font-extrabold disabled:opacity-40 text-sm" style={{backgroundColor:ACCENT}}>{predicting?"Analyzing X-ray…":"Run AI Diagnosis"}</button>
                  </Panel>
                  <Panel className="p-7">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-5">Diagnostic Result</div>
                    {!prediction&&!predicting&&<div className="flex flex-col items-center justify-center h-64 space-y-3"><div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-2xl text-gray-200 float-anim">◈</div><div className="text-sm font-bold uppercase tracking-widest text-gray-300">Awaiting Scan</div></div>}
                    {predicting&&<div className="flex flex-col items-center justify-center h-64 space-y-4"><div className="w-14 h-14 rounded-full border-4 border-gray-100 animate-spin" style={{borderTopColor:ACCENT}}/><div className="text-sm text-gray-400">Analyzing with ResNet-50…</div></div>}
                    {prediction&&(
                      <div className="space-y-5 scale-in">
                        <div className="p-5 rounded-2xl text-center" style={{backgroundColor:prediction.classification==="Normal"?"#E8F5EE":prediction.classification==="Tuberculosis"?"#FEE8E8":prediction.classification==="Unknown"?"#F3F3F3":"#FFF3E8"}}>
                          <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">AI Classification</div>
                          <div className="text-4xl font-black" style={{color:prediction.classification==="Normal"?"#2D7A4F":prediction.classification==="Tuberculosis"?"#B52A2A":prediction.classification==="Unknown"?"#666":"#C47A0A"}}>{prediction.classification}</div>
                          <div className="text-sm font-semibold mt-1 text-gray-400">{prediction.confidence_score.toFixed(1)}% confidence</div>
                        </div>
                        <div className="space-y-3">
                          {[{label:"Normal",value:prediction.normal_probability,color:"#3A9D63"},{label:"Pneumonia",value:prediction.pneumonia_probability,color:"#E59420"},{label:"Tuberculosis",value:prediction.tb_probability,color:"#D44040"}].map(r=>(
                            <div key={r.label}><div className="flex justify-between mb-1.5"><span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{r.label}</span><span className="text-xs font-black text-gray-700">{(r.value*100).toFixed(1)}%</span></div><ProgressBar value={r.value*100} color={r.color}/></div>
                          ))}
                        </div>
                        {savedDiagnosis&&<div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">✅ Diagnosis #{savedDiagnosis.id} saved</div>}
                        <button onClick={()=>{setPrediction(null);setSavedDiagnosis(null);setSavedPatient(null);setXrayFile(null);setXrayPreview(null);setPatientName("");setPatientNationalId("");setNationalIdError("");setPredError("");setPredInfo("");}} className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold uppercase tracking-widest hover:bg-gray-200 transition-colors">New Scan</button>
                      </div>
                    )}
                  </Panel>
                </div>
              </div>
            )}

            {/* ── RETRAIN ── */}
            {tab==="retrain"&&(
              <div className="space-y-6 fade-slide-up">
                <Heading title="Retrain AI Model" sub="Upload labelled X-rays — minimum 3 per class"/>
                <div className="grid lg:grid-cols-2 gap-5">
                  <Panel className="p-7 space-y-5">
                    <div><div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-3">Step 1 — Choose Label</div>
                    <div className="grid grid-cols-2 gap-2">{["Normal","Pneumonia","Tuberculosis","Unknown"].map(l=>{const active=retrainLabel===l;const colors:Record<string,string>={Normal:ACCENT,Tuberculosis:"#B52A2A",Pneumonia:"#C47A0A",Unknown:"#666"};const c=colors[l]||"#666";return<button key={l} onClick={()=>{setRetrainLabel(l);setRetrainFiles([]);}} className="btn-primary py-3 rounded-2xl text-xs font-bold border-2 transition-all" style={active?{backgroundColor:c,borderColor:c,color:"white"}:{backgroundColor:"white",borderColor:"#e5e7eb",color:"#999"}}>{l}{uploadedCounts[l]?<span className="block text-[9px] font-normal opacity-70">{uploadedCounts[l]} uploaded</span>:null}</button>;})}</div></div>
                    <div><div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">Step 2 — Upload for "{retrainLabel}"</div>
                    <div onDragOver={e=>{e.preventDefault();setRetrainDragging(true);}} onDragLeave={()=>setRetrainDragging(false)} onDrop={e=>{e.preventDefault();setRetrainDragging(false);setRetrainFiles(Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith("image/")));}} onClick={()=>retrainFileRef.current?.click()} className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all" style={{borderColor:retrainDragging?"#3557D4":retrainFiles.length>0?"#3557D4":"#e5e7eb",backgroundColor:retrainDragging||retrainFiles.length>0?"#EFF6FF":"#FAFAFA"}}>
                      {retrainFiles.length>0?<div><div className="text-lg font-black text-blue-700">{retrainFiles.length} file{retrainFiles.length!==1?"s":""} ready</div><div className="text-xs text-gray-400 mt-1">Click to change</div></div>:<div className="float-anim"><div className="text-sm font-semibold text-gray-500">Drop or click to browse</div><div className="text-xs text-gray-400 mt-1">JPG, PNG</div></div>}
                      <input ref={retrainFileRef} type="file" accept="image/*" multiple onChange={e=>setRetrainFiles(Array.from(e.target.files||[]))} className="hidden"/>
                    </div></div>
                    <button onClick={uploadForRetrain} disabled={uploading||!retrainFiles.length} className="btn-primary w-full py-3.5 rounded-2xl text-white font-bold disabled:opacity-40 text-sm" style={{backgroundColor:"#3557D4"}}>{uploading?"Uploading…":retrainFiles.length?`Upload ${retrainFiles.length} file(s) as "${retrainLabel}"`:"Select files first"}</button>
                    {(()=>{
                      const all={...stagedCounts};const cls=Object.keys(all).filter(k=>all[k]>0);const notReady=cls.filter(k=>all[k]<3);const canTrigger=cls.length>=2&&notReady.length===0;
                      return(<><div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2"><div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Staged</div>{["Normal","Pneumonia","Tuberculosis","Unknown"].map(l=>{const n=all[l]||0;if(n===0)return<div key={l} className="flex justify-between"><span className="text-xs text-gray-400">{l}</span><span className="text-xs italic text-gray-300">Not uploaded</span></div>;const ok=n>=3;return<div key={l} className="flex justify-between"><span className="text-xs font-semibold text-gray-700">{l}</span><span className={`text-xs font-bold ${ok?"text-emerald-600":"text-amber-600"}`}>{n} img{n!==1?"s":""} {ok?"✓":`— need ${3-n} more`}</span></div>;})}  {cls.length===0&&<div className="text-xs italic text-gray-300">Nothing staged yet</div>}</div><div><div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">Step 3 — Start</div><button onClick={triggerRetrain} disabled={!canTrigger} className="btn-primary w-full py-3.5 rounded-2xl text-white font-bold disabled:opacity-40 text-sm" style={{backgroundColor:"#7B3DD4"}}>{canTrigger?"⚡ Trigger Retraining":notReady.length>0?`Need more images (${notReady.join(", ")})`:"Upload to 2+ classes first"}</button></div></>);
                    })()}
                    {retrainMsg&&<div className={`p-3 rounded-xl text-xs font-semibold ${retrainMsgOk?"bg-emerald-50 border border-emerald-200 text-emerald-700":"bg-red-50 border border-red-200 text-red-600"}`}>{retrainMsg}</div>}
                  </Panel>
                  <Panel className="p-7 space-y-4">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Retrain Jobs</div>
                    {retrainJobs.length===0?<div className="text-sm text-gray-400 text-center py-8">No retrain jobs yet</div>:(
                      <div className="space-y-3">{retrainJobs.map(j=>{
                        const colors={completed:{bg:"#E8F5EE",border:"#C5E8D1"},processing:{bg:"#E8F0FF",border:"#C5D5FF"},failed:{bg:"#FEE8E8",border:"#FFBCBC"},pending:{bg:"#FFF3E8",border:"#FFD9B5"}};
                        const c=colors[j.status as keyof typeof colors]||colors.pending;
                        return<div key={j.id} className="rounded-2xl p-4 stat-card" style={{backgroundColor:c.bg,border:`1.5px solid ${c.border}`}}>
                          <div className="flex items-center justify-between mb-2"><span className="text-sm font-extrabold text-gray-900">Job #{j.id}</span>{j.status==="completed"?<Badge label="completed" color="green"/>:j.status==="processing"?<Badge label="processing" color="blue"/>:j.status==="failed"?<Badge label="failed" color="red"/>:<Badge label="pending" color="amber"/>}</div>
                          {j.final_val_acc&&<div className="text-xs text-gray-500 mb-1">Accuracy: <span className="font-black text-emerald-600">{(j.final_val_acc*100).toFixed(1)}%</span></div>}
                          {j.error_message&&<div className="mt-2 p-2.5 rounded-xl bg-red-100 text-xs text-red-700">{j.error_message}</div>}
                          <div className="text-[9px] mt-2 text-gray-400">{fmt(j.created_at)}</div>
                        </div>;
                      })}</div>
                    )}
                  </Panel>
                </div>
              </div>
            )}

            {/* ── MODEL ── */}
            {tab==="model"&&(
              <div className="space-y-6 fade-slide-up">
                <Heading title="AI Model" sub="ResNet-50 production model"/>
                {modelInfo&&<div className="grid lg:grid-cols-2 gap-5">
                  <Panel className="p-7 space-y-4"><div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Details</div>{[{l:"Status",v:modelInfo.status},{l:"Architecture",v:modelInfo.architecture},{l:"Size",v:`${modelInfo.size_mb} MB`},{l:"Input Shape",v:modelInfo.input_shape?.join(" × ")},{l:"Last Modified",v:fmt(modelInfo.last_modified)}].map(r=><div key={r.l} className="flex justify-between py-3 border-b border-gray-100 last:border-0"><span className="text-xs font-bold uppercase tracking-widest text-gray-400">{r.l}</span><span className="text-sm font-bold text-gray-900">{r.v}</span></div>)}</Panel>
                  <Panel className="p-7 space-y-4"><div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">Classes</div><div className="flex flex-wrap gap-2">{modelInfo.classes?.map(c=>classBadge(c))}</div></Panel>
                </div>}
              </div>
            )}

            {/* ── PASSWORDS ── */}
            {tab==="passwords"&&(
              <div className="space-y-6 fade-slide-up">
                <Heading title="Password Management" sub="Set passwords for approved users"/>
                <Table heads={["User","Email","Status","Last Action","Actions"]} empty={apiUsers.filter(u=>u.status==="approved").length===0?"No approved users yet":undefined}>
                  {apiUsers.filter(u=>u.status==="approved").map(u=>{
                    const last=pwLogs.filter(l=>l.entity_id===u.id).sort((a,b)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime())[0];
                    return<TR key={u.id}><td className="px-5 py-3.5"><span className="text-sm font-bold text-gray-900">{u.full_name}</span></td><TD mono>{u.email}</TD><td className="px-5 py-3.5"><Badge label="Approved" color="green"/></td><TD mono>{last?`${last.action==="admin_generate_password"?"🔑 Generated":"✏️ Set"} · ${fmt(last.timestamp)}`:"—"}</TD><td className="px-5 py-3.5"><button onClick={()=>setPwUser(u)} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors">🔑 Manage</button></td></TR>;
                  })}
                </Table>
                <Panel className="p-6">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-4">Activity Log</div>
                  {pwLogs.length===0?<div className="text-sm text-gray-400 text-center py-6">No activity yet</div>:(
                    <Table heads={["Action","Target","Done By","When"]}>
                      {pwLogs.map(l=>{const target=apiUsers.find(u=>u.id===l.entity_id);return<TR key={l.id}><td className="px-5 py-3.5">{l.action==="admin_generate_password"?<Badge label="🔑 Auto-generated" color="purple"/>:<Badge label="✏️ Manual" color="blue"/>}</td><TD>{target?.full_name??"—"}</TD><TD>{apiUsers.find(u=>u.id===l.user_id)?.full_name??"Admin"}</TD><TD mono>{fmt(l.timestamp)}</TD></TR>;})}
                    </Table>
                  )}
                </Panel>
              </div>
            )}

            {/* ── AUDIT ── */}
            {tab==="audit"&&(
              <div className="space-y-5 fade-slide-up">
                <Heading title="Audit Log" sub={`Last ${auditLogs.length} events`}/>
                <Table heads={["#","User","Action","Entity","Entity ID","Timestamp"]} empty={auditLogs.length===0?"No audit logs yet":undefined}>
                  {auditLogs.map(l=>(
                    <TR key={l.id}>
                      <TD mono>#{l.id}</TD>
                      <TD>{apiUsers.find(u=>u.id===l.user_id)?.full_name??`User ${l.user_id}`}</TD>
                      <td className="px-5 py-3.5">{l.action.includes("password")?<Badge label={l.action} color="purple"/>:l.action.includes("predict")?<Badge label={l.action} color="blue"/>:l.action.includes("approve")?<Badge label={l.action} color="green"/>:l.action.includes("delete")?<Badge label={l.action} color="red"/>:<Badge label={l.action} color="gray"/>}</td>
                      <TD mono>{l.entity||"—"}</TD><TD mono>{l.entity_id??"—"}</TD><TD mono>{fmt(l.timestamp)}</TD>
                    </TR>
                  ))}
                </Table>
              </div>
            )}

          </main>
        </div>
      </div>
    </>
  );
}