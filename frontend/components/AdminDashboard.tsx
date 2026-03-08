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
  if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(e.detail || `API ${res.status}`); }
  return res.json();
}

interface ApiUser { id:number; email:string; full_name:string; hospital?:string; license_number?:string; role:string; status:string; created_at:string; firebase_uid?:string; }
interface Diagnosis { id:number; patient_id:number; radiologist_id?:number; ai_classification:string; confidence_score:number; tb_probability:number; pneumonia_probability:number; normal_probability:number; unknown_probability?:number; radiologist_verified:boolean; created_at:string; }
interface Patient { id:number; name:string; patient_ref_id?:string; age?:number; sex?:string; hospital?:string; clinical_notes?:string; radiologist_id?:number; created_at:string; }
interface Stats { total_radiologists:number; pending_requests:number; total_patients:number; total_diagnoses:number; model_status:string; uptime_seconds:number; }
interface ModelInfo { status:string; path:string; size_mb:number; last_modified:string; classes:string[]; architecture:string; input_shape:number[]; }
interface AuditLog { id:number; user_id:number; action:string; entity?:string; entity_id?:number; timestamp:string; }
interface RetrainJob { id:number; status:string; created_at:string; error_message?:string; final_val_acc?:number; }
interface PredictionResult { classification:string; confidence_score:number; tb_probability:number; pneumonia_probability:number; normal_probability:number; unknown_probability?:number; explanation?:string; gradcam_b64?:string; }
interface EditPatient { id:number; name:string; patient_ref_id:string; hospital:string; clinical_notes:string; }
type Tab = "overview"|"users"|"passwords"|"predictions"|"patients"|"diagnose"|"retrain"|"model"|"audit";

const fmt = (iso:string) => new Date(iso).toLocaleString("en-RW",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const uptimeFmt = (s:number) => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return `${h}h ${m}m`; };
const validateRwandaId = (id:string) => /^\d{16}$/.test(id.replace(/\s/g,""));
function parseDuplicateError(msg:string):{type:"NATIONAL_ID"|"NAME"|null;existingId:number|null;message:string}{
  if(msg.startsWith("DUPLICATE_NATIONAL_ID|")){const p=msg.split("|");return{type:"NATIONAL_ID",existingId:parseInt(p[1])||null,message:p[2]||msg};}
  if(msg.startsWith("DUPLICATE_NAME|")){const p=msg.split("|");return{type:"NAME",existingId:parseInt(p[1])||null,message:p[2]||msg};}
  return{type:null,existingId:null,message:msg};
}

// ═══════════════════════════════════════════════════
// DESIGN TOKENS — Rich, saturated, fully visible
// ═══════════════════════════════════════════════════

// Sidebar
const SB = "#162920";          // very dark forest green
const SB_HOVER = "#1E3B2D";
const SB_ACTIVE = "#22543D";   // still dark but clearly green

// Main canvas: pure white with light gray bg
const CANVAS = "#F7F8FA";

// ─── STAT CARD COLORS (solid fills, no opacity tricks) ───────
// Each card: bg color, text color, icon color, shadow
const CARDS = [
  { bg:"#16A34A", text:"#FFFFFF", sub:"rgba(255,255,255,0.75)", icon:"#BBFBCE", shadow:"0 12px 32px rgba(22,163,74,0.38)",  label:"Radiologists", emoji:"👨‍⚕️" },
  { bg:"#EA580C", text:"#FFFFFF", sub:"rgba(255,255,255,0.75)", icon:"#FECDB0", shadow:"0 12px 32px rgba(234,88,12,0.38)",  label:"Pending",       emoji:"⏳" },
  { bg:"#2563EB", text:"#FFFFFF", sub:"rgba(255,255,255,0.75)", icon:"#BFD4FF", shadow:"0 12px 32px rgba(37,99,235,0.38)",  label:"Patients",      emoji:"👥" },
  { bg:"#7C3AED", text:"#FFFFFF", sub:"rgba(255,255,255,0.75)", icon:"#DDD6FE", shadow:"0 12px 32px rgba(124,58,237,0.38)", label:"Diagnoses",     emoji:"🔬" },
];

// ─── DIAGNOSIS CLASS COLORS ──────────────────────────────────
// Visible background tints — saturated enough to read
const CLS: Record<string,{bg:string;border:string;text:string;bar:string;badge_bg:string;badge_text:string}> = {
  "Normal":       { bg:"#DCFCE7", border:"#86EFAC", text:"#14532D", bar:"#16A34A", badge_bg:"#16A34A", badge_text:"#fff" },
  "Tuberculosis": { bg:"#FEE2E2", border:"#FCA5A5", text:"#7F1D1D", bar:"#DC2626", badge_bg:"#DC2626", badge_text:"#fff" },
  "Pneumonia":    { bg:"#FEF3C7", border:"#FCD34D", text:"#78350F", bar:"#D97706", badge_bg:"#D97706", badge_text:"#fff" },
  "Unknown":      { bg:"#F1F5F9", border:"#CBD5E1", text:"#334155", bar:"#64748B", badge_bg:"#64748B", badge_text:"#fff" },
};

const BRAND = "#16A34A";

const INP = "w-full px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-500/10 transition-all";

// ═══════════════════════════════════════════════════
// GLOBAL CSS
// ═══════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');

* { box-sizing: border-box; }

@keyframes slideUp   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
@keyframes popIn     { from{opacity:0;transform:scale(0.94)} to{opacity:1;transform:scale(1)} }
@keyframes floatY    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
@keyframes barFill   { from{width:0} to{width:var(--target)} }
@keyframes spinRing  { to{transform:rotate(360deg)} }
@keyframes pulseDot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.5)} }
@keyframes shimmerMove {
  0%{background-position:-600px 0}
  100%{background-position:600px 0}
}

/* Page entry animation */
.anim-in    { animation:slideUp .38s cubic-bezier(.22,1,.36,1) both; }
.anim-in-1  { animation-delay:.04s }
.anim-in-2  { animation-delay:.08s }
.anim-in-3  { animation-delay:.12s }
.anim-in-4  { animation-delay:.17s }
.anim-pop   { animation:popIn .32s cubic-bezier(.22,1,.36,1) both; }
.float-anim { animation:floatY 3.2s ease-in-out infinite; }
.pulse-anim { animation:pulseDot 1.8s ease-in-out infinite; }

/* Stat card: shimmer sweep on hover */
.stat-card {
  position: relative;
  overflow: hidden;
  transition: transform .2s ease, box-shadow .2s ease;
}
.stat-card::after {
  content:'';
  position:absolute; top:0; left:-100%; width:60%; height:100%;
  background:linear-gradient(105deg, transparent, rgba(255,255,255,0.18), transparent);
  transition: left .55s ease;
}
.stat-card:hover { transform: translateY(-5px); }
.stat-card:hover::after { left:150%; }

/* Card hover lift */
.card-hover {
  transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
}
.card-hover:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 28px rgba(0,0,0,0.09);
  border-color: #86EFAC;
}

/* Sidebar nav item */
.nav-item {
  transition: background .14s ease, color .14s ease, transform .14s ease;
}
.nav-item:hover { transform: translateX(3px); }

/* Buttons */
.btn-solid {
  transition: transform .14s ease, box-shadow .14s ease, filter .14s ease;
}
.btn-solid:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.08);
}
.btn-solid:active:not(:disabled) { transform: scale(0.98); }

/* Animated bar */
.bar-fill {
  animation: barFill .85s cubic-bezier(.22,1,.36,1) both;
}

/* Table row */
.trow { transition: background .12s ease; }
.trow:hover { background: #F0FDF4; }

/* Focus ring on inputs */
input:focus, textarea:focus, select:focus { outline: none; }
`;

// ═══════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════
const ICONS: Record<Tab,React.ReactNode> = {
  overview:    <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  users:       <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>,
  predictions: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
  patients:    <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  diagnose:    <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  retrain:     <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></>,
  model:       <><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></>,
  passwords:   <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>,
  audit:       <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
};

// ═══════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════

function StatCard({ card, value, sub, delay }: { card: typeof CARDS[0]; value: string|number; sub?: string; delay: string }) {
  return (
    <div className={`stat-card anim-in ${delay} rounded-2xl p-6 flex flex-col gap-3`}
      style={{ background: card.bg, boxShadow: card.shadow, color: card.text }}>
      {/* Top row: icon circle + label */}
      <div className="flex items-center justify-between">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
          style={{ backgroundColor: "rgba(0,0,0,0.15)" }}>
          {card.emoji}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full"
          style={{ backgroundColor: "rgba(0,0,0,0.18)", color: card.text }}>
          {card.label}
        </span>
      </div>
      {/* Value */}
      <div>
        <div className="text-5xl font-black leading-none">{value}</div>
        {sub && <div className="text-sm font-medium mt-1.5" style={{ color: card.sub }}>{sub}</div>}
      </div>
      {/* Decorative circles */}
      <div className="absolute top-0 right-0 w-28 h-28 rounded-full" style={{ background:"rgba(255,255,255,0.06)", transform:"translate(30%,-30%)" }}/>
      <div className="absolute bottom-0 right-8 w-16 h-16 rounded-full" style={{ background:"rgba(255,255,255,0.05)", transform:"translateY(40%)" }}/>
    </div>
  );
}

function ClsBadge({ cls }: { cls: string }) {
  const c = CLS[cls] || CLS["Unknown"];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full"
      style={{ backgroundColor: c.badge_bg, color: c.badge_text }}>
      {cls}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string,[string,string]> = {
    approved:  ["#16A34A","#fff"], pending: ["#D97706","#fff"],
    rejected:  ["#DC2626","#fff"], verified: ["#2563EB","#fff"],
    Verified:  ["#2563EB","#fff"], Pending:  ["#94A3B8","#fff"],
    processing:["#2563EB","#fff"], completed:["#16A34A","#fff"],
    failed:    ["#DC2626","#fff"],
  };
  const [bg,text] = map[status] || ["#94A3B8","#fff"];
  return <span className="inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide" style={{ backgroundColor:bg, color:text }}>{status}</span>;
}

function RoleBadge({ role }: { role: string }) {
  return <span className="inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide" style={{ backgroundColor:"#EFF6FF", color:"#1D4ED8", border:"1px solid #BFDBFE" }}>{role}</span>;
}

function Panel({ children, className="" }: { children:React.ReactNode; className?:string }) {
  return <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>;
}

function PageHead({ title, sub, right }: { title:string; sub?:string; right?:React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-7">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{title}</h1>
        {sub && <p className="text-sm font-medium text-slate-400 mt-1">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2 shrink-0 mt-1">{right}</div>}
    </div>
  );
}

function ProgressBar({ pct, color }: { pct:number; color:string }) {
  return (
    <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: `${color}25` }}>
      <div className="bar-fill h-full rounded-full" style={{ "--target":`${pct}%`, width:`${pct}%`, backgroundColor: color } as any} />
    </div>
  );
}

function Tbl({ heads, children, empty }: { heads:string[]; children:React.ReactNode; empty?:string }) {
  return (
    <Panel>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-slate-100">
              {heads.map(h => <th key={h} className="text-left px-5 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-50/70">{h}</th>)}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
        {empty && <div className="px-5 py-14 text-center text-sm font-medium text-slate-400">{empty}</div>}
      </div>
    </Panel>
  );
}
function TR({ children }: { children:React.ReactNode }) { return <tr className="trow border-b border-slate-100 last:border-0">{children}</tr>; }
function TD({ children, mono }: { children:React.ReactNode; mono?:boolean }) {
  return <td className={`px-5 py-4 text-sm ${mono ? "font-mono text-xs text-slate-400" : "text-slate-700 font-medium"}`}>{children}</td>;
}

// ═══════════════════════════════════════════════════
// PASSWORD MODAL
// ═══════════════════════════════════════════════════
function PwModal({ user, onClose }: { user:ApiUser; onClose:()=>void }) {
  const [newPw,setNewPw]=useState(""); const [show,setShow]=useState(false);
  const [loading,setLoading]=useState(false); const [gen,setGen]=useState("");
  const [msg,setMsg]=useState(""); const [ok,setOk]=useState(true); const [copied,setCopied]=useState(false);
  const hasAuth = user.firebase_uid && !user.firebase_uid.startsWith("pending_");
  const generate = async () => {
    setLoading(true); setMsg(""); setGen("");
    try { const r=await adminFetch(`/users/${user.id}/generate-password`,{method:"POST"}); setGen(r.password); setMsg(`Done! Share password with ${r.email}`); setOk(true); }
    catch(e:any) { setMsg(e.message); setOk(false); } finally { setLoading(false); }
  };
  const setManual = async () => {
    if(newPw.length<6){setMsg("Min 6 chars");setOk(false);return;}
    setLoading(true); setMsg("");
    try { await adminFetch(`/users/${user.id}/set-password`,{method:"POST",body:JSON.stringify({password:newPw})}); setMsg("Updated!"); setOk(true); setNewPw(""); }
    catch(e:any) { setMsg(e.message); setOk(false); } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor:"rgba(0,0,0,0.5)", backdropFilter:"blur(6px)" }}>
      <div className="anim-pop w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header stripe */}
        <div className="px-7 pt-6 pb-5" style={{ background: CARDS[0].bg }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-white">Manage Password</h2>
              <p className="text-sm text-white/70 mt-0.5">{user.full_name} · {user.email}</p>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/20 text-white hover:bg-white/30 flex items-center justify-center font-bold transition-colors">✕</button>
          </div>
        </div>
        <div className="p-7 space-y-5">
          {!hasAuth && <div className="p-3.5 rounded-xl font-medium text-sm" style={{ backgroundColor:"#FEF3C7", color:"#92400E", border:"1px solid #FCD34D" }}>⚠ Approve user first.</div>}
          {/* Auto-generate */}
          <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor:"#F0FDF4", border:"1px solid #86EFAC" }}>
            <div className="text-[9px] font-black uppercase tracking-widest text-green-700">Auto-Generate</div>
            <button onClick={generate} disabled={loading||!hasAuth} className="btn-solid w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40" style={{ backgroundColor: CARDS[0].bg }}>
              {loading ? "Generating…" : "⚡ Generate & Set Password"}
            </button>
            {gen && (
              <div className="rounded-xl p-3.5 bg-white border border-green-200">
                <div className="text-[9px] font-black uppercase text-slate-400 mb-2">Copy & share with user</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-black font-mono px-3 py-2 rounded-lg" style={{ backgroundColor:"#DCFCE7", color:"#14532D" }}>{gen}</code>
                  <button onClick={() => { navigator.clipboard.writeText(gen); setCopied(true); setTimeout(()=>setCopied(false),2000); }}
                    className="btn-solid px-4 py-2 rounded-lg text-white text-xs font-bold" style={{ backgroundColor: BRAND }}>
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Manual */}
          <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor:"#EFF6FF", border:"1px solid #BFDBFE" }}>
            <div className="text-[9px] font-black uppercase tracking-widest text-blue-700">Set Custom Password</div>
            <div className="relative">
              <input type={show?"text":"password"} value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Min 6 characters" className={INP+" pr-16"}/>
              <button type="button" onClick={()=>setShow(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-200 text-slate-500">{show?"Hide":"Show"}</button>
            </div>
            <button onClick={setManual} disabled={loading||!hasAuth||!newPw} className="btn-solid w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40" style={{ backgroundColor: CARDS[2].bg }}>
              Set Password
            </button>
          </div>
          {msg && <div className={`p-3.5 rounded-xl text-sm font-semibold ${ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{msg}</div>}
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════
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
  const [expandedPt,setExpandedPt]=useState<number|null>(null);
  const [ptName,setPtName]=useState(""); const [ptNID,setPtNID]=useState(""); const [nidErr,setNidErr]=useState("");
  const [xFile,setXFile]=useState<File|null>(null); const [xPrev,setXPrev]=useState<string|null>(null);
  const [predicting,setPredicting]=useState(false); const [pred,setPred]=useState<PredictionResult|null>(null);
  const [savedDx,setSavedDx]=useState<Diagnosis|null>(null); const [savedPt,setSavedPt]=useState<Patient|null>(null);
  const [predErr,setPredErr]=useState(""); const [predInfo,setPredInfo]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);
  const [rtFiles,setRtFiles]=useState<File[]>([]); const [rtLabel,setRtLabel]=useState("Normal");
  const [uploading,setUploading]=useState(false); const [rtMsg,setRtMsg]=useState(""); const [rtOk,setRtOk]=useState(true);
  const [uploadedC,setUploadedC]=useState<Record<string,number>>({}); const [stagedC,setStagedC]=useState<Record<string,number>>({});
  const [rtDrag,setRtDrag]=useState(false); const rtRef=useRef<HTMLInputElement>(null);

  const loadAll=useCallback(async()=>{
    setError("");
    try {
      const [u,d,p,s,m,h,a,j]=await Promise.allSettled([adminFetch("/users"),adminFetch("/diagnoses"),adminFetch("/patients"),adminFetch("/stats"),adminFetch("/model/info"),adminFetch("/health"),adminFetch("/audit?limit=100"),adminFetch("/retrain/jobs")]);
      if(u.status==="fulfilled")setApiUsers(u.value); if(d.status==="fulfilled")setDiagnoses(d.value); if(p.status==="fulfilled")setPatients(p.value);
      if(s.status==="fulfilled")setStats(s.value); if(m.status==="fulfilled")setModelInfo(m.value); if(h.status==="fulfilled")setHealth(h.value);
      if(a.status==="fulfilled"){setAuditLogs(a.value);setPwLogs(a.value.filter((l:AuditLog)=>l.action.includes("password")||l.action.includes("Password")));}
      if(j.status==="fulfilled")setRetrainJobs(j.value);
      adminFetch("/retrain/staged").then(r=>setStagedC(r.counts)).catch(()=>{});
    } catch(e:any){setError(e.message);}
  },[]);

  useEffect(()=>{loadAll();},[loadAll]);
  useEffect(()=>{
    const active=retrainJobs.some(j=>j.status==="processing"||j.status==="pending");if(!active)return;
    const id=setInterval(async()=>{const jobs=await adminFetch("/retrain/jobs").catch(()=>null);if(jobs)setRetrainJobs(jobs);},5000);
    return()=>clearInterval(id);
  },[retrainJobs]);

  const approveUser=async(id:number)=>{await adminFetch(`/users/${id}/status`,{method:"PATCH",body:JSON.stringify({status:"approved"})});loadAll();};
  const rejectUser=async(id:number)=>{const r=prompt("Reason:")??"";await adminFetch(`/users/${id}/status`,{method:"PATCH",body:JSON.stringify({status:"rejected",rejection_reason:r})});loadAll();};
  const deleteUser=async(id:number,name:string)=>{if(!confirm(`Delete ${name}?`))return;try{await adminFetch(`/users/${id}`,{method:"DELETE"});loadAll();}catch(e:any){setError(e.message);}};
  const openEdit=(p:Patient)=>{setEditPatient({id:p.id,name:p.name,patient_ref_id:p.patient_ref_id||"",hospital:p.hospital||"",clinical_notes:p.clinical_notes||""});setEditError("");};
  const saveEdit=async()=>{
    if(!editPatient)return; if(!editPatient.name.trim()){setEditError("Name required");return;}
    if(editPatient.patient_ref_id&&!validateRwandaId(editPatient.patient_ref_id)){setEditError("National ID must be 16 digits");return;}
    setEditSaving(true);setEditError("");
    try{await adminFetch(`/patients/${editPatient.id}`,{method:"PATCH",body:JSON.stringify({name:editPatient.name,patient_ref_id:editPatient.patient_ref_id||null,hospital:editPatient.hospital||null,clinical_notes:editPatient.clinical_notes||null})});setEditPatient(null);loadAll();}
    catch(e:any){setEditError(e.message);}finally{setEditSaving(false);}
  };
  const deletePt=async(id:number,name:string)=>{if(!confirm(`Delete "${name}"?`))return;try{await adminFetch(`/patients/${id}`,{method:"DELETE"});loadAll();}catch(e:any){setError(e.message);}};
  const deleteDx=async(id:number)=>{if(!confirm("Delete?"))return;try{await adminFetch(`/diagnoses/${id}`,{method:"DELETE"});loadAll();}catch(e:any){setError(e.message);}};
  const handleNID=(v:string)=>{const d=v.replace(/\D/g,"").slice(0,16);setPtNID(d);setNidErr(d.length>0&&d.length<16?"Must be 16 digits":"");};
  const handleFile=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;setXFile(f);setXPrev(URL.createObjectURL(f));setPred(null);setSavedDx(null);setPredErr("");setPredInfo("");};

  const runPred=async()=>{
    if(!xFile||!ptName.trim()){setPredErr("Enter patient name and upload X-ray");return;}
    if(!validateRwandaId(ptNID)){setPredErr("Enter valid 16-digit Rwanda National ID");return;}
    setPredicting(true);setPredErr("");setPredInfo("");setPred(null);setSavedDx(null);setSavedPt(null);
    try{
      let patient:Patient|null=null;
      try{patient=await adminFetch("/patients",{method:"POST",body:JSON.stringify({name:ptName.trim(),patient_ref_id:ptNID})});setPatients(prev=>[patient!,...prev.filter(p=>p.id!==patient!.id)]);}
      catch(e:any){const{type,existingId}=parseDuplicateError(e.message);if((type==="NATIONAL_ID"||type==="NAME")&&existingId){const ex=patients.find(p=>p.id===existingId)??await adminFetch(`/patients/${existingId}`).catch(()=>null);if(ex){patient=ex;setPredInfo(`Using existing patient: ${ex.name}`);}else throw e;}else throw e;}
      if(!patient)throw new Error("Could not resolve patient");
      setSavedPt(patient);
      const fd=new FormData();fd.append("file",xFile);
      const{data:sd}=await supabase.auth.getSession();const token=sd.session?.access_token;
      const res=await fetch(`${API_BASE}/predict`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:fd});
      if(!res.ok){const e=await res.json();throw new Error(e.detail||"Prediction failed");}
      const result:PredictionResult=await res.json();setPred(result);
      const saved:Diagnosis=await adminFetch("/diagnoses",{method:"POST",body:JSON.stringify({patient_id:patient.id,xray_filename:xFile.name,ai_classification:result.classification,confidence_score:result.confidence_score,tb_probability:result.tb_probability,pneumonia_probability:result.pneumonia_probability,normal_probability:result.normal_probability,unknown_probability:result.unknown_probability??0,ai_explanation:result.explanation,heatmap_b64:result.gradcam_b64})});
      setSavedDx(saved);setDiagnoses(prev=>[saved,...prev]);loadAll().catch(()=>{});
    }catch(e:any){setPredErr(e.message);}finally{setPredicting(false);}
  };

  const uploadForRetrain=async()=>{
    if(!rtFiles.length){setRtMsg("Select files first");setRtOk(false);return;}
    setUploading(true);setRtMsg("");
    try{
      const fd=new FormData();rtFiles.forEach(f=>fd.append("files",f));
      const{data}=await supabase.auth.getSession();const token=data.session?.access_token;
      const res=await fetch(`${API_BASE}/retrain/upload?label=${encodeURIComponent(rtLabel)}`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:fd});
      if(!res.ok){const e=await res.json();throw new Error(e.detail);}
      const r=await res.json();setUploadedC(prev=>({...prev,[rtLabel]:(prev[rtLabel]||0)+r.files_saved}));setRtMsg(`Uploaded ${r.files_saved} file(s) as "${rtLabel}"`);setRtOk(true);setRtFiles([]);
      adminFetch("/retrain/staged").then(r=>setStagedC(r.counts)).catch(()=>{});
    }catch(e:any){setRtMsg(e.message);setRtOk(false);}finally{setUploading(false);}
  };

  const triggerRetrain=async()=>{
    if(!window.confirm("Start retraining?"))return;
    try{const job=await adminFetch("/retrain/trigger",{method:"POST"});setRtMsg(`Job #${job.id} started!`);setRtOk(true);setUploadedC({});setStagedC({});loadAll();}
    catch(e:any){setRtMsg(e.message);setRtOk(false);}
  };

  const pending=apiUsers.filter(u=>u.status==="pending").length;
  const navItems:[Tab,string,number?][] = [
    ["overview","Overview"],
    ["users","Users",apiUsers.filter(u=>u.status==="pending").length||undefined],
    ["predictions","Predictions",diagnoses.length||undefined],
    ["patients","Patients",patients.length||undefined],
    ["diagnose","Diagnose"],["retrain","Retrain AI"],["model","Model"],["passwords","Passwords"],["audit","Audit Log"],
  ];

  // Distribution helper
  const dist = Object.entries(CLS).map(([cls,c])=>({
    cls, c,
    count: diagnoses.filter(d=>d.ai_classification===cls).length,
    pct: diagnoses.length ? Math.round((diagnoses.filter(d=>d.ai_classification===cls).length/diagnoses.length)*100) : 0,
  }));

  return (
    <>
      <style>{CSS}</style>
      <div className="min-h-screen flex" style={{ fontFamily:"'DM Sans',system-ui,sans-serif", backgroundColor: CANVAS }}>

        {/* ── MODALS ── */}
        {pwUser && <PwModal user={pwUser} onClose={()=>setPwUser(null)}/>}

        {editPatient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor:"rgba(0,0,0,0.5)", backdropFilter:"blur(6px)" }}>
            <div className="anim-pop w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
              <div className="px-7 pt-6 pb-5" style={{ background: CARDS[2].bg }}>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black text-white">Edit Patient</h2>
                  <button onClick={()=>setEditPatient(null)} className="w-9 h-9 rounded-xl bg-white/20 text-white hover:bg-white/30 flex items-center justify-center font-bold">✕</button>
                </div>
              </div>
              <div className="p-7 space-y-4">
                {[{l:"Full Name *",k:"name",t:"text"},{l:"National ID (16 digits)",k:"patient_ref_id",t:"text",mono:true},{l:"Hospital",k:"hospital",t:"text"}].map(({l,k,t,mono})=>(
                  <div key={k}><label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{l}</label>
                    <input type={t} value={(editPatient as any)[k]} onChange={e=>setEditPatient({...editPatient,[k]:k==="patient_ref_id"?e.target.value.replace(/\D/g,"").slice(0,16):e.target.value})} className={`${INP}${mono?" font-mono":""}`}/>
                  </div>
                ))}
                <div><label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Clinical Notes</label><textarea value={editPatient.clinical_notes} onChange={e=>setEditPatient({...editPatient,clinical_notes:e.target.value})} className={INP+" h-20 resize-none"}/></div>
                {editError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">{editError}</div>}
                <div className="flex gap-3 pt-1">
                  <button onClick={()=>setEditPatient(null)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors">Cancel</button>
                  <button onClick={saveEdit} disabled={editSaving} className="btn-solid flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-40" style={{ backgroundColor: CARDS[0].bg }}>{editSaving?"Saving…":"Save Changes"}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════
            SIDEBAR
        ═══════════════════════════════════ */}
        <aside className={`${collapsed?"w-[68px]":"w-[230px]"} shrink-0 flex flex-col sticky top-0 h-screen transition-all duration-300`}
          style={{ backgroundColor: SB, boxShadow:"4px 0 24px rgba(0,0,0,0.18)" }}>

          {/* Logo — exactly matching landing page */}
          <div className="h-[65px] flex items-center px-4 gap-3" style={{ borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor:"#064E3B" }}>
              <div className="w-4 rounded-full" style={{ height:"1.5px", backgroundColor:"#6EE7B7" }}/>
            </div>
            {!collapsed && (
              <span className="text-[13px] font-bold text-white uppercase tracking-tight leading-tight">
                Ubuzima Connect
              </span>
            )}
          </div>

          {/* Live status */}
          {health && !collapsed && (
            <div className="mx-3 mt-3 px-3 py-2.5 rounded-xl flex items-center gap-2.5" style={{ backgroundColor:"rgba(255,255,255,0.06)" }}>
              <div className="relative shrink-0 w-2.5 h-2.5 flex items-center justify-center">
                <div className="pulse-anim w-2 h-2 rounded-full absolute" style={{ backgroundColor: health.status==="healthy"?"#4ADE80":"#F87171" }}/>
              </div>
              <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color:"rgba(255,255,255,.4)" }}>
                {health.status==="healthy" ? `Live · ${uptimeFmt(health.uptime_seconds)}` : "Offline"}
              </span>
            </div>
          )}

          {/* Nav */}
          <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
            {!collapsed && <p className="px-3 pb-1.5 pt-1 text-[8px] font-black uppercase tracking-widest" style={{ color:"rgba(255,255,255,.2)" }}>Navigation</p>}
            {navItems.map(([id,label,badge])=>{
              const active = tab===id;
              return (
                <button key={id} onClick={()=>{setTab(id);setSearch("");setExpandedPt(null);}}
                  title={collapsed?label:undefined}
                  className="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left relative"
                  style={{ backgroundColor: active ? SB_ACTIVE : "transparent", color: active?"#fff":"rgba(255,255,255,0.48)" }}>
                  {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full" style={{ width:3,height:22,backgroundColor:"#4ADE80" }}/>}
                  <svg className="shrink-0" style={{width:16,height:16}} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">{ICONS[id]}</svg>
                  {!collapsed && <span className="text-[11.5px] font-semibold flex-1 leading-tight">{label}</span>}
                  {badge!==undefined && badge>0 && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                      style={{ backgroundColor: active?"rgba(255,255,255,.2)":"#EA580C", color:"#fff" }}>{badge}</span>
                  )}
                  {collapsed && badge!==undefined && badge>0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{backgroundColor:"#EA580C"}}/>}
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="px-2 pb-3 space-y-0.5" style={{ borderTop:"1px solid rgba(255,255,255,.06)", paddingTop:"8px" }}>
            <button onClick={loadAll} className="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ color:"rgba(255,255,255,.35)" }}>
              <svg style={{width:15,height:15}} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15"/></svg>
              {!collapsed && <span className="text-[11px] font-semibold">Refresh</span>}
            </button>
            <button onClick={()=>supabase.auth.signOut()} className="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:text-red-300 transition-colors" style={{ color:"rgba(255,255,255,.35)" }}>
              <svg style={{width:15,height:15}} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              {!collapsed && <span className="text-[11px] font-semibold">Sign Out</span>}
            </button>
            <button onClick={()=>setCollapsed(s=>!s)} className="w-full flex items-center justify-center py-2 rounded-xl transition-colors" style={{ color:"rgba(255,255,255,.2)" }}>
              <svg style={{width:14,height:14}} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                {collapsed?<path d="M9 18l6-6-6-6"/>:<path d="M15 18l-6-6 6-6"/>}
              </svg>
            </button>
          </div>
        </aside>

        {/* ═══════════════════════════════════
            MAIN CONTENT
        ═══════════════════════════════════ */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">

          {/* Topbar */}
          <header className="h-[65px] flex items-center justify-between px-8 sticky top-0 z-20 bg-white"
            style={{ borderBottom:"1px solid #E2E8F0", boxShadow:"0 1px 12px rgba(0,0,0,0.05)" }}>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black text-slate-900 capitalize tracking-tight">{tab.replace("-"," ")}</h2>
              <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full text-white" style={{ backgroundColor: BRAND }}>
                Admin
              </span>
            </div>
            <div className="flex items-center gap-3">
              {error && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ backgroundColor:"#FEF2F2", border:"1px solid #FCA5A5", color:"#7F1D1D" }}>
                  ⚠ {error} <button onClick={()=>setError("")} className="text-red-400 ml-1">✕</button>
                </div>
              )}
              {pending>0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold" style={{ backgroundColor:"#FEF3C7", border:"1px solid #FCD34D", color:"#78350F" }}>
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor:"#EA580C" }}/> {pending} pending
                </div>
              )}
              <div className="text-xs font-semibold text-slate-400">
                {new Date().toLocaleDateString("en-RW",{weekday:"short",day:"2-digit",month:"short",year:"numeric"})}
              </div>
            </div>
          </header>

          {/* Page */}
          <main className="flex-1 p-8 overflow-y-auto" style={{ backgroundColor: CANVAS }}>

            {/* ══════════════════════════════
                OVERVIEW
            ══════════════════════════════ */}
            {tab==="overview" && (
              <div className="space-y-7">
                <PageHead title="System Overview" sub="Live platform status and diagnostics"/>

                {/* 4 vivid stat cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                  <StatCard card={CARDS[0]} value={stats?.total_radiologists??"—"} sub="Active clinicians"  delay="anim-in-1"/>
                  <StatCard card={CARDS[1]} value={stats?.pending_requests??0}      sub="Awaiting approval" delay="anim-in-2"/>
                  <StatCard card={CARDS[2]} value={patients.length}                 sub="Total registered"  delay="anim-in-3"/>
                  <StatCard card={CARDS[3]} value={diagnoses.length}                sub="AI scans complete" delay="anim-in-4"/>
                </div>

                {/* Diagnosis distribution — rich color tiles */}
                <Panel className="p-6 anim-in">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-5">Diagnosis Distribution</div>
                  <div className="grid grid-cols-4 gap-4">
                    {dist.map(({cls,c,count,pct})=>(
                      <div key={cls} className="card-hover rounded-2xl p-5 cursor-default" style={{ backgroundColor:c.bg, border:`2px solid ${c.border}` }}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color:c.text }}>{cls}</span>
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor:c.bar }}>
                            <span className="text-white text-xs font-black">
                              {cls==="Normal"?"✓":cls==="Tuberculosis"?"!":cls==="Pneumonia"?"◎":"?"}
                            </span>
                          </div>
                        </div>
                        <div className="text-4xl font-black mb-3" style={{ color:c.text }}>{count}</div>
                        <ProgressBar pct={pct} color={c.bar}/>
                        <div className="text-[10px] font-bold mt-2" style={{ color:c.text }}>{pct}% of all scans</div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <div className="grid lg:grid-cols-2 gap-5">
                  {/* Model status */}
                  <Panel className="p-6 anim-in">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-5">AI Model Status</div>
                    {modelInfo ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor:modelInfo.status==="loaded"?"#16A34A":"#94A3B8", boxShadow:modelInfo.status==="loaded"?"0 0 10px rgba(22,163,74,.7)":"none" }}/>
                          <span className="font-black text-slate-800 capitalize">{modelInfo.status}</span>
                          <span className="text-xs font-mono text-slate-400">{modelInfo.architecture}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl p-4" style={{ backgroundColor:CARDS[0].bg }}>
                            <div className="text-[9px] font-black uppercase text-white/70 mb-1">Model Size</div>
                            <div className="text-2xl font-black text-white">{modelInfo.size_mb}<span className="text-sm font-bold text-white/70 ml-1">MB</span></div>
                          </div>
                          <div className="rounded-xl p-4" style={{ backgroundColor:CARDS[2].bg }}>
                            <div className="text-[9px] font-black uppercase text-white/70 mb-1">Classes</div>
                            <div className="text-2xl font-black text-white">{modelInfo.classes?.length}<span className="text-sm font-bold text-white/70 ml-1">labels</span></div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">{modelInfo.classes?.map(c=><ClsBadge key={c} cls={c}/>)}</div>
                      </div>
                    ) : <div className="text-sm text-slate-400 font-medium">Loading…</div>}
                  </Panel>

                  {/* Recent predictions */}
                  <Panel className="p-6 anim-in">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">Recent Predictions</div>
                    <div className="space-y-2">
                      {diagnoses.slice(0,7).map(d=>{
                        const pt=patients.find(p=>p.id===d.patient_id);
                        const c=CLS[d.ai_classification]||CLS["Unknown"];
                        return (
                          <div key={d.id} className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ backgroundColor:c.bg, border:`1px solid ${c.border}` }}>
                            <div className="flex items-center gap-2.5">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:c.bar }}/>
                              <span className="text-sm font-bold text-slate-800">{pt?.name??"Unknown"}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <ClsBadge cls={d.ai_classification}/>
                              <div className="flex items-center gap-1.5">
                                <div className="w-12 h-2 rounded-full" style={{ backgroundColor:`${c.bar}30` }}>
                                  <div className="h-full rounded-full" style={{ width:`${d.confidence_score}%`, backgroundColor:c.bar }}/>
                                </div>
                                <span className="text-[10px] font-black" style={{ color:c.text }}>{d.confidence_score.toFixed(0)}%</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {diagnoses.length===0 && <div className="text-sm text-slate-400 text-center py-8 float-anim font-medium">No predictions yet</div>}
                    </div>
                  </Panel>
                </div>
              </div>
            )}

            {/* ══════════════════════════════
                USERS
            ══════════════════════════════ */}
            {tab==="users" && (
              <div className="space-y-5 anim-in">
                <PageHead title="User Management" sub={`${apiUsers.length} users registered`} right={
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search users…"
                    className="px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:border-green-500 w-52 shadow-sm"/>
                }/>
                <Tbl heads={["Name","Email","Hospital","License","Role","Status","Joined","Actions"]} empty={apiUsers.length===0?"No users yet":undefined}>
                  {apiUsers.filter(u=>!search||u.full_name.toLowerCase().includes(search.toLowerCase())||u.email.toLowerCase().includes(search.toLowerCase())).map(u=>(
                    <TR key={u.id}>
                      <td className="px-5 py-4"><span className="text-sm font-black text-slate-900">{u.full_name}</span></td>
                      <TD mono>{u.email}</TD><TD mono>{u.hospital||"—"}</TD><TD mono>{u.license_number||"—"}</TD>
                      <td className="px-5 py-4"><RoleBadge role={u.role}/></td>
                      <td className="px-5 py-4"><StatusBadge status={u.status}/></td>
                      <TD mono>{fmt(u.created_at)}</TD>
                      <td className="px-5 py-4">
                        <div className="flex gap-1.5 flex-wrap">
                          {u.status==="pending" && <>
                            <button onClick={()=>approveUser(u.id)} className="btn-solid text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{ backgroundColor: CARDS[0].bg }}>Approve</button>
                            <button onClick={()=>rejectUser(u.id)} className="btn-solid text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{ backgroundColor: CARDS[1].bg }}>Reject</button>
                          </>}
                          {u.status==="approved" && <button onClick={()=>setPwUser(u)} className="btn-solid text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{ backgroundColor: CARDS[3].bg }}>🔑 Password</button>}
                          <button onClick={()=>deleteUser(u.id,u.full_name)} className="btn-solid text-[10px] font-bold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-700 transition-colors">Delete</button>
                        </div>
                      </td>
                    </TR>
                  ))}
                </Tbl>
              </div>
            )}

            {/* ══════════════════════════════
                PREDICTIONS
            ══════════════════════════════ */}
            {tab==="predictions" && (
              <div className="space-y-5 anim-in">
                <PageHead title="All Predictions" sub={`${diagnoses.length} total diagnoses`} right={
                  <div className="flex gap-1.5">
                    {["All","Normal","Tuberculosis","Pneumonia","Unknown"].map(f=>(
                      <button key={f} onClick={()=>setSearch(f==="All"?"":f)}
                        className="btn-solid text-[10px] font-bold px-3 py-2 rounded-xl border-2 transition-all"
                        style={(f==="All"&&!search)||search===f
                          ? { backgroundColor: BRAND, color:"#fff", borderColor: BRAND }
                          : { backgroundColor:"white", color:"#94a3b8", borderColor:"#E2E8F0" }}>
                        {f}
                      </button>
                    ))}
                  </div>
                }/>
                {/* Distribution mini cards */}
                <div className="grid grid-cols-4 gap-4">
                  {dist.map(({cls,c,count,pct})=>(
                    <div key={cls} className="card-hover rounded-2xl p-5" style={{ backgroundColor:c.bg, border:`2px solid ${c.border}` }}>
                      <div className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color:c.text }}>{cls}</div>
                      <div className="text-3xl font-black mb-2" style={{ color:c.text }}>{count}</div>
                      <ProgressBar pct={pct} color={c.bar}/>
                      <div className="text-[10px] font-bold mt-1.5" style={{ color:c.text }}>{pct}%</div>
                    </div>
                  ))}
                </div>
                <Tbl heads={["Patient","National ID","Result","Confidence","TB%","Pneumo%","Normal%","Verified","Date","Action"]} empty={diagnoses.length===0?"No predictions yet":undefined}>
                  {diagnoses.filter(d=>!search||d.ai_classification===search).map(d=>{
                    const pt=patients.find(p=>p.id===d.patient_id);
                    return <TR key={d.id}>
                      <td className="px-5 py-4"><span className="text-sm font-black text-slate-900">{pt?.name??"Unknown"}</span></td>
                      <TD mono>{pt?.patient_ref_id??"—"}</TD>
                      <td className="px-5 py-4"><ClsBadge cls={d.ai_classification}/></td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width:`${d.confidence_score}%`, backgroundColor: BRAND }}/>
                          </div>
                          <span className="text-xs font-black text-slate-700">{d.confidence_score.toFixed(1)}%</span>
                        </div>
                      </td>
                      <TD mono>{(d.tb_probability*100).toFixed(1)}%</TD>
                      <TD mono>{(d.pneumonia_probability*100).toFixed(1)}%</TD>
                      <TD mono>{(d.normal_probability*100).toFixed(1)}%</TD>
                      <td className="px-5 py-4"><StatusBadge status={d.radiologist_verified?"Verified":"Pending"}/></td>
                      <TD mono>{fmt(d.created_at)}</TD>
                      <td className="px-5 py-4"><button onClick={()=>deleteDx(d.id)} className="btn-solid text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{ backgroundColor: CARDS[1].bg }}>Delete</button></td>
                    </TR>;
                  })}
                </Tbl>
              </div>
            )}

            {/* ══════════════════════════════
                PATIENTS
            ══════════════════════════════ */}
            {tab==="patients" && (
              <div className="space-y-4 anim-in">
                <PageHead title="Patients" sub={`${patients.length} registered`} right={
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or ID…"
                    className="px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:border-green-500 w-56 shadow-sm"/>
                }/>
                <div className="space-y-2">
                  {patients.filter(p=>!search||p.name.toLowerCase().includes(search.toLowerCase())||(p.patient_ref_id&&p.patient_ref_id.includes(search))).map(p=>{
                    const ptD=diagnoses.filter(d=>d.patient_id===p.id);
                    const isExp=expandedPt===p.id;
                    return (
                      <div key={p.id} className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden transition-all hover:border-green-300" style={{ boxShadow:"0 1px 6px rgba(0,0,0,0.05)" }}>
                        <div className="flex items-center gap-4 px-6 py-4">
                          <button onClick={()=>setExpandedPt(isExp?null:p.id)}
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black border-2 shrink-0 transition-all"
                            style={isExp?{backgroundColor:BRAND,color:"white",borderColor:BRAND}:{borderColor:"#E2E8F0",color:"#94A3B8"}}>
                            {isExp?"▾":"▸"}
                          </button>
                          <div className="flex-1 grid grid-cols-7 gap-3 items-center min-w-0">
                            {[
                              {l:"Name",    v:<span className="text-sm font-black text-slate-900 truncate">{p.name}</span>},
                              {l:"NID",     v:<span className="text-xs font-mono text-slate-400">{p.patient_ref_id||"—"}</span>},
                              {l:"Age",     v:<span className="text-xs font-medium text-slate-500">{p.age?`${p.age}y`:"—"}</span>},
                              {l:"Sex",     v:<span className="text-xs font-medium text-slate-500">{p.sex||"—"}</span>},
                              {l:"Hospital",v:<span className="text-xs font-medium text-slate-500 truncate">{p.hospital||"—"}</span>},
                              {l:"Scans",   v:ptD.length>0?<span className="inline-flex items-center text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{backgroundColor:CARDS[2].bg}}>{ptD.length} scan{ptD.length!==1?"s":""}</span>:<span className="text-[10px] font-bold text-slate-400">0 scans</span>},
                              {l:"Joined",  v:<span className="text-xs text-slate-400">{fmt(p.created_at)}</span>},
                            ].map(col=>(
                              <div key={col.l}>
                                <div className="text-[8px] font-black uppercase text-slate-300 mb-0.5">{col.l}</div>
                                {col.v}
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={()=>openEdit(p)} className="btn-solid text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{ backgroundColor: CARDS[2].bg }}>Edit</button>
                            <button onClick={()=>deletePt(p.id,p.name)} className="btn-solid text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{ backgroundColor: CARDS[1].bg }}>Delete</button>
                          </div>
                        </div>
                        {isExp && (
                          <div className="border-t-2 border-slate-100 px-6 py-5" style={{ backgroundColor:"#F8FAFC" }}>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Diagnoses for {p.name}</div>
                            {ptD.length===0 ? <div className="text-sm text-slate-400 font-medium">No diagnoses yet.</div> : (
                              <div className="space-y-2">{ptD.map(d=>{const c=CLS[d.ai_classification]||CLS["Unknown"];return(
                                <div key={d.id} className="flex items-center gap-5 p-4 rounded-2xl bg-white border-2" style={{ borderColor:c.border, borderLeftWidth:4, borderLeftColor:c.bar }}>
                                  <div className="flex-1 grid grid-cols-5 gap-3 items-center">
                                    <div><div className="text-[8px] font-black uppercase text-slate-300">Radiologist</div><div className="text-xs font-bold text-slate-700 mt-0.5">{apiUsers.find(u=>u.id===d.radiologist_id)?.full_name??"—"}</div></div>
                                    <div><div className="text-[8px] font-black uppercase text-slate-300">Result</div><div className="mt-1"><ClsBadge cls={d.ai_classification}/></div></div>
                                    <div><div className="text-[8px] font-black uppercase text-slate-300">Confidence</div><div className="text-sm font-black mt-0.5" style={{ color:c.text }}>{d.confidence_score.toFixed(1)}%</div></div>
                                    <div><div className="text-[8px] font-black uppercase text-slate-300">TB / Pneumo / Normal</div><div className="text-xs font-mono text-slate-400 mt-0.5">{(d.tb_probability*100).toFixed(0)}% / {(d.pneumonia_probability*100).toFixed(0)}% / {(d.normal_probability*100).toFixed(0)}%</div></div>
                                    <div><div className="text-[8px] font-black uppercase text-slate-300">Date</div><div className="text-[10px] text-slate-400 mt-0.5">{fmt(d.created_at)}</div></div>
                                  </div>
                                  <button onClick={()=>deleteDx(d.id)} className="btn-solid text-[10px] font-bold px-3 py-1.5 rounded-xl text-white shrink-0" style={{ backgroundColor: CARDS[1].bg }}>Delete</button>
                                </div>
                              );})}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {patients.length===0 && <Panel className="p-12 text-center"><span className="text-sm text-slate-400 font-medium">No patients yet</span></Panel>}
                </div>
              </div>
            )}

            {/* ══════════════════════════════
                DIAGNOSE
            ══════════════════════════════ */}
            {tab==="diagnose" && (
              <div className="space-y-6 anim-in">
                <PageHead title="Diagnostic Station" sub="Upload a chest X-ray for instant AI analysis"/>
                <div className="grid lg:grid-cols-2 gap-6">
                  <Panel className="p-7 space-y-5">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Patient Information</div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Full Name *</label>
                        <input value={ptName} onChange={e=>setPtName(e.target.value)} placeholder="Jean Uwimana" className={INP}/>
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Rwanda National ID * (16 digits)</label>
                        <input value={ptNID} onChange={e=>handleNID(e.target.value)} placeholder="1199080012345678" maxLength={16} inputMode="numeric"
                          className={`${INP} font-mono ${nidErr?"border-red-400":ptNID.length===16?"border-green-500":""}`}/>
                        <div className="flex justify-between mt-1.5">
                          {nidErr ? <span className="text-[10px] text-red-600 font-bold">{nidErr}</span>
                                  : ptNID.length===16 ? <span className="text-[10px] font-black text-green-600">✓ Valid ID</span>
                                  : <span className="text-[10px] text-slate-400">16 digits required</span>}
                          <span className="text-[10px] font-mono text-slate-400">{ptNID.length}/16</span>
                        </div>
                      </div>
                    </div>
                    {/* X-ray upload */}
                    <div onClick={()=>fileRef.current?.click()}
                      className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all"
                      style={{ borderColor:xPrev?"#16A34A":"#CBD5E1", backgroundColor:xPrev?"#F0FDF4":"#FAFAFA" }}>
                      {xPrev
                        ? <img src={xPrev} alt="X-ray" className="max-h-48 mx-auto rounded-xl object-contain"/>
                        : <div className="float-anim space-y-2">
                            <div className="text-4xl">🩻</div>
                            <div className="text-sm font-bold text-slate-500">Click to upload X-ray</div>
                            <div className="text-xs text-slate-400">JPG or PNG accepted</div>
                          </div>
                      }
                      <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={handleFile} className="hidden"/>
                    </div>
                    {predInfo && <div className="p-3.5 rounded-xl text-sm font-semibold" style={{ backgroundColor:"#EFF6FF", border:"1px solid #BFDBFE", color:"#1E3A8A" }}>{predInfo}</div>}
                    {predErr && <div className="p-3.5 rounded-xl text-sm font-semibold" style={{ backgroundColor:"#FEF2F2", border:"1px solid #FCA5A5", color:"#7F1D1D" }}>{predErr}</div>}
                    <button onClick={runPred} disabled={predicting||!xFile||!ptName.trim()||!validateRwandaId(ptNID)}
                      className="btn-solid w-full py-4 rounded-2xl text-white font-black text-sm disabled:opacity-40"
                      style={{ backgroundColor: BRAND, boxShadow: CARDS[0].shadow }}>
                      {predicting ? "Analyzing X-ray…" : "▶ Run AI Diagnosis"}
                    </button>
                  </Panel>

                  <Panel className="p-7">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-5">Diagnostic Result</div>
                    {!pred && !predicting && (
                      <div className="flex flex-col items-center justify-center h-64 gap-3">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-3xl text-slate-300 float-anim">◈</div>
                        <div className="text-sm font-black uppercase tracking-widest text-slate-300">Awaiting Scan</div>
                      </div>
                    )}
                    {predicting && (
                      <div className="flex flex-col items-center justify-center h-64 gap-5">
                        <div className="w-14 h-14 rounded-full border-4 border-slate-100 animate-spin" style={{ borderTopColor: BRAND }}/>
                        <div className="text-sm font-bold text-slate-400">Analyzing with ResNet-50…</div>
                      </div>
                    )}
                    {pred && (() => { const c=CLS[pred.classification]||CLS["Unknown"]; return (
                      <div className="space-y-5 anim-pop">
                        <div className="p-5 rounded-2xl text-center" style={{ backgroundColor:c.bg, border:`2px solid ${c.bar}` }}>
                          <div className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color:c.text }}>AI Classification</div>
                          <div className="text-5xl font-black" style={{ color:c.text }}>{pred.classification}</div>
                          <div className="text-sm font-bold mt-1.5" style={{ color:c.text, opacity:.7 }}>{pred.confidence_score.toFixed(1)}% confidence</div>
                        </div>
                        <div className="space-y-3">
                          {[{l:"Normal",v:pred.normal_probability,bar:CLS["Normal"].bar},{l:"Pneumonia",v:pred.pneumonia_probability,bar:CLS["Pneumonia"].bar},{l:"Tuberculosis",v:pred.tb_probability,bar:CLS["Tuberculosis"].bar}].map(r=>(
                            <div key={r.l}>
                              <div className="flex justify-between mb-1.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{r.l}</span>
                                <span className="text-sm font-black text-slate-700">{(r.v*100).toFixed(1)}%</span>
                              </div>
                              <ProgressBar pct={r.v*100} color={r.bar}/>
                            </div>
                          ))}
                        </div>
                        {savedDx && <div className="p-3.5 rounded-xl text-sm font-bold" style={{ backgroundColor:CLS["Normal"].bg, border:`1px solid ${CLS["Normal"].bar}`, color:CLS["Normal"].text }}>✅ Diagnosis #{savedDx.id} saved to patient record</div>}
                        <button onClick={()=>{setPred(null);setSavedDx(null);setSavedPt(null);setXFile(null);setXPrev(null);setPtName("");setPtNID("");setNidErr("");setPredErr("");setPredInfo("");}}
                          className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-colors">
                          New Scan
                        </button>
                      </div>
                    );})()}
                  </Panel>
                </div>
              </div>
            )}

            {/* ══════════════════════════════
                RETRAIN
            ══════════════════════════════ */}
            {tab==="retrain" && (
              <div className="space-y-6 anim-in">
                <PageHead title="Retrain AI Model" sub="Upload labelled X-rays — minimum 3 per class to trigger training"/>
                <div className="grid lg:grid-cols-2 gap-6">
                  <Panel className="p-7 space-y-5">
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Step 1 — Choose Label</div>
                      <div className="grid grid-cols-2 gap-2">
                        {(["Normal","Pneumonia","Tuberculosis","Unknown"] as const).map(l=>{
                          const active=rtLabel===l;
                          const clsColor={Normal:CARDS[0].bg,Tuberculosis:CLS["Tuberculosis"].bar,Pneumonia:CARDS[1].bg,Unknown:"#64748B"}[l];
                          return (
                            <button key={l} onClick={()=>{setRtLabel(l);setRtFiles([]);}}
                              className="btn-solid py-3.5 rounded-2xl text-sm font-black border-2 transition-all"
                              style={active
                                ? { backgroundColor:clsColor, color:"#fff", borderColor:clsColor, boxShadow:`0 6px 18px ${clsColor}55` }
                                : { backgroundColor:"white", borderColor:"#E2E8F0", color:"#94a3b8" }}>
                              {l}
                              {uploadedC[l] ? <span className="block text-[9px] font-normal opacity-70 mt-0.5">{uploadedC[l]} uploaded</span> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Step 2 — Upload for "{rtLabel}"</div>
                      <div onDragOver={e=>{e.preventDefault();setRtDrag(true);}} onDragLeave={()=>setRtDrag(false)}
                        onDrop={e=>{e.preventDefault();setRtDrag(false);setRtFiles(Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith("image/")));}}
                        onClick={()=>rtRef.current?.click()}
                        className="border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all"
                        style={{ borderColor:rtDrag?"#2563EB":rtFiles.length>0?"#2563EB":"#CBD5E1", backgroundColor:rtDrag||rtFiles.length>0?"#EFF6FF":"#FAFAFA" }}>
                        {rtFiles.length>0
                          ? <div><div className="text-xl font-black text-blue-700">{rtFiles.length} file{rtFiles.length!==1?"s":""} ready</div><div className="text-xs text-slate-400 font-medium mt-1">Click to change selection</div></div>
                          : <div className="float-anim"><div className="text-sm font-bold text-slate-500">Drop files or click to browse</div><div className="text-xs text-slate-400 mt-1">JPG, PNG — multiple allowed</div></div>
                        }
                        <input ref={rtRef} type="file" accept="image/*" multiple onChange={e=>setRtFiles(Array.from(e.target.files||[]))} className="hidden"/>
                      </div>
                    </div>
                    <button onClick={uploadForRetrain} disabled={uploading||!rtFiles.length}
                      className="btn-solid w-full py-4 rounded-2xl text-white font-black disabled:opacity-40 text-sm"
                      style={{ backgroundColor: CARDS[2].bg, boxShadow: CARDS[2].shadow }}>
                      {uploading ? "Uploading…" : rtFiles.length ? `Upload ${rtFiles.length} file(s) as "${rtLabel}"` : "Select files first"}
                    </button>
                    {/* Staged counts */}
                    {(()=>{
                      const all={...stagedC};const cls=Object.keys(all).filter(k=>all[k]>0);
                      const notReady=cls.filter(k=>all[k]<3);const canTrigger=cls.length>=2&&notReady.length===0;
                      return (
                        <>
                          <div className="rounded-2xl p-5 space-y-2" style={{ backgroundColor:"#F8FAFC", border:"2px solid #E2E8F0" }}>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Staged Images</div>
                            {["Normal","Pneumonia","Tuberculosis","Unknown"].map(l=>{
                              const n=all[l]||0; if(n===0) return <div key={l} className="flex justify-between"><span className="text-xs font-medium text-slate-400">{l}</span><span className="text-xs italic text-slate-300">Not uploaded</span></div>;
                              const ok=n>=3;
                              return <div key={l} className="flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-700">{l}</span>
                                <span className={`text-xs font-black ${ok?"text-green-600":"text-amber-600"}`}>{n} img{n!==1?"s":""} {ok?"✓":`— need ${3-n} more`}</span>
                              </div>;
                            })}
                            {cls.length===0 && <div className="text-xs italic text-slate-300">Nothing staged yet</div>}
                          </div>
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Step 3 — Start Training</div>
                            <button onClick={triggerRetrain} disabled={!canTrigger}
                              className="btn-solid w-full py-4 rounded-2xl text-white font-black disabled:opacity-40 text-sm"
                              style={{ backgroundColor: CARDS[3].bg, boxShadow: CARDS[3].shadow }}>
                              {canTrigger ? "⚡ Trigger Retraining" : notReady.length>0 ? `Need more images (${notReady.join(", ")})` : "Upload to 2+ classes first"}
                            </button>
                          </div>
                        </>
                      );
                    })()}
                    {rtMsg && <div className={`p-3.5 rounded-xl text-sm font-bold ${rtOk?"bg-green-50 text-green-800 border border-green-300":"bg-red-50 text-red-700 border border-red-300"}`}>{rtMsg}</div>}
                  </Panel>

                  <Panel className="p-7 space-y-4">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Retrain Jobs</div>
                    {retrainJobs.length===0 ? <div className="text-sm text-slate-400 font-medium text-center py-10 float-anim">No retrain jobs yet</div> : (
                      <div className="space-y-3">{retrainJobs.map(j=>{
                        const jc={completed:CLS["Normal"],processing:CLS["Unknown"],failed:CLS["Tuberculosis"],pending:CLS["Pneumonia"]}[j.status]||CLS["Unknown"];
                        return (
                          <div key={j.id} className="card-hover rounded-2xl p-5" style={{ backgroundColor:jc.bg, border:`2px solid ${jc.border}` }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-base font-black" style={{ color:jc.text }}>Job #{j.id}</span>
                              <StatusBadge status={j.status}/>
                            </div>
                            {j.final_val_acc && <div className="text-sm font-medium text-slate-600 mb-1">Accuracy: <span className="font-black text-green-600">{(j.final_val_acc*100).toFixed(1)}%</span></div>}
                            {j.error_message && <div className="mt-2 p-3 rounded-xl text-xs font-semibold" style={{ backgroundColor:CLS["Tuberculosis"].bg, color:CLS["Tuberculosis"].text }}>{j.error_message}</div>}
                            <div className="text-[9px] mt-2 font-semibold text-slate-400">{fmt(j.created_at)}</div>
                          </div>
                        );
                      })}</div>
                    )}
                  </Panel>
                </div>
              </div>
            )}

            {/* ══════════════════════════════
                MODEL
            ══════════════════════════════ */}
            {tab==="model" && (
              <div className="space-y-6 anim-in">
                <PageHead title="AI Model" sub="ResNet-50 production model details"/>
                {modelInfo && (
                  <div className="grid lg:grid-cols-2 gap-5">
                    <Panel className="p-7">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-5">Model Details</div>
                      <div className="space-y-1">
                        {[{l:"Status",v:modelInfo.status},{l:"Architecture",v:modelInfo.architecture},{l:"Size",v:`${modelInfo.size_mb} MB`},{l:"Input Shape",v:modelInfo.input_shape?.join(" × ")},{l:"Last Modified",v:fmt(modelInfo.last_modified)}].map(r=>(
                          <div key={r.l} className="flex justify-between py-3.5 border-b-2 border-slate-100 last:border-0">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{r.l}</span>
                            <span className="text-sm font-black text-slate-800">{r.v}</span>
                          </div>
                        ))}
                      </div>
                    </Panel>
                    <Panel className="p-7">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">Trained Classes</div>
                      <div className="flex flex-wrap gap-2">{modelInfo.classes?.map(c=><ClsBadge key={c} cls={c}/>)}</div>
                    </Panel>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════
                PASSWORDS
            ══════════════════════════════ */}
            {tab==="passwords" && (
              <div className="space-y-6 anim-in">
                <PageHead title="Password Management" sub="Set and manage passwords for approved users"/>
                <Tbl heads={["User","Email","Status","Last Action","Actions"]} empty={apiUsers.filter(u=>u.status==="approved").length===0?"No approved users yet":undefined}>
                  {apiUsers.filter(u=>u.status==="approved").map(u=>{
                    const last=pwLogs.filter(l=>l.entity_id===u.id).sort((a,b)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime())[0];
                    return <TR key={u.id}>
                      <td className="px-5 py-4"><span className="text-sm font-black text-slate-900">{u.full_name}</span></td>
                      <TD mono>{u.email}</TD>
                      <td className="px-5 py-4"><StatusBadge status="approved"/></td>
                      <TD mono>{last?`${last.action==="admin_generate_password"?"🔑 Generated":"✏️ Manual"} · ${fmt(last.timestamp)}`:"—"}</TD>
                      <td className="px-5 py-4"><button onClick={()=>setPwUser(u)} className="btn-solid text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{ backgroundColor: CARDS[3].bg }}>🔑 Manage</button></td>
                    </TR>;
                  })}
                </Tbl>
                <Panel className="p-6">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">Password Activity</div>
                  {pwLogs.length===0 ? <div className="text-sm text-slate-400 font-medium text-center py-6">No activity yet</div> : (
                    <Tbl heads={["Action","Target","Admin","When"]}>
                      {pwLogs.map(l=>{const target=apiUsers.find(u=>u.id===l.entity_id); return(
                        <TR key={l.id}>
                          <td className="px-5 py-4">{l.action==="admin_generate_password"
                            ? <span className="inline-flex items-center text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{ backgroundColor:CARDS[3].bg }}>🔑 Auto</span>
                            : <span className="inline-flex items-center text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{ backgroundColor:CARDS[2].bg }}>✏️ Manual</span>}
                          </td>
                          <TD>{target?.full_name??"—"}</TD>
                          <TD>{apiUsers.find(u=>u.id===l.user_id)?.full_name??"Admin"}</TD>
                          <TD mono>{fmt(l.timestamp)}</TD>
                        </TR>
                      );})}
                    </Tbl>
                  )}
                </Panel>
              </div>
            )}

            {/* ══════════════════════════════
                AUDIT
            ══════════════════════════════ */}
            {tab==="audit" && (
              <div className="space-y-5 anim-in">
                <PageHead title="Audit Log" sub={`Last ${auditLogs.length} system events`}/>
                <Tbl heads={["#","User","Action","Entity","ID","Timestamp"]} empty={auditLogs.length===0?"No audit logs yet":undefined}>
                  {auditLogs.map(l=>(
                    <TR key={l.id}>
                      <TD mono>#{l.id}</TD>
                      <TD>{apiUsers.find(u=>u.id===l.user_id)?.full_name??`User ${l.user_id}`}</TD>
                      <td className="px-5 py-4">{
                        l.action.includes("password") ? <span className="inline-flex text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{ backgroundColor:CARDS[3].bg }}>{l.action}</span>
                        : l.action.includes("predict") ? <span className="inline-flex text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{ backgroundColor:CARDS[2].bg }}>{l.action}</span>
                        : l.action.includes("approve") ? <span className="inline-flex text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{ backgroundColor:CARDS[0].bg }}>{l.action}</span>
                        : l.action.includes("delete") ? <span className="inline-flex text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{ backgroundColor:CARDS[1].bg }}>{l.action}</span>
                        : <span className="inline-flex text-[10px] font-black px-2.5 py-1 rounded-full bg-slate-200 text-slate-600">{l.action}</span>
                      }</td>
                      <TD mono>{l.entity||"—"}</TD>
                      <TD mono>{l.entity_id??"—"}</TD>
                      <TD mono>{fmt(l.timestamp)}</TD>
                    </TR>
                  ))}
                </Tbl>
              </div>
            )}

          </main>
        </div>
      </div>
    </>
  );
}