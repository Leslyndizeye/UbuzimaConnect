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

interface ApiUser { id:number; email:string; full_name:string; hospital?:string; hospital_id?:number; is_admin?:boolean; license_number?:string; role:string; status:string; created_at:string; firebase_uid?:string; }
interface HospitalOption { id:number; name:string; }
interface Diagnosis { id:number; patient_id:number; radiologist_id?:number; ai_classification:string; confidence_score:number; tb_probability:number; pneumonia_probability:number; normal_probability:number; unknown_probability?:number; radiologist_verified:boolean; created_at:string; }
interface Patient { id:number; name:string; patient_ref_id?:string; age?:number; sex?:string; hospital?:string; clinical_notes?:string; radiologist_id?:number; created_at:string; }
interface Stats { total_radiologists:number; pending_requests:number; total_patients:number; total_diagnoses:number; model_status:string; uptime_seconds:number; }
interface ModelInfo { status:string; path:string; size_mb:number; last_modified:string; classes:string[]; architecture:string; input_shape:number[]; }
interface AuditLog { id:number; user_id:number; action:string; entity?:string; entity_id?:number; detail?:Record<string,any>; timestamp:string; }
interface RetrainJob { id:number; status:string; created_at:string; error_message?:string; final_val_acc?:number; }
interface PredictionResult { classification:string; confidence_score:number; tb_probability:number; pneumonia_probability:number; normal_probability:number; unknown_probability?:number; explanation?:string; gradcam_b64?:string; xray_storage_path?:string; }
interface EditPatient { id:number; name:string; patient_ref_id:string; hospital:string; clinical_notes:string; }
type Tab = "overview"|"users"|"passwords"|"predictions"|"patients"|"diagnose"|"retrain"|"model"|"audit"|"profile";

const fmt = (iso:string) => new Date(iso).toLocaleString("en-RW",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Africa/Kigali"});
const uptimeFmt = (s:number) => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60); return `${h.toString().padStart(2,'0')}h ${m.toString().padStart(2,'0')}m ${sec.toString().padStart(2,'0')}s`; };
function useRwandaTime() {
  const [time,setTime]=useState(()=>new Date().toLocaleTimeString("en-RW",{timeZone:"Africa/Kigali",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}));
  useEffect(()=>{const id=setInterval(()=>setTime(new Date().toLocaleTimeString("en-RW",{timeZone:"Africa/Kigali",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})),1000);return()=>clearInterval(id);},[]);
  return time;
}
const validateRwandaId = (id:string) => /^\d{16}$/.test(id.replace(/\s/g,""));
const maskNationalId = (value?:string) => {
  if(!value) return "—";
  const id = value.replace(/\s/g,"");
  if(id.length < 6) return id;
  return `${id.slice(0,4)}••••••••••${id.slice(-2)}`;
};
function parseDuplicateError(msg:string):{type:"NATIONAL_ID"|"NAME"|null;existingId:number|null;message:string}{
  if(msg.startsWith("DUPLICATE_NATIONAL_ID|")){const p=msg.split("|");return{type:"NATIONAL_ID",existingId:parseInt(p[1])||null,message:p[2]||msg};}
  if(msg.startsWith("DUPLICATE_NAME|")){const p=msg.split("|");return{type:"NAME",existingId:parseInt(p[1])||null,message:p[2]||msg};}
  return{type:null,existingId:null,message:msg};
}
const prettyAuditAction=(action:string)=>{
  const map:Record<string,string>={
    approve_user:"Approved radiologist",
    rejected_user:"Rejected radiologist",
    reject_user:"Rejected radiologist",
    revoked_user:"Revoked radiologist access",
    revoke_user:"Revoked radiologist access",
    delete_patient:"Deleted patient",
    save_diagnosis:"Saved diagnosis",
    create_patient:"Registered patient",
    reuse_patient:"Updated existing patient",
    update_patient:"Updated patient details",
    send_chat_message:"Sent chat message",
    admin_generate_password:"Generated password",
    admin_set_password:"Set password",
    change_own_password:"Changed password",
    trigger_retrain:"Started retraining",
    upload_retrain_data:"Uploaded retraining images",
  };
  return map[action] || action.replace(/_/g," ");
};
const prettyAuditEntity=(entity?:string)=>{
  const map:Record<string,string>={patient:"Patient",diagnosis:"Diagnosis",user:"Radiologist",chat_message:"Chat message",xray_upload:"Training image"};
  return entity ? (map[entity] || entity) : "System";
};

// ─── Design Tokens ────────────────────────────────
const DARK_GREEN   = "#214D3B";
const VERY_DARK    = "#16352A";
const ACCENT_GREEN = "#4F8A73";
const BG_APP       = "#FFFFFF";
const BRAND        = "#A8D5BA";
const SOFT_RED     = "#C16A56";
const SOFT_GREY    = "#8092A3";

const CLS_META: Record<string,{bg:string;border:string;text:string;bar:string}> = {
  "Normal":       {bg:"#E6F4EC",border:"#B9D8C7",text:"#214D3B",bar:"#4F8A73"},
  "Tuberculosis": {bg:"#F7E7E3",border:"#E7BBB0",text:"#8D4A3A",bar:"#C16A56"},
  "Pneumonia":    {bg:"#EEF1F4",border:"#D7DEE5",text:"#4A5A68",bar:"#8092A3"},
  "Unknown":      {bg:"#EEF1F4",border:"#D7DEE5",text:"#4A5A68",bar:"#8092A3"},
};

// Retrain minimum images per class
const RT_MIN = 5;

const INP = "w-full px-5 py-3 rounded-full bg-slate-50 border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#86EFAC] focus:ring-4 focus:ring-[#86EFAC]/20 transition-all";
const INP_RECT = "w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#86EFAC] focus:ring-4 focus:ring-[#86EFAC]/20 transition-all";

// ─── Global CSS ───────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; font-family: 'Plus Jakarta Sans', sans-serif; }
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }

@keyframes slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
@keyframes popIn   { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
@keyframes floatY  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
@keyframes barIn   { from{width:0} to{width:var(--w)} }
@keyframes pdot    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.6)} }

.anim-in   { animation:slideUp .38s cubic-bezier(.22,1,.36,1) both; }
.anim-in-1 { animation-delay:.05s } .anim-in-2 { animation-delay:.10s }
.anim-in-3 { animation-delay:.15s } .anim-in-4 { animation-delay:.20s }
.anim-pop  { animation:popIn .3s cubic-bezier(.22,1,.36,1) both; }
.float-it  { animation:floatY 3s ease-in-out infinite; }
.pdot      { animation:pdot 1.8s ease-in-out infinite; }

.panel-card { background:#fff; border-radius:28px; border:1px solid #F1F5F9; box-shadow:0 4px 30px rgba(0,0,0,.03); }

.btn-s { transition:transform .15s ease,box-shadow .15s ease,filter .15s ease; }
.btn-s:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(1.06); }
.btn-s:active:not(:disabled) { transform:scale(.97); }

.nav-item { transition:all .15s ease; }
.nav-item:hover { background:#F8FAFC; }

.trow { transition:background .1s ease; }
.trow:hover { background:#F7FDF9; }

.bar-in { animation:barIn .85s cubic-bezier(.22,1,.36,1) both; }

@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
.skeleton {
  background: linear-gradient(90deg,#E8ECEF 25%,#F6F7F8 37%,#E8ECEF 63%);
  background-size: 400% 100%;
  animation: shimmer 1.25s ease infinite;
}

.wavy-bg {
  background: linear-gradient(135deg, ${VERY_DARK} 0%, #17422B 100%);
  position: relative;
}
.wavy-bg::before {
  content:''; position:absolute; inset:0;
  background:radial-gradient(circle at 50% 120%, rgba(255,255,255,.06) 0%, transparent 60%);
  pointer-events:none;
}

/* Retrain step ring */
.step-ring {
  width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  font-size:11px; font-weight:800; flex-shrink:0;
}
.step-ring.done  { background:#86EFAC; color:#14532D; }
.step-ring.active{ background:#1C5438; color:#fff; }
.step-ring.idle  { background:#F1F5F9; color:#94A3B8; border:2px solid #E2E8F0; }
`;

// ─── ICONS ────────────────────────────────────────
const ICONS: Record<Tab,React.ReactNode> = {
  overview:    <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  users:       <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>,
  predictions: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
  patients:    <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  diagnose:    <><rect x="2" y="3" width="20" height="14" rx="3"/><path d="M8 21h8M12 17v4"/></>,
  retrain:     <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></>,
  model:       <><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></>,
  passwords:   <><rect x="3" y="11" width="18" height="11" rx="3"/><path d="M7 11V7a5 5 0 0110 0v4"/></>,
  audit:       <><path d="M14 2H6a3 3 0 00-3 3v14a3 3 0 003 3h12a3 3 0 003-3V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  profile:     <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></>,
};

// ─── Shared UI ────────────────────────────────────
function Panel({children,className=""}:{children:React.ReactNode;className?:string}) {
  return <div className={`panel-card ${className}`}>{children}</div>;
}
function StatusBadge({status}:{status:string}) {
  const good = status==="approved"||status==="verified"||status==="completed"||status==="healthy"||status==="Verified"||status==="active";
  const pend = status==="pending"||status==="processing"||status==="Pending";
  const bg   = good?"#E6F4EC":pend?"#EEF1F4":"#F7E7E3";
  const tx   = good?DARK_GREEN:pend?"#4A5A68":"#8D4A3A";
  return <span className="inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-full capitalize" style={{backgroundColor:bg,color:tx}}>{status}</span>;
}
function ClsBadge({cls}:{cls:string}) {
  const c=CLS_META[cls]||CLS_META["Unknown"];
  return <span className="inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full text-white" style={{backgroundColor:c.bar}}>{cls}</span>;
}
function PageHead({title,sub,right}:{title:string;sub?:string;right?:React.ReactNode}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-7">
      <div><h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>{sub&&<p className="text-[13px] text-slate-500 mt-1">{sub}</p>}</div>
      {right&&<div className="flex items-center gap-3 shrink-0">{right}</div>}
    </div>
  );
}
function Tbl({heads,children,empty}:{heads:string[];children:React.ReactNode;empty?:string}) {
  return (
    <Panel className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-slate-100">{heads.map(h=><th key={h} className="text-left px-6 py-5 text-[11px] font-semibold text-slate-400">{h}</th>)}</tr></thead>
          <tbody>{children}</tbody>
        </table>
        {empty&&<div className="px-6 py-16 text-center text-sm font-medium text-slate-400">{empty}</div>}
      </div>
    </Panel>
  );
}
function TR({children}:{children:React.ReactNode}) { return <tr className="trow border-b border-slate-50 last:border-0">{children}</tr>; }
function TD({children,mono}:{children:React.ReactNode;mono?:boolean}) {
  return <td className={`px-6 py-4 text-[13px] ${mono?"font-mono text-slate-500":"text-slate-700 font-medium"}`}>{children}</td>;
}

// ─── Password Modal ────────────────────────────────
function PwModal({user,onClose}:{user:ApiUser;onClose:()=>void}) {
  const [pw,setPw]=useState(""); const [show,setShow]=useState(false);
  const [loading,setLoading]=useState(false); const [gen,setGen]=useState("");
  const [msg,setMsg]=useState(""); const [ok,setOk]=useState(true); const [copied,setCopied]=useState(false);
  const hasAuth=user.status==="approved";
  const generate=async()=>{setLoading(true);setMsg("");setGen("");try{const r=await adminFetch(`/users/${user.id}/generate-password`,{method:"POST"});setGen(r.password);setMsg(`Set for ${r.email}`);setOk(true);}catch(e:any){setMsg(e.message);setOk(false);}finally{setLoading(false);}};
  const setManual=async()=>{if(pw.length<8){setMsg("Min 8 chars");setOk(false);return;}setLoading(true);setMsg("");try{await adminFetch(`/users/${user.id}/set-password`,{method:"POST",body:JSON.stringify({password:pw})});setMsg("Updated!");setOk(true);setPw("");}catch(e:any){setMsg(e.message);setOk(false);}finally{setLoading(false);}};
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:"rgba(0,0,0,.45)",backdropFilter:"blur(6px)"}}>
      <div className="anim-pop w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden">
        <div className="px-8 pt-7 pb-6 text-white" style={{background:`linear-gradient(135deg,${DARK_GREEN},#267347)`}}>
          <div className="flex items-center justify-between">
            <div><h2 className="text-lg font-bold">Manage Password</h2><p className="text-sm text-white/70 mt-0.5">{user.full_name} · {user.email}</p></div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center font-bold">✕</button>
          </div>
        </div>
        <div className="p-8 space-y-5">
          {!hasAuth&&<div className="p-4 rounded-2xl text-sm font-medium" style={{background:"#EEF1F4",border:"1px solid #D7DEE5",color:"#4A5A68"}}>Approve user first before setting a password.</div>}
          <div className="p-5 rounded-3xl space-y-3" style={{background:"#F0FDF4",border:`1px solid ${BRAND}`}}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-green-700">Auto-Generate</p>
            <button onClick={generate} disabled={loading||!hasAuth} className="btn-s w-full py-3 rounded-full text-white text-sm font-bold disabled:opacity-40" style={{backgroundColor:DARK_GREEN}}>{loading?"Generating…":"⚡ Generate & Set Password"}</button>
            {gen&&<div className="rounded-2xl p-4 bg-white border border-green-200">
              <p className="text-[9px] font-bold uppercase text-slate-400 mb-2">Share with user</p>
              <div className="flex items-center gap-2"><code className="flex-1 text-sm font-bold font-mono px-3 py-2 rounded-xl" style={{background:"#E6F4EC",color:DARK_GREEN}}>{gen}</code><button onClick={()=>{navigator.clipboard.writeText(gen);setCopied(true);setTimeout(()=>setCopied(false),2000);}} className="btn-s px-4 py-2 rounded-full text-white text-xs font-bold" style={{backgroundColor:DARK_GREEN}}>{copied?"✓ Copied":"Copy"}</button></div>
            </div>}
          </div>
          <div className="p-5 rounded-3xl space-y-3" style={{background:"#EEF1F4",border:"1px solid #D7DEE5"}}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{color:SOFT_GREY}}>Set Custom Password</p>
            <div className="relative"><input type={show?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} placeholder="Min 8 characters" className={INP_RECT+" pr-16"}/><button type="button" onClick={()=>setShow(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-1 rounded-xl bg-slate-200 text-slate-500">{show?"Hide":"Show"}</button></div>
            <button onClick={setManual} disabled={loading||!hasAuth||!pw} className="btn-s w-full py-3 rounded-full text-white text-sm font-bold disabled:opacity-40" style={{backgroundColor:SOFT_GREY}}>Set Password</button>
          </div>
          {msg&&<div className="p-4 rounded-2xl text-sm font-semibold" style={ok?{background:"#E6F4EC",border:"1px solid #B9D8C7",color:DARK_GREEN}:{background:"#F7E7E3",border:"1px solid #E7BBB0",color:"#8D4A3A"}}>{msg}</div>}
          <button onClick={onClose} className="w-full py-3 rounded-full bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════
export default function AdminDashboard() {
  const rwandaTime = useRwandaTime();
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
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [pwUser,setPwUser]=useState<ApiUser|null>(null);
  const [editPatient,setEditPatient]=useState<EditPatient|null>(null);
  const [editError,setEditError]=useState(""); const [editSaving,setEditSaving]=useState(false);
  const [expandedPt,setExpandedPt]=useState<number|null>(null);
  // ── Current user identity ──
  const [me,setMe]=useState<ApiUser|null>(null);
  const meRef = useRef<ApiUser|null>(null); // avoids stale closure in loadAll
  const isHospitalAdmin = !!(me?.is_admin && me?.hospital_id);
  // ── Middle admin: logo upload ──
  const [logoUploading,setLogoUploading]=useState(false);
  const [logoMsg,setLogoMsg]=useState(""); const [logoOk,setLogoOk]=useState(true);
  const [logoPreview,setLogoPreview]=useState<string|null>(null);
  const logoRef=useRef<HTMLInputElement>(null);
  const [myHospital,setMyHospital]=useState<any>(null);
  // ── Middle admin: own password change ──
  const [myPwdModal,setMyPwdModal]=useState(false);
  const [myPwd,setMyPwd]=useState(""); const [myPwdLoading,setMyPwdLoading]=useState(false);
  const [myPwdMsg,setMyPwdMsg]=useState(""); const [myPwdOk,setMyPwdOk]=useState(true);
  // Hospital assignment for middle admin
  const [hospitals,setHospitals]=useState<HospitalOption[]>([]);
  const [assignUser,setAssignUser]=useState<ApiUser|null>(null);
  const [assignHospId,setAssignHospId]=useState<number|"">("");
  const [assignLoading,setAssignLoading]=useState(false);
  const [assignMsg,setAssignMsg]=useState("");

  // ── Diagnose state ──
  const [dxRadiologist,setDxRadiologist]=useState<number|"">("");
  const [dxRadSearch,setDxRadSearch]=useState("");
  const [selectedPtId,setSelectedPtId]=useState<number|"">("");
  const [ptSearch,setPtSearch]=useState("");
  const [xFile,setXFile]=useState<File|null>(null); const [xPrev,setXPrev]=useState<string|null>(null);
  const [predicting,setPredicting]=useState(false); const [pred,setPred]=useState<PredictionResult|null>(null);
  const [savedDx,setSavedDx]=useState<Diagnosis|null>(null); const [savedPt,setSavedPt]=useState<Patient|null>(null);
  const [predErr,setPredErr]=useState(""); const [predInfo,setPredInfo]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);

  // ── Retrain state ──
  // uploadedByLabel: files staged this session (local tracking)
  const [rtLabel,setRtLabel]=useState("Normal");
  const [rtFiles,setRtFiles]=useState<File[]>([]);
  const [uploading,setUploading]=useState(false);
  const [rtMsg,setRtMsg]=useState(""); const [rtOk,setRtOk]=useState(true);
  const [stagedC,setStagedC]=useState<Record<string,number>>({});
  const [rtDrag,setRtDrag]=useState(false); const rtRef=useRef<HTMLInputElement>(null);

  const loadAll=useCallback(async(currentMe?:ApiUser|null)=>{
    setError("");
    setLoading(true);
    const resolvedMe = currentMe !== undefined ? currentMe : meRef.current;
    if(!resolvedMe?.is_admin || !resolvedMe?.hospital_id){
      setApiUsers([]); setDiagnoses([]); setPatients([]); setAuditLogs([]); setPwLogs([]); setStagedC({});
      setMyHospital(null); setLogoPreview(null);
      setLoading(false);
      return;
    }
    try{
      const hid = resolvedMe.hospital_id;
      const [u,d,p,h,a] = await Promise.allSettled([
        adminFetch(`/hospitals/${hid}/radiologists`),
        adminFetch("/diagnoses"),
        adminFetch("/patients"),
        adminFetch("/health"),
        adminFetch("/audit?limit=100"),
      ]);
      if(u.status==="fulfilled")setApiUsers(u.value);
      if(d.status==="fulfilled")setDiagnoses(d.value);
      if(p.status==="fulfilled")setPatients(p.value);
      if(h.status==="fulfilled")setHealth(h.value);
      if(a.status==="fulfilled"){setAuditLogs(a.value);setPwLogs(a.value.filter((l:AuditLog)=>l.action.includes("password")||l.action.includes("Password")));}
      adminFetch("/retrain/staged").then(r=>setStagedC(r.counts||{})).catch(()=>{});
      adminFetch(`/hospitals/${hid}`).then(hosp=>{setMyHospital(hosp);if(hosp.logo_base64)setLogoPreview(hosp.logo_base64);}).catch(()=>{});
    }catch(e:any){setError(e.message);}
    finally{setLoading(false);}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // On mount: get session → fetch /me → load data scoped to role
  useEffect(()=>{
    (async()=>{
      await supabase.auth.getSession();
      try{
        const myData:ApiUser = await adminFetch("/auth/me");
        meRef.current = myData;
        setMe(myData);
        if(myData.is_admin && myData.hospital_id) loadAll(myData);
        else {setError("This dashboard is for hospital admins only. Use the hospital portal for super admin work."); setLoading(false);}
      }catch(e:any){setError(e.message||"Failed to load admin profile.");setLoading(false);}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{
    if(!isHospitalAdmin) return;
    const refresh=()=>loadAll();
    const id=setInterval(refresh,10000);
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    return()=>{clearInterval(id);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[isHospitalAdmin,loadAll]);
  useEffect(()=>{
    const active=retrainJobs.some(j=>j.status==="processing"||j.status==="pending"); if(!active)return;
    const id=setInterval(async()=>{const jobs=await adminFetch("/retrain/jobs").catch(()=>null);if(jobs)setRetrainJobs(jobs);},5000);
    return()=>clearInterval(id);
  },[retrainJobs]);

  const approveUser=async(id:number)=>{await adminFetch(`/users/${id}/status`,{method:"PATCH",body:JSON.stringify({status:"approved"})});loadAll();};
  const rejectUser=async(id:number)=>{const r=prompt("Reason:")??"";await adminFetch(`/users/${id}/status`,{method:"PATCH",body:JSON.stringify({status:"rejected",rejection_reason:r})});loadAll();};
  const revokeUser=async(id:number,name:string)=>{if(!confirm(`Revoke ${name}?`))return;try{await adminFetch(`/users/${id}/status`,{method:"PATCH",body:JSON.stringify({status:"revoked"})});loadAll();}catch(e:any){setError(e.message);}};
  const deleteUser=async(id:number,name:string)=>{if(!confirm(`Delete ${name}?`))return;try{await adminFetch(`/users/${id}`,{method:"DELETE"});loadAll();}catch(e:any){setError(e.message);}};
  const assignHospital=async()=>{
    if(!assignUser||!assignHospId){setAssignMsg("Select a hospital");return;}
    setAssignLoading(true);setAssignMsg("");
    try{
      await adminFetch(`/users/${assignUser.id}/assign-hospital`,{method:"PATCH",body:JSON.stringify({hospital_id:assignHospId,make_admin:true})});
      setAssignMsg("✅ Middle admin assigned!");
      setTimeout(()=>{setAssignUser(null);setAssignHospId("");setAssignMsg("");loadAll();},1500);
    }catch(e:any){setAssignMsg("Error: "+e.message);}
    finally{setAssignLoading(false);}
  };

  // ── Middle admin: upload logo ──
  const uploadLogo=async(file:File)=>{
    if(!me?.hospital_id)return;
    setLogoUploading(true);setLogoMsg("");
    try{
      const reader=new FileReader();
      reader.onload=async(ev)=>{
        const b64=ev.target?.result as string;
        setLogoPreview(b64);
        try{
          await adminFetch(`/hospitals/${me.hospital_id}/logo`,{method:"PATCH",body:JSON.stringify({logo_base64:b64})});
          setLogoMsg("✅ Logo updated!");setLogoOk(true);
        }catch(e:any){setLogoMsg("Error: "+e.message);setLogoOk(false);}
        finally{setLogoUploading(false);}
      };
      reader.readAsDataURL(file);
    }catch(e:any){setLogoMsg("Error: "+e.message);setLogoOk(false);setLogoUploading(false);}
  };

  // ── Middle admin: change own password ──
  const changeMyPassword=async()=>{
    if(myPwd.length<8){setMyPwdMsg("Min 8 characters");setMyPwdOk(false);return;}
    setMyPwdLoading(true);setMyPwdMsg("");
    try{
      await adminFetch("/me/password",{method:"PATCH",body:JSON.stringify({password:myPwd})});
      setMyPwdMsg("✅ Password changed! Signing out…");setMyPwdOk(true);
      setTimeout(()=>supabase.auth.signOut(),2000);
    }catch(e:any){setMyPwdMsg("Error: "+e.message);setMyPwdOk(false);}
    finally{setMyPwdLoading(false);}
  };

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
  const handleFile=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;setXFile(f);setXPrev(URL.createObjectURL(f));setPred(null);setSavedDx(null);setPredErr("");setPredInfo("");};

  // ── Diagnose: radiologist-first, then patient ──
  const radiologists = apiUsers.filter(u=>u.status==="approved"&&(u.role==="radiologist"||u.role==="user"));
  // patients belonging to the selected radiologist (or all if admin chose no filter)
  const filteredPatients = dxRadiologist
    ? patients.filter(p=>p.radiologist_id===dxRadiologist)
    : patients;

  const runPred=async()=>{
    if(!dxRadiologist){setPredErr("Please select a radiologist first");return;}
    if(!xFile){setPredErr("Please upload an X-ray image");return;}
    if(!selectedPtId){setPredErr("Please select a patient");return;}
    setPredicting(true);setPredErr("");setPredInfo("");setPred(null);setSavedDx(null);setSavedPt(null);
    try{
      const patient=patients.find(p=>p.id===selectedPtId);
      if(!patient)throw new Error("Patient not found");
      setSavedPt(patient);
      const fd=new FormData();fd.append("file",xFile);
      const{data:sd}=await supabase.auth.getSession();const token=sd.session?.access_token;
      const res=await fetch(`${API_BASE}/predict`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:fd});
      if(!res.ok){const e=await res.json();throw new Error(e.detail||"Prediction failed");}
      const result:PredictionResult=await res.json();setPred(result);
      const saved:Diagnosis=await adminFetch("/diagnoses",{method:"POST",body:JSON.stringify({patient_id:patient.id,xray_filename:xFile.name,xray_storage_path:result.xray_storage_path,ai_classification:result.classification==="Tuberculosis"?"TB":result.classification,confidence_score:result.confidence_score,tb_probability:result.tb_probability,pneumonia_probability:result.pneumonia_probability,normal_probability:result.normal_probability,unknown_probability:result.unknown_probability??0,ai_explanation:result.explanation,heatmap_b64:result.gradcam_b64})});
      setSavedDx(saved);setDiagnoses(prev=>[saved,...prev]);loadAll().catch(()=>{});
    }catch(e:any){setPredErr(e.message);}finally{setPredicting(false);}
  };

  // ── Retrain: upload for a single label ──
  const uploadForRetrain=async()=>{
    if(!rtFiles.length){setRtMsg("Select files first");setRtOk(false);return;}
    setUploading(true);setRtMsg("");
    try{
      const zipFiles=rtFiles.filter(f=>f.name.toLowerCase().endsWith(".zip"));
      if(zipFiles.length>1){setRtMsg("Select only one ZIP archive at a time.");setRtOk(false);setUploading(false);return;}
      const fd=new FormData();
      rtFiles.filter(f=>!f.name.toLowerCase().endsWith(".zip")).forEach(f=>fd.append("files",f));
      if(zipFiles[0]) fd.append("archive",zipFiles[0]);
      const{data}=await supabase.auth.getSession();const token=data.session?.access_token;
      const res=await fetch(`${API_BASE}/retrain/upload?label=${encodeURIComponent(rtLabel)}`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:fd});
      if(!res.ok){const e=await res.json();throw new Error(e.detail);}
      const r=await res.json();
      setRtMsg(`Uploaded ${r.files_saved} file(s) as "${rtLabel}"`);setRtOk(true);setRtFiles([]);
      adminFetch("/retrain/staged").then(r2=>setStagedC(r2.counts||{})).catch(()=>{});
    }catch(e:any){setRtMsg(e.message);setRtOk(false);}finally{setUploading(false);}
  };

  // ── Retrain: clear all staged images ──
  const [clearing,setClearing]=useState(false);
  const clearStaged=async()=>{
    if(!window.confirm("Clear ALL staged images? This cannot be undone."))return;
    setClearing(true);setRtMsg("");
    try{
      await adminFetch("/retrain/staged",{method:"DELETE"});
      setStagedC({});setRtMsg("All staged images cleared.");setRtOk(true);
    }catch(e:any){setRtMsg(e.message);setRtOk(false);}finally{setClearing(false);}
  };

  // ── Retrain: trigger — only needs 1 class with RT_MIN images ──
  const triggerRetrain=async()=>{
    const cls=Object.keys(stagedC).filter(k=>stagedC[k]>=RT_MIN);
    if(cls.length===0){setRtMsg(`Need at least ${RT_MIN} images in one class to start training`);setRtOk(false);return;}
    if(!window.confirm(`Start retraining with ${cls.length} class(es)? (${cls.join(", ")})`))return;
    try{const job=await adminFetch("/retrain/trigger",{method:"POST"});setRtMsg(`Job #${job.id} started!`);setRtOk(true);setStagedC({});loadAll();}
    catch(e:any){setRtMsg(e.message);setRtOk(false);}
  };

  // ── Filter data to hospital scope for middle admin ──
  const visibleUsers = apiUsers; // middle admin: already fetched from /hospitals/{id}/radiologists
  const visiblePatients = isHospitalAdmin
    ? patients.filter(p=>apiUsers.some(u=>u.id===p.radiologist_id))
    : patients;
  const visibleDiagnoses = isHospitalAdmin
    ? diagnoses.filter(d=>apiUsers.some(u=>u.id===d.radiologist_id))
    : diagnoses;

  const pending=visibleUsers.filter((u:ApiUser)=>u.status==="pending").length;
  const dist=["Normal","Tuberculosis","Pneumonia","Unknown"].map(cls=>({cls,count:visibleDiagnoses.filter((d:Diagnosis)=>d.ai_classification===cls).length,pct:visibleDiagnoses.length?Math.round((visibleDiagnoses.filter((d:Diagnosis)=>d.ai_classification===cls).length/visibleDiagnoses.length)*100):0,color:CLS_META[cls].bar}));

  // Retrain summary helpers
  const stagedClasses = Object.keys(stagedC).filter(k=>stagedC[k]>0);
  const readyClasses  = stagedClasses.filter(k=>stagedC[k]>=RT_MIN);
  const canTrigger    = readyClasses.length>=1;

  const navItems:[Tab,string,number?][]= [
    ["overview","Dashboard"],
    ["users","Radiologists",pending||undefined],
    ["patients","Patients"],
    ["retrain","Retrain AI"],
    ["audit","Audit Log"],
    ["profile","My Hospital"],
  ];
  const headerLogo = logoPreview || myHospital?.logo_base64 || null;
  const showInitialSkeleton = loading && !apiUsers.length && !patients.length && !diagnoses.length;

  if(me && !isHospitalAdmin){
    return (
      <>
        <style>{CSS}</style>
        <div className="min-h-screen flex items-center justify-center p-6" style={{backgroundColor:BG_APP}}>
          <Panel className="w-full max-w-xl p-10 text-center space-y-4">
            <div className="text-5xl">🏥</div>
            <h1 className="text-2xl font-bold text-slate-900">Hospital Admin Dashboard Only</h1>
            <p className="text-sm text-slate-500">This main platform admin page is reserved for hospital middle admins with a linked hospital account.</p>
            <p className="text-sm text-slate-500">Super admin work belongs in the hospital portal.</p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button onClick={()=>window.location.href="/"} className="btn-s px-5 py-3 rounded-full bg-slate-100 text-slate-700 font-bold">Back Home</button>
              <button onClick={()=>supabase.auth.signOut()} className="btn-s px-5 py-3 rounded-full text-white font-bold" style={{backgroundColor:DARK_GREEN}}>Sign Out</button>
            </div>
          </Panel>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="min-h-screen flex text-slate-800" style={{backgroundColor:BG_APP}}>

        {/* ── MODALS ── */}
        {pwUser&&<PwModal user={pwUser} onClose={()=>setPwUser(null)}/>}

        {editPatient&&(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:"rgba(0,0,0,.45)",backdropFilter:"blur(6px)"}}>
            <div className="anim-pop w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden">
              <div className="px-8 pt-7 pb-6 text-white" style={{background:`linear-gradient(135deg,${DARK_GREEN},${ACCENT_GREEN})`}}>
                <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Edit Patient</h2><button onClick={()=>setEditPatient(null)} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center font-bold">✕</button></div>
              </div>
              <div className="p-8 space-y-4">
                {[{l:"Full Name *",k:"name",t:"text"},{l:"National ID (16 digits)",k:"patient_ref_id",t:"text",mono:true},{l:"Hospital",k:"hospital",t:"text"}].map(({l,k,t,mono})=>(
                  <div key={k}><label className="block text-[11px] font-bold text-slate-500 mb-1.5 ml-1">{l}</label>
                    <input type={t} value={(editPatient as any)[k]} onChange={e=>setEditPatient({...editPatient,[k]:k==="patient_ref_id"?e.target.value.replace(/\D/g,"").slice(0,16):e.target.value})} className={INP+(mono?" font-mono":"")}/>
                  </div>
                ))}
                <div><label className="block text-[11px] font-bold text-slate-500 mb-1.5 ml-1">Clinical Notes</label><textarea value={editPatient.clinical_notes} onChange={e=>setEditPatient({...editPatient,clinical_notes:e.target.value})} className={INP_RECT+" h-20 resize-none"}/></div>
                {editError&&<div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">{editError}</div>}
                <div className="flex gap-3 pt-1">
                  <button onClick={()=>setEditPatient(null)} className="flex-1 py-3 rounded-full bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors">Cancel</button>
                  <button onClick={saveEdit} disabled={editSaving} className="btn-s flex-1 py-3 rounded-full text-white font-bold disabled:opacity-40" style={{backgroundColor:DARK_GREEN}}>{editSaving?"Saving…":"Save Changes"}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Assign Hospital Modal ── */}
        {assignUser&&(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:"rgba(0,0,0,.45)",backdropFilter:"blur(6px)"}}>
            <div className="anim-pop w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden">
              <div className="px-8 pt-7 pb-6 text-white" style={{background:"linear-gradient(135deg,#1C5438,#267347)"}}>
                <div className="flex items-center justify-between">
                  <div><h2 className="text-lg font-bold">Assign as Middle Admin</h2><p className="text-sm text-white/70 mt-0.5">{assignUser.full_name} · {assignUser.email}</p></div>
                  <button onClick={()=>{setAssignUser(null);setAssignMsg("");}} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center font-bold">✕</button>
                </div>
              </div>
              <div className="p-8 space-y-5">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm">
                  <strong>This will:</strong>
                  <ul className="mt-2 space-y-1 text-xs list-disc list-inside">
                    <li>Set this user as admin for the selected hospital</li>
                    <li>Link them to the hospital so their radiologists see the hospital branding</li>
                    <li>Allow them to upload the hospital logo from their Profile tab</li>
                  </ul>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Select Hospital</label>
                  <select value={assignHospId} onChange={e=>setAssignHospId(Number(e.target.value)||"")}
                    className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 text-sm outline-none focus:border-[#86EFAC]">
                    <option value="">Select an approved hospital…</option>
                    {hospitals.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                  {hospitals.length===0&&<p className="text-xs mt-1" style={{color:SOFT_RED}}>No approved hospitals yet. Approve a hospital application first.</p>}
                </div>
                {assignMsg&&<div className={`p-4 rounded-2xl text-sm font-semibold ${assignMsg.startsWith("✅")?"bg-green-50 border border-green-200 text-green-800":"bg-red-50 border border-red-200 text-red-700"}`}>{assignMsg}</div>}
                <div className="flex gap-3">
                  <button onClick={()=>{setAssignUser(null);setAssignMsg("");}} className="flex-1 py-3 rounded-full bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">Cancel</button>
                  <button onClick={assignHospital} disabled={assignLoading||!assignHospId} className="btn-s flex-1 py-3 rounded-full text-white font-bold disabled:opacity-40" style={{backgroundColor:"#1C5438"}}>
                    {assignLoading?"Assigning…":"Assign as Admin"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════ SIDEBAR ════════ */}
        <aside className="w-[260px] shrink-0 flex flex-col sticky top-4 h-[calc(100vh-2rem)] bg-white m-4 rounded-[32px] shadow-[0_4px_30px_rgba(0,0,0,0.04)] z-30">
          <div className="h-[88px] flex items-center px-7 gap-3">
            <div className="w-8 h-8 bg-emerald-900 rounded-md flex items-center justify-center relative overflow-hidden shrink-0">
              <div className="w-5 h-[2px] rounded-full bg-emerald-100"/>
            </div>
            <span className="text-[17px] font-bold tracking-tight text-slate-900">Ubuzima Connect</span>
          </div>
          <p className="px-7 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Menu</p>
          <nav className="flex-1 px-4 space-y-0.5 overflow-y-auto">
            {navItems.map(([id,label,badge])=>{
              const active=tab===id;
              return (
                <button key={id} onClick={()=>{setTab(id);setSearch("");setExpandedPt(null);}}
                  className={`nav-item w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left relative ${active?"bg-[#F0FDF4] text-[#166534]":"text-slate-500"}`}>
                  <svg className="shrink-0" style={{width:19,height:19}} fill="none" stroke="currentColor" strokeWidth={active?2:1.75} viewBox="0 0 24 24">{ICONS[id]}</svg>
                  <span className={`text-[13.5px] flex-1 ${active?"font-bold":"font-semibold"}`}>{label}</span>
                  {badge!==undefined&&badge>0&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-md min-w-[22px] text-center" style={{backgroundColor:active?"#166534":"#1C5438",color:"white"}}>{badge>99?"99+":badge}</span>}
                </button>
              );
            })}
          </nav>
          <button onClick={()=>supabase.auth.signOut()} className="mx-4 mb-4 flex items-center gap-3 px-5 py-3 rounded-2xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors text-[13px] font-semibold">
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            Sign Out
          </button>
        </aside>

        {/* ════════ MAIN ════════ */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-[90px] flex items-center justify-between px-10 sticky top-0 z-20 relative">
            {/* <div className="flex items-center gap-3 bg-white rounded-full px-5 py-3 border border-slate-100 shadow-sm w-[320px]">
              <svg width="16" height="16" fill="none" stroke="#A0AEC0" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
              <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patients, users…" className="bg-transparent border-none outline-none text-sm w-full placeholder:text-slate-400"/>
              {search&&<button onClick={()=>setSearch("")} className="text-slate-400 hover:text-slate-700">✕</button>}
            </div> */}
            <div className="flex items-center gap-4 absolute top-5 right-10 flex ">
              {error&&<div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-red-50 border border-red-200 text-red-700 max-w-xs truncate">⚠ {error}<button onClick={()=>setError("")} className="ml-1 shrink-0">✕</button></div>}
              {loading&&<div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-500"><span className="w-2 h-2 rounded-full pdot" style={{backgroundColor:ACCENT_GREEN}}/> Loading</div>}
              {pending>0&&<div className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold" style={{background:"#EEF1F4",border:"1px solid #D7DEE5",color:"#4A5A68"}}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{backgroundColor:SOFT_GREY}}/>{pending} pending
              </div>}
              <div className="flex items-center gap-3 bg-white rounded-[22px] px-2.5 py-2 pr-5 border border-slate-100 shadow-sm min-w-[250px]">
                <div className="w-11 h-11 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0">
                  {headerLogo
                    ? <img src={headerLogo} alt="Hospital logo" className="w-full h-full object-contain p-1.5"/>
                    : <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold" style={{backgroundColor:DARK_GREEN}}>{me?.full_name?.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()||"HA"}</div>}
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-slate-800 leading-tight">{myHospital?.name||"Hospital Admin"}</p>
                  <p className="text-[10px] text-slate-400 truncate">{me?.email||"—"}</p>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-10 pb-10 overflow-y-auto">

            {/* ══ OVERVIEW ══ */}
            {tab==="overview"&&(
              <div className="space-y-6 max-w-[1400px]">
                <div className="flex items-center justify-between">
                  <div><h1 className="text-3xl font-bold text-slate-900">Dashboard</h1><p className="text-slate-500 mt-1 text-sm">Ubuzima Connect — AI-powered chest X-ray diagnostics.</p></div>
                  <div className="flex gap-3">
                    <button onClick={loadAll} className="btn-s px-5 py-2.5 rounded-full text-slate-700 text-sm font-bold bg-white border border-slate-200">Refresh</button>
                  </div>
                </div>
                {showInitialSkeleton ? (
                  <>
                    <div className="grid grid-cols-4 gap-5">
                      {[0,1,2,3].map(i=>(
                        <div key={i} className="rounded-[28px] p-6 bg-white border border-slate-100 shadow-sm" style={{minHeight:160}}>
                          <div className="skeleton h-4 w-24 rounded-full mb-10"/>
                          <div className="skeleton h-12 w-20 rounded-2xl mb-4"/>
                          <div className="skeleton h-3 w-28 rounded-full"/>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-12 gap-5">
                      <div className="col-span-5 rounded-[28px] p-7 bg-white border border-slate-100 shadow-sm"><div className="skeleton h-5 w-40 rounded-full mb-6"/><div className="skeleton h-[220px] w-full rounded-[24px]"/></div>
                      <div className="col-span-4 rounded-[28px] p-7 bg-white border border-slate-100 shadow-sm"><div className="skeleton h-5 w-32 rounded-full mb-6"/><div className="space-y-3">{[0,1,2,3].map(i=><div key={i} className="skeleton h-4 w-full rounded-full"/>)}</div></div>
                      <div className="col-span-3 rounded-[28px] p-7 bg-white border border-slate-100 shadow-sm"><div className="skeleton h-5 w-28 rounded-full mb-6"/><div className="space-y-4">{[0,1,2,3].map(i=><div key={i} className="skeleton h-10 w-full rounded-2xl"/>)}</div></div>
                    </div>
                  </>
                ) : (
                <div className="grid grid-cols-4 gap-5">
                  <div className="anim-in-1 rounded-[28px] p-6 flex flex-col justify-between" style={{backgroundColor:DARK_GREEN,color:"white",minHeight:160}}>
                    <div className="flex justify-between items-start"><span className="text-sm font-medium text-white/90">Radiologists</span><div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">↗</div></div>
                    <div><div className="text-5xl font-bold tracking-tight mb-2">{stats?.total_radiologists??visibleUsers.filter(u=>u.status==="approved").length}</div><div className="text-[11px] text-white/70"><span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{pending} pending</span></div></div>
                  </div>
                  {[{l:"Total Patients",v:visiblePatients.length},{l:"Audit Events",v:auditLogs.length},{l:"Pending Reviews",v:pending}].map((c,i)=>(
                    <div key={c.l} className={`anim-in-${i+2} panel-card p-6 flex flex-col justify-between`} style={{minHeight:160}}>
                      <div className="flex justify-between items-start"><span className="text-sm font-semibold text-slate-700">{c.l}</span><div className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500">↗</div></div>
                      <div><div className="text-5xl font-bold tracking-tight text-slate-900 mb-2">{c.v}</div><div className="text-[11px] text-slate-400">{i===2?"Awaiting approval":"Hospital summary"}</div></div>
                    </div>
                  ))}
                </div>
                )}
                <div className="grid grid-cols-12 gap-5">
                  <Panel className="col-span-5 p-7 flex flex-col anim-in">
                    <h3 className="text-base font-bold text-slate-800 mb-5">Privacy Notice</h3>
                    <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
                      <p>Diagnosis details stay on the radiologist side. Hospital admins manage access, radiologists, patient counts, retraining and audit activity.</p>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Visible Here</p>
                        <p>Approved radiologists, patient registrations, pending approvals, retraining status and hospital branding.</p>
                      </div>
                    </div>
                  </Panel>
                  <Panel className="col-span-4 p-7 flex flex-col justify-between anim-in">
                    <div>
                      <h3 className="text-base font-bold text-slate-800 mb-3">Hospital Overview</h3>
                      <p className="text-[13px] text-slate-500 leading-relaxed">Linked hospital: <strong>{myHospital?.name || me?.hospital || "Your hospital"}</strong></p>
                      <p className="text-[13px] text-slate-500 mt-2">Approved radiologists: <strong>{visibleUsers.filter(u=>u.status==="approved").length}</strong></p>
                      <p className="text-[13px] text-slate-500 mt-1">Pending approval: <strong>{pending}</strong></p>
                      <p className="text-[13px] text-slate-500 mt-1">Registered patients: <strong>{visiblePatients.length}</strong></p>
                    </div>
                    <button onClick={()=>setTab("profile")} className="btn-s w-full py-3.5 rounded-full text-white text-sm font-bold mt-4" style={{backgroundColor:DARK_GREEN}}>My Hospital</button>
                  </Panel>
                  <Panel className="col-span-3 p-7 anim-in">
                    <div className="flex justify-between items-center mb-5"><h3 className="text-base font-bold text-slate-800">Quick Actions</h3></div>
                    <div className="space-y-3">
                      <button onClick={()=>setTab("users")} className="btn-s w-full py-3 rounded-2xl text-white text-sm font-bold" style={{backgroundColor:DARK_GREEN}}>Manage Radiologists</button>
                      <button onClick={()=>setTab("patients")} className="btn-s w-full py-3 rounded-2xl border text-sm font-bold" style={{background:"#EEF1F4",color:"#4A5A68",borderColor:"#D7DEE5"}}>Open Patients</button>
                      <button onClick={()=>setTab("audit")} className="btn-s w-full py-3 rounded-2xl border text-sm font-bold" style={{background:"#EEF1F4",color:"#4A5A68",borderColor:"#D7DEE5"}}>Open Audit Log</button>
                    </div>
                  </Panel>
                </div>
                <div className="grid grid-cols-12 gap-5">
                  <Panel className="col-span-5 p-7 anim-in">
                    <div className="flex justify-between items-center mb-5"><h3 className="text-base font-bold text-slate-800">Radiologists</h3><button onClick={()=>setTab("users")} className="text-[11px] border border-slate-200 px-3 py-1.5 rounded-full text-slate-600 font-medium">Manage</button></div>
                    <div className="space-y-4">
                      {visibleUsers.slice(0,4).map((u,i)=>{const emojis=["👨‍⚕️","👩‍⚕️","🧑‍⚕️","👨‍💼"];return(
                        <div key={u.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xl">{emojis[i%4]}</div><div><p className="text-[13px] font-bold text-slate-800">{u.full_name}</p><p className="text-[11px] text-slate-400">{u.hospital||u.role}</p></div></div>
                          <StatusBadge status={u.status}/>
                        </div>
                      );})}
                      {apiUsers.length===0&&<p className="text-sm text-slate-400 text-center py-4">No team members yet</p>}
                    </div>
                  </Panel>
                  <Panel className="col-span-4 p-7 anim-in flex flex-col items-center">
                    <h3 className="text-base font-bold text-slate-800 self-start mb-5">Patient Overview</h3>
                    <div className="w-full space-y-3">
                      {[{label:"Registered Patients",value:visiblePatients.length},{label:"Patients With Scans",value:visiblePatients.filter(p=>visibleDiagnoses.some(d=>d.patient_id===p.id)).length},{label:"Audit Events",value:auditLogs.length}].map(item=>(
                        <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 w-full">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{item.label}</p>
                          <p className="text-3xl font-black text-slate-900 mt-2">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </Panel>
                  <div className="col-span-3 anim-in wavy-bg rounded-[28px] p-7 text-white flex flex-col items-center justify-center shadow-lg relative overflow-hidden">
                    <h3 className="text-sm font-bold absolute top-6 left-6 text-white/70">Kigali Time (CAT)</h3>
                    <div className="text-[28px] font-black tracking-widest mt-4 drop-shadow font-mono">{rwandaTime}</div>
                    <div className="flex items-center gap-1.5 mt-2"><div className="w-2 h-2 rounded-full pdot" style={{backgroundColor:"#4ADE80"}}/><span className="text-xs text-white/70 font-semibold">{health?.status==="healthy"?"System operational":"Checking…"}</span></div>
                    {stats&&<p className="text-[10px] text-white/50 mt-1">Uptime: {uptimeFmt(stats.uptime_seconds)}</p>}
                    <button onClick={loadAll} className="mt-5 px-5 py-2 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors">Refresh</button>
                  </div>
                </div>
              </div>
            )}

            {/* ══ USERS ══ */}
            {tab==="users"&&(
              <div className="space-y-5 max-w-[1200px] anim-in">
                <PageHead title="Radiologists" sub={`${visibleUsers.length} hospital radiologists`} right={
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search team…" className={INP+" w-[220px]"}/>
                }/>
                <Tbl heads={["Name","Email","Hospital","License","Role","Status","Joined","Actions"]} empty={apiUsers.length===0?"No users yet":undefined}>
                  {apiUsers.filter(u=>!search||u.full_name.toLowerCase().includes(search.toLowerCase())||u.email.toLowerCase().includes(search.toLowerCase())).map(u=>(
                    <TR key={u.id}>
                      <TD><span className="font-bold text-slate-800">{u.full_name}</span></TD>
                      <TD mono>{u.email}</TD><TD>{u.hospital||myHospital?.name||"—"}</TD><TD mono>{u.license_number||"—"}</TD>
                      <TD><span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase">{u.role}</span></TD>
                      <TD><StatusBadge status={u.status}/></TD>
                      <TD mono>{fmt(u.created_at)}</TD>
                      <TD><div className="flex gap-1.5 flex-wrap">
                        {u.status==="pending"&&<><button onClick={()=>approveUser(u.id)} className="btn-s text-[11px] font-bold px-3 py-1.5 rounded-full text-white" style={{backgroundColor:DARK_GREEN}}>Approve</button><button onClick={()=>rejectUser(u.id)} className="btn-s text-[11px] font-bold px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-200">Reject</button></>}
                        {u.status==="approved"&&<><button onClick={()=>setPwUser(u)} className="btn-s text-[11px] font-bold px-3 py-1.5 rounded-full border" style={{background:"#EEF1F4",color:"#4A5A68",borderColor:"#D7DEE5"}}>Password</button><button onClick={()=>revokeUser(u.id,u.full_name)} className="btn-s text-[11px] font-bold px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-200">Revoke</button></>}
                        {(u.status==="rejected"||u.status==="revoked")&&<button onClick={()=>approveUser(u.id)} className="btn-s text-[11px] font-bold px-3 py-1.5 rounded-full text-white" style={{backgroundColor:DARK_GREEN}}>Re-Approve</button>}
                      </div></TD>
                    </TR>
                  ))}
                </Tbl>
              </div>
            )}

            {/* ══ PREDICTIONS ══ */}
            {tab==="predictions"&&(
              <div className="space-y-5 max-w-[1200px] anim-in">
                <Panel className="p-10 text-center">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Diagnosis details are hidden for hospital admin</h3>
                  <p className="text-sm text-slate-500">Radiologists keep diagnosis-level patient records on their own dashboard. Hospital admin access stays focused on radiologists, patients, retraining, audit logs and hospital branding.</p>
                </Panel>
              </div>
            )}

            {/* ══ PATIENTS ══ */}
            {tab==="patients"&&(
              <div className="space-y-4 max-w-[1200px] anim-in">
                <PageHead title="Patients" sub={`${visiblePatients.length} registered`} right={
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or ID…" className={INP+" w-[240px]"}/>
                }/>
                <div className="space-y-2">
                  {visiblePatients.filter(p=>!search||p.name.toLowerCase().includes(search.toLowerCase())||(p.patient_ref_id&&p.patient_ref_id.includes(search))).map(p=>{
                    const ptD=visibleDiagnoses.filter(d=>d.patient_id===p.id); const isExp=expandedPt===p.id;
                    return (
                      <div key={p.id} className="bg-white rounded-[24px] border overflow-hidden transition-all" style={{borderColor:isExp?"#86EFAC":"#F1F5F9",boxShadow:"0 2px 12px rgba(0,0,0,0.04)"}}>
                        <div className="flex items-center gap-4 px-6 py-4">
                          <button onClick={()=>setExpandedPt(isExp?null:p.id)} className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold border-2 shrink-0 transition-all"
                            style={isExp?{backgroundColor:DARK_GREEN,color:"white",borderColor:DARK_GREEN}:{borderColor:"#E2E8F0",color:"#94A3B8"}}>
                            {isExp?"▾":"▸"}
                          </button>
                          <div className="flex-1 grid grid-cols-7 gap-3 items-center min-w-0">
                            {[{l:"Name",v:<span className="text-sm font-bold text-slate-900 truncate">{p.name}</span>},{l:"NID",v:<span className="text-xs font-mono text-slate-400">{maskNationalId(p.patient_ref_id)}</span>},{l:"Age",v:<span className="text-xs text-slate-500">{p.age?`${p.age}y`:"—"}</span>},{l:"Sex",v:<span className="text-xs text-slate-500">{p.sex||"—"}</span>},{l:"Hospital",v:<span className="text-xs text-slate-500 truncate">{p.hospital||"—"}</span>},{l:"Scans",v:<span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white" style={{backgroundColor:ptD.length>0?SOFT_GREY:"#9CA3AF"}}>{ptD.length} scan{ptD.length!==1?"s":""}</span>},{l:"Joined",v:<span className="text-xs text-slate-400">{fmt(p.created_at)}</span>}].map(col=>(
                              <div key={col.l}><div className="text-[8px] font-bold uppercase text-slate-300 mb-0.5">{col.l}</div>{col.v}</div>
                            ))}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={()=>openEdit(p)} className="btn-s text-[11px] font-bold px-3 py-1.5 rounded-full border" style={{background:"#EEF1F4",color:"#4A5A68",borderColor:"#D7DEE5"}}>Edit</button>
                            <button onClick={()=>deletePt(p.id,p.name)} className="btn-s text-[11px] font-bold px-3 py-1.5 rounded-full bg-red-50 text-red-600 border border-red-200">Delete</button>
                          </div>
                        </div>
                        {isExp&&(
                          <div className="border-t border-slate-100 px-6 py-5 bg-slate-50/50">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Patient Summary</p>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                                <div className="text-[8px] font-bold uppercase text-slate-300">Assigned Radiologist</div>
                                <div className="text-sm font-bold text-slate-800 mt-1">{apiUsers.find(u=>u.id===p.radiologist_id)?.full_name??"—"}</div>
                              </div>
                              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                                <div className="text-[8px] font-bold uppercase text-slate-300">Scans Recorded</div>
                                <div className="text-sm font-bold text-slate-800 mt-1">{ptD.length}</div>
                              </div>
                              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                                <div className="text-[8px] font-bold uppercase text-slate-300">Clinical Notes</div>
                                <div className="text-sm font-medium text-slate-600 mt-1">{p.clinical_notes||"No notes added"}</div>
                              </div>
                            </div>
                            <p className="text-xs text-slate-400 mt-4">Diagnosis details remain visible only on the radiologist side.</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {patients.length===0&&<Panel className="p-12 text-center"><span className="text-sm text-slate-400">No patients yet</span></Panel>}
                </div>
              </div>
            )}

            {/* ══ DIAGNOSE — radiologist first, then patient ══ */}
            {tab==="diagnose"&&(
              <div className="space-y-6 max-w-[1200px] anim-in">
                <PageHead title="Run AI Scan" sub="Select a radiologist, then their patient, then upload the chest X-ray"/>
                <div className="grid lg:grid-cols-2 gap-7">
                  <Panel className="p-8 space-y-7">

                    {/* ── Step 1: Radiologist ── */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className={`step-ring ${dxRadiologist?"done":"active"}`}>{dxRadiologist?"✓":"1"}</div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">Select Radiologist</p>
                          <p className="text-[11px] text-slate-400">Patients will be filtered by this radiologist</p>
                        </div>
                      </div>
                      <input value={dxRadSearch} onChange={e=>{setDxRadSearch(e.target.value);if(dxRadiologist){setDxRadiologist("");setSelectedPtId("");setPtSearch("");}}}
                        placeholder="Type to search radiologists…" className={INP}/>
                      {!dxRadiologist&&(
                        <div className="max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-50">
                          {radiologists.filter(u=>!dxRadSearch||u.full_name.toLowerCase().includes(dxRadSearch.toLowerCase())||u.email.toLowerCase().includes(dxRadSearch.toLowerCase())).slice(0,8).map(u=>(
                            <button key={u.id} onClick={()=>{setDxRadiologist(u.id);setDxRadSearch(u.full_name);setSelectedPtId("");setPtSearch("");}}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{backgroundColor:DARK_GREEN}}>{u.full_name.charAt(0)}</div>
                              <div><p className="text-sm font-bold text-slate-800">{u.full_name}</p><p className="text-[10px] text-slate-400">{u.hospital||u.email}</p></div>
                            </button>
                          ))}
                          {radiologists.filter(u=>!dxRadSearch||u.full_name.toLowerCase().includes(dxRadSearch.toLowerCase())||u.email.toLowerCase().includes(dxRadSearch.toLowerCase())).length===0&&(
                            <p className="px-4 py-3 text-sm text-slate-400">No approved radiologists found</p>
                          )}
                        </div>
                      )}
                      {dxRadiologist&&(()=>{const u=apiUsers.find(r=>r.id===dxRadiologist);return u?(<div className="flex items-center justify-between p-3 rounded-2xl" style={{background:"#F0FDF4",border:`1.5px solid ${BRAND}`}}>
                        <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{backgroundColor:DARK_GREEN}}>{u.full_name.charAt(0)}</div><div><p className="text-sm font-bold text-emerald-800">{u.full_name}</p><p className="text-[10px] text-emerald-600">{u.hospital||u.email}</p></div></div>
                        <button onClick={()=>{setDxRadiologist("");setDxRadSearch("");setSelectedPtId("");setPtSearch("");}} className="text-xs text-slate-400 hover:text-red-500 font-bold px-2">✕</button>
                      </div>):null;})()}
                    </div>

                    {/* ── Step 2: Patient (locked until radiologist set) ── */}
                    <div className={`space-y-3 transition-opacity ${dxRadiologist?"opacity-100":"opacity-40 pointer-events-none"}`}>
                      <div className="flex items-center gap-3">
                        <div className={`step-ring ${selectedPtId?"done":dxRadiologist?"active":"idle"}`}>{selectedPtId?"✓":"2"}</div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">Select Patient</p>
                          <p className="text-[11px] text-slate-400">{dxRadiologist?`${filteredPatients.length} patient(s) under this radiologist`:"Select radiologist first"}</p>
                        </div>
                      </div>
                      <input value={ptSearch} onChange={e=>{setPtSearch(e.target.value);setSelectedPtId("");}} placeholder="Type to search patients…" className={INP} disabled={!dxRadiologist}/>
                      {dxRadiologist&&!selectedPtId&&(
                        <div className="max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-50">
                          {filteredPatients.filter(p=>!ptSearch||p.name.toLowerCase().includes(ptSearch.toLowerCase())||(p.patient_ref_id&&p.patient_ref_id.includes(ptSearch))).slice(0,10).map(p=>(
                            <button key={p.id} onClick={()=>{setSelectedPtId(p.id);setPtSearch(p.name);}}
                              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors">
                              <div><p className="text-sm font-bold text-slate-800">{p.name}</p><p className="text-[10px] text-slate-400 font-mono">{maskNationalId(p.patient_ref_id) || "No NID"}{p.hospital?` · ${p.hospital}`:""}</p></div>
                            </button>
                          ))}
                          {filteredPatients.filter(p=>!ptSearch||p.name.toLowerCase().includes(ptSearch.toLowerCase())||(p.patient_ref_id&&p.patient_ref_id.includes(ptSearch))).length===0&&(
                            <p className="px-4 py-3 text-sm text-slate-400">{filteredPatients.length===0?"No patients registered for this radiologist yet":"No match"}</p>
                          )}
                        </div>
                      )}
                      {selectedPtId&&(()=>{const p=patients.find(pt=>pt.id===selectedPtId);return p?(<div className="flex items-center justify-between p-3 rounded-2xl" style={{background:"#EEF1F4",border:"1.5px solid #D7DEE5"}}>
                        <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{backgroundColor:SOFT_GREY}}>{p.name.charAt(0)}</div><div><p className="text-sm font-bold" style={{color:"#4A5A68"}}>{p.name}</p><p className="text-[10px] font-mono" style={{color:SOFT_GREY}}>{maskNationalId(p.patient_ref_id)}</p></div></div>
                        <button onClick={()=>{setSelectedPtId("");setPtSearch("");}} className="text-xs text-slate-400 hover:text-red-500 font-bold px-2">✕</button>
                      </div>):null;})()}
                    </div>

                    {/* ── Step 3: Upload (locked until patient set) ── */}
                    <div className={`space-y-3 transition-opacity ${selectedPtId?"opacity-100":"opacity-40 pointer-events-none"}`}>
                      <div className="flex items-center gap-3">
                        <div className={`step-ring ${xFile?"done":selectedPtId?"active":"idle"}`}>{xFile?"✓":"3"}</div>
                        <div><p className="text-sm font-bold text-slate-800">Upload X-ray</p><p className="text-[11px] text-slate-400">JPG or PNG chest X-ray</p></div>
                      </div>
                      <div onClick={()=>selectedPtId&&fileRef.current?.click()} className="border-2 border-dashed rounded-3xl p-7 text-center cursor-pointer transition-colors" style={{borderColor:xPrev?"#38A169":"#E2E8F0",backgroundColor:xPrev?"#F0FDF4":"#FAFAFA"}}>
                        {xPrev?<img src={xPrev} alt="X-ray" className="max-h-48 mx-auto rounded-2xl shadow-md object-contain"/>
                          :<div className="space-y-2 float-it"><div className="text-4xl">🩻</div><div className="text-sm font-bold text-slate-500">Click to upload X-ray</div></div>}
                        <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={handleFile} className="hidden"/>
                      </div>
                    </div>

                    {predInfo&&<div className="p-4 rounded-2xl text-sm font-semibold" style={{background:"#EEF1F4",border:"1px solid #D7DEE5",color:"#4A5A68"}}>{predInfo}</div>}
                    {predErr&&<div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">{predErr}</div>}

                    <button onClick={runPred} disabled={predicting||!xFile||!selectedPtId||!dxRadiologist} className="btn-s w-full py-4 rounded-full text-white font-bold text-sm disabled:opacity-40" style={{backgroundColor:DARK_GREEN,boxShadow:`0 8px 24px ${DARK_GREEN}44`}}>
                      {predicting?"Analyzing X-ray…":"▶ Run AI Diagnosis"}
                    </button>
                  </Panel>

                  <Panel className="p-8">
                    <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">Result</h3>
                    {!pred&&!predicting&&<div className="h-64 flex flex-col items-center justify-center text-slate-300 gap-3"><svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><p className="text-sm font-medium">Complete all 3 steps to run a scan</p></div>}
                    {predicting&&<div className="h-64 flex items-center justify-center"><div className="w-12 h-12 border-4 border-slate-100 rounded-full animate-spin" style={{borderTopColor:ACCENT_GREEN}}/></div>}
                    {pred&&(()=>{
                      const c=CLS_META[pred.classification]||CLS_META["Unknown"];
                      const pt=patients.find(p=>p.id===selectedPtId);
                      const rad=apiUsers.find(u=>u.id===dxRadiologist);
                      return(
                      <div className="space-y-5 anim-pop">
                        {/* Who / patient summary */}
                        <div className="grid grid-cols-2 gap-3">
                          {rad&&<div className="p-3 rounded-2xl bg-slate-50 border border-slate-100"><p className="text-[9px] font-bold uppercase text-slate-300 mb-1">Radiologist</p><p className="text-sm font-bold text-slate-800">{rad.full_name}</p></div>}
                          {pt&&<div className="p-3 rounded-2xl bg-slate-50 border border-slate-100"><p className="text-[9px] font-bold uppercase text-slate-300 mb-1">Patient</p><p className="text-sm font-bold text-slate-800">{pt.name}</p></div>}
                        </div>
                        <div className="p-6 rounded-3xl text-center" style={{backgroundColor:c.bg,border:`2px solid ${c.bar}`}}>
                          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{color:c.text}}>AI Classification</p>
                          <h2 className="text-5xl font-black" style={{color:c.text}}>{pred.classification}</h2>
                          <p className="text-sm font-bold mt-1.5" style={{color:c.text,opacity:.7}}>{pred.confidence_score.toFixed(1)}% Confidence</p>
                        </div>
                        <div className="space-y-3 px-1">
                          {[{l:"Normal",v:pred.normal_probability,c:CLS_META["Normal"].bar},{l:"Pneumonia",v:pred.pneumonia_probability,c:CLS_META["Pneumonia"].bar},{l:"Tuberculosis",v:pred.tb_probability,c:CLS_META["Tuberculosis"].bar}].map(r=>(
                            <div key={r.l}><div className="flex justify-between text-[12px] font-bold mb-1"><span className="text-slate-500">{r.l}</span><span style={{color:r.c}}>{(r.v*100).toFixed(1)}%</span></div><div className="h-2.5 rounded-full overflow-hidden" style={{backgroundColor:`${r.c}20`}}><div className="bar-in h-full rounded-full" style={{"--w":`${r.v*100}%`,width:`${r.v*100}%`,backgroundColor:r.c} as any}/></div></div>
                          ))}
                        </div>
                        {savedDx&&<div className="p-4 rounded-2xl text-sm font-bold" style={{backgroundColor:CLS_META["Normal"].bg,border:`1px solid ${BRAND}`,color:"#14532D"}}>✅ Diagnosis #{savedDx.id} saved — recorded under {rad?.full_name}</div>}
                        <button onClick={()=>{setPred(null);setSavedDx(null);setSavedPt(null);setXFile(null);setXPrev(null);setSelectedPtId("");setPtSearch("");setDxRadiologist("");setDxRadSearch("");setPredErr("");setPredInfo("");}} className="w-full py-3 rounded-full bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors">New Scan</button>
                      </div>
                    );})()}
                  </Panel>
                </div>
              </div>
            )}

            {/* ══ RETRAIN — unified brand colours, 1-class minimum ══ */}
            {tab==="retrain"&&(
              <div className="space-y-6 max-w-[1200px] anim-in">
                <PageHead title="Retrain AI Model" sub={`Upload labelled X-rays and trigger retraining — minimum ${RT_MIN} images per class`}/>

                <div className="grid lg:grid-cols-2 gap-7">
                  {/* Left: upload panel */}
                  <Panel className="p-8 space-y-6">

                    {/* Step 1 — choose label */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="step-ring active">1</div>
                        <div><p className="text-sm font-bold text-slate-800">Choose Class Label</p><p className="text-[11px] text-slate-400">Pick which class these images belong to</p></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(["Normal","Pneumonia","Tuberculosis","Unknown"] as const).map(l=>{
                          const active=rtLabel===l;
                          const n=stagedC[l]||0;
                          const ready=n>=RT_MIN;
                          return(
                            <button key={l} onClick={()=>{setRtLabel(l);setRtFiles([]);}}
                              className="btn-s py-4 rounded-2xl text-sm font-bold border-2 transition-all text-left px-4 relative"
                              style={active
                                ?{backgroundColor:DARK_GREEN,color:"#fff",borderColor:DARK_GREEN,boxShadow:`0 6px 18px ${DARK_GREEN}33`}
                                :{backgroundColor:"white",borderColor:n>0?"#86EFAC":"#E2E8F0",color:"#475569"}}>
                              <span>{l}</span>
                              {n>0&&<span className="block text-[10px] font-semibold mt-0.5 opacity-80">{n} staged {ready?"✓":`(need ${RT_MIN-n} more)`}</span>}
                              {n===0&&<span className="block text-[10px] opacity-50 mt-0.5">Not uploaded</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Step 2 — upload files */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="step-ring active">2</div>
                        <div><p className="text-sm font-bold text-slate-800">Upload images for <span style={{color:DARK_GREEN}}>"{rtLabel}"</span></p><p className="text-[11px] text-slate-400">Minimum {RT_MIN} images · JPG/PNG/WebP or one ZIP archive</p></div>
                      </div>
                      <div
                        onDragOver={e=>{e.preventDefault();setRtDrag(true);}}
                        onDragLeave={()=>setRtDrag(false)}
                        onDrop={e=>{e.preventDefault();setRtDrag(false);setRtFiles(Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith("image/")||f.name.toLowerCase().endsWith(".zip")));}}
                        onClick={()=>rtRef.current?.click()}
                        className="border-2 border-dashed rounded-3xl p-7 text-center cursor-pointer transition-all"
                        style={{borderColor:rtDrag?DARK_GREEN:rtFiles.length>0?BRAND:"#E2E8F0",backgroundColor:rtDrag||rtFiles.length>0?"#F0FDF4":"#FAFAFA"}}>
                        {rtFiles.length>0
                          ?<div><p className="text-base font-bold" style={{color:DARK_GREEN}}>{rtFiles.length} file{rtFiles.length!==1?"s":""} selected</p><p className="text-xs text-slate-400 mt-1">{rtFiles.some(f=>f.name.toLowerCase().endsWith(".zip"))?"ZIP archive ready":"Click to change"}</p></div>
                          :<div className="float-it"><p className="text-sm font-bold text-slate-500">Drop files here or click to browse</p><p className="text-xs text-slate-400 mt-1">Multiple images or one ZIP archive</p></div>}
                        <input ref={rtRef} type="file" accept="image/*,.zip" multiple onChange={e=>setRtFiles(Array.from(e.target.files||[]))} className="hidden"/>
                      </div>
                      <button onClick={uploadForRetrain} disabled={uploading||!rtFiles.length}
                        className="btn-s w-full py-3.5 rounded-full text-white font-bold text-sm disabled:opacity-40"
                        style={{backgroundColor:DARK_GREEN,boxShadow:`0 6px 18px ${DARK_GREEN}33`}}>
                        {uploading?"Uploading…":rtFiles.length?`Upload ${rtFiles.length} file${rtFiles.length!==1?"s":""} as "${rtLabel}"`:"Select files first"}
                      </button>
                    </div>

                    {/* Step 3 — staged summary + trigger */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className={`step-ring ${canTrigger?"active":"idle"}`}>3</div>
                        <div><p className="text-sm font-bold text-slate-800">Start Retraining</p><p className="text-[11px] text-slate-400">Need ≥{RT_MIN} images in at least 1 class</p></div>
                      </div>

                      {/* Staged breakdown — all using brand palette */}
                      <div className="rounded-2xl p-4 space-y-2" style={{background:"#F0FDF4",border:`1px solid ${BRAND}`}}>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Staged Summary</p>
                        {(["Normal","Pneumonia","Tuberculosis","Unknown"] as const).map(l=>{
                          const n=stagedC[l]||0;
                          const ready=n>=RT_MIN;
                          return(
                            <div key={l} className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-600">{l}</span>
                              {n===0
                                ?<span className="text-[10px] italic text-slate-300">Not uploaded</span>
                                :<div className="flex items-center gap-2">
                                  <div className="h-1.5 w-20 rounded-full overflow-hidden bg-slate-200"><div className="h-full rounded-full" style={{width:`${Math.min((n/RT_MIN)*100,100)}%`,backgroundColor:ready?DARK_GREEN:SOFT_GREY}}/></div>
                                  <span className="text-[10px] font-bold" style={{color:ready?DARK_GREEN:SOFT_GREY}}>{n} {ready?"✓":`/ ${RT_MIN}`}</span>
                                </div>}
                            </div>
                          );
                        })}
                        {stagedClasses.length===0&&<p className="text-xs italic text-slate-400 text-center py-1">Upload images to see progress</p>}
                      </div>

                      <div className="flex gap-2">
                        <button onClick={triggerRetrain} disabled={!canTrigger}
                          className="btn-s flex-1 py-4 rounded-full text-white font-bold text-sm disabled:opacity-40"
                          style={{backgroundColor:canTrigger?"#1C5438":"#94A3B8",boxShadow:canTrigger?`0 8px 24px ${DARK_GREEN}44`:"none"}}>
                          {canTrigger
                            ?`⚡ Trigger Retraining (${readyClasses.length} class${readyClasses.length!==1?"es":""})`
                            :`Upload ≥${RT_MIN} images first`}
                        </button>
                        {stagedClasses.length>0&&(
                          <button onClick={clearStaged} disabled={clearing}
                            className="btn-s px-5 py-4 rounded-full font-bold text-sm border-2 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 whitespace-nowrap"
                            title="Clear all staged images">
                            {clearing?"…":"Clear"}
                          </button>
                        )}
                      </div>
                    </div>

                    {rtMsg&&<div className="p-4 rounded-2xl text-sm font-semibold" style={rtOk?{background:"#E6F4EC",border:"1px solid #B9D8C7",color:DARK_GREEN}:{background:"#F7E7E3",border:"1px solid #E7BBB0",color:"#8D4A3A"}}>{rtMsg}</div>}
                  </Panel>

                  {/* Right: job history */}
                  <Panel className="p-8 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Retrain Job History</p>
                      <button onClick={loadAll} className="text-[11px] text-slate-400 hover:text-slate-700 font-semibold">Refresh</button>
                    </div>
                    {retrainJobs.length===0
                      ?<div className="h-40 flex flex-col items-center justify-center text-slate-300 gap-2 float-it"><svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg><p className="text-sm">No retrain jobs yet</p></div>
                      :<div className="space-y-3 overflow-y-auto max-h-[500px]">{retrainJobs.map(j=>{
                        const isOk=j.status==="completed"; const isFail=j.status==="failed"; const isRun=j.status==="processing"||j.status==="pending";
                        const borderCol=isOk?"#B9D8C7":isFail?"#E7BBB0":"#D7DEE5";
                        const bgCol=isOk?"#E6F4EC":isFail?"#F7E7E3":"#EEF1F4";
                        const textCol=isOk?DARK_GREEN:isFail?"#8D4A3A":"#4A5A68";
                        return(
                          <div key={j.id} className="p-5 rounded-2xl" style={{backgroundColor:bgCol,border:`1.5px solid ${borderCol}`}}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {isRun&&<div className="w-3 h-3 rounded-full pdot" style={{backgroundColor:SOFT_GREY}}/>}
                                <span className="text-base font-bold" style={{color:textCol}}>Job #{j.id}</span>
                              </div>
                              <StatusBadge status={j.status}/>
                            </div>
                            {j.final_val_acc&&<p className="text-sm mb-1" style={{color:textCol}}>Validation accuracy: <strong>{(j.final_val_acc*100).toFixed(1)}%</strong></p>}
                            {j.error_message&&<div className="mt-2 p-2.5 rounded-xl text-xs font-semibold bg-red-100 text-red-700 break-words">{j.error_message}</div>}
                            <p className="text-[9px] mt-2 text-slate-400">{fmt(j.created_at)}</p>
                          </div>
                        );
                      })}</div>}
                  </Panel>
                </div>
              </div>
            )}

            {/* ══ MODEL ══ */}
            {tab==="model"&&(
              <div className="space-y-5 max-w-[900px] anim-in">
                <PageHead title="AI Model" sub="ResNet-50 production model"/>
                {modelInfo&&<div className="grid lg:grid-cols-2 gap-5">
                  <Panel className="p-7">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-5">Model Details</p>
                    {[{l:"Status",v:modelInfo.status},{l:"Architecture",v:modelInfo.architecture},{l:"Size",v:`${modelInfo.size_mb} MB`},{l:"Input Shape",v:modelInfo.input_shape?.join(" × ")},{l:"Last Modified",v:fmt(modelInfo.last_modified)}].map(r=>(
                      <div key={r.l} className="flex justify-between py-4 border-b border-slate-100 last:border-0"><span className="text-xs font-bold uppercase tracking-widest text-slate-400">{r.l}</span><span className="text-sm font-bold text-slate-800">{r.v}</span></div>
                    ))}
                  </Panel>
                  <Panel className="p-7"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Trained Classes</p><div className="flex flex-wrap gap-2">{modelInfo.classes?.map(c=><ClsBadge key={c} cls={c}/>)}</div></Panel>
                </div>}
                {!modelInfo&&<Panel className="p-10 text-center text-sm text-slate-400">Loading model info…</Panel>}
              </div>
            )}

            {/* ══ PASSWORDS ══ */}
            {tab==="passwords"&&(
              <div className="space-y-5 max-w-[1100px] anim-in">
                <PageHead title="Password Management" sub="Set or generate passwords for approved radiologists"/>
                <Tbl heads={["User","Email","Status","Last Action","Actions"]} empty={apiUsers.filter(u=>u.status==="approved").length===0?"No approved users yet":undefined}>
                  {apiUsers.filter(u=>u.status==="approved").map(u=>{const last=pwLogs.filter(l=>l.entity_id===u.id).sort((a,b)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime())[0];return(
                    <TR key={u.id}>
                      <TD><span className="font-bold text-slate-800">{u.full_name}</span></TD>
                      <TD mono>{u.email}</TD>
                      <TD><StatusBadge status="approved"/></TD>
                      <TD mono>{last?`${last.action==="admin_generate_password"?"Generated":"Manual"} · ${fmt(last.timestamp)}`:"—"}</TD>
                      <TD><button onClick={()=>setPwUser(u)} className="btn-s text-[11px] font-bold px-3 py-1.5 rounded-full border" style={{background:"#EEF1F4",color:"#4A5A68",borderColor:"#D7DEE5"}}>Manage</button></TD>
                    </TR>);
                  })}
                </Tbl>
                <Panel className="p-6">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Password Activity Log</p>
                  {pwLogs.length===0?<div className="py-8 text-center text-sm text-slate-400">No activity yet</div>:(
                    <Tbl heads={["Action","Target","Admin","When"]}>
                      {pwLogs.map(l=>{const target=apiUsers.find(u=>u.id===l.entity_id);return(
                        <TR key={l.id}>
                          <TD><span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white" style={{backgroundColor:SOFT_GREY}}>{l.action==="admin_generate_password"?"Auto":"Manual"}</span></TD>
                          <TD>{target?.full_name??"—"}</TD>
                          <TD>{apiUsers.find(u=>u.id===l.user_id)?.full_name??"Admin"}</TD>
                          <TD mono>{fmt(l.timestamp)}</TD>
                        </TR>);
                      })}
                    </Tbl>
                  )}
                </Panel>
              </div>
            )}

            {/* ══ AUDIT ══ */}
            {tab==="audit"&&(
              <div className="space-y-5 max-w-[1100px] anim-in">
                <PageHead title="Activity Log" sub={`Last ${auditLogs.length} recorded actions`}/>
                <Tbl heads={["Team member","Activity","Area","Record","Time","Details"]} empty={auditLogs.length===0?"No activity recorded yet":undefined}>
                  {auditLogs.map(l=>{
                    const col=l.action.includes("delete")||l.action.includes("reject")||l.action.includes("revoke")?SOFT_RED:l.action.includes("approve")||l.action.includes("verify")||l.action.includes("retrain")?DARK_GREEN:SOFT_GREY;
                    const actor=l.user_id===me?.id?me?.full_name:(apiUsers.find(u=>u.id===l.user_id)?.full_name||l.detail?.performed_by||"Team member");
                    const detailText=
                      l.action==="delete_patient"
                        ? `${l.detail?.patient_name||"Patient"} deleted by ${l.detail?.performed_by||actor}.`
                        : l.detail?.target_email
                          ? `Account: ${l.detail.target_email}`
                          : l.entity_id
                            ? `Record ${l.entity_id}`
                            : "�";
                    return <TR key={l.id}>
                      <TD>{actor}</TD>
                      <TD><span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white" style={{backgroundColor:col}}>{prettyAuditAction(l.action)}</span></TD>
                      <TD>{prettyAuditEntity(l.entity)}</TD>
                      <TD>{l.detail?.patient_name||l.entity_id||"�"}</TD>
                      <TD mono>{fmt(l.timestamp)}</TD>
                      <TD>{detailText}</TD>
                    </TR>;
                  })}
                </Tbl>
              </div>
            )}

            {/* ══ PROFILE ══ */}
            {tab==="profile"&&isHospitalAdmin&&(
              <div className="space-y-6 max-w-[800px] anim-in">
                <PageHead title={myHospital?.name||"My Hospital"} sub="Manage your hospital's branding and account"/>

                {/* Logo upload */}
                <Panel className="p-8 space-y-5">
                  <h3 className="text-base font-bold text-slate-800">Hospital Logo</h3>
                  <p className="text-sm text-slate-500">This logo appears on your radiologists' diagnosing page as a branding banner.</p>
                  <div className="flex items-start gap-6">
                    <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50 shrink-0">
                      {logoPreview
                        ?<img src={logoPreview} alt="logo" className="w-full h-full object-contain"/>
                        :<span className="text-3xl">🏥</span>}
                    </div>
                    <div className="flex-1 space-y-3">
                      <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)uploadLogo(f);}}/>
                      <button onClick={()=>logoRef.current?.click()} disabled={logoUploading}
                        className="btn-s px-6 py-2.5 rounded-full text-white text-sm font-bold disabled:opacity-50"
                        style={{backgroundColor:"#1C5438"}}>
                        {logoUploading?"Uploading…":"Upload Logo"}
                      </button>
                      <p className="text-xs text-slate-400">PNG or JPG recommended. Auto-displayed on radiologist dashboards.</p>
                      {logoMsg&&<div className="p-3 rounded-2xl text-sm font-semibold" style={logoOk?{background:"#E6F4EC",border:"1px solid #B9D8C7",color:DARK_GREEN}:{background:"#F7E7E3",border:"1px solid #E7BBB0",color:"#8D4A3A"}}>{logoMsg}</div>}
                    </div>
                  </div>
                </Panel>

                {/* Account info */}
                <Panel className="p-8 space-y-5">
                  <h3 className="text-base font-bold text-slate-800">Account</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {[{l:"Name",v:me?.full_name},{l:"Email",v:me?.email},{l:"Role",v:"Hospital Admin"},{l:"Linked Hospital",v:myHospital?.name||me?.hospital||"Your hospital"}].map(f=>(
                      <div key={f.l} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                        <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">{f.l}</div>
                        <div className="font-semibold text-slate-800">{f.v||"—"}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>setMyPwdModal(true)} className="btn-s px-6 py-2.5 rounded-full text-white text-sm font-bold" style={{backgroundColor:SOFT_GREY}}>
                    Change Password
                  </button>
                </Panel>

                {/* Change password modal */}
                {myPwdModal&&(
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:"rgba(0,0,0,.45)",backdropFilter:"blur(6px)"}}>
                    <div className="anim-pop w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden">
                      <div className="px-8 pt-7 pb-6 text-white" style={{background:`linear-gradient(135deg,${DARK_GREEN},${ACCENT_GREEN})`}}>
                        <div className="flex items-center justify-between">
                          <h2 className="text-lg font-bold">Change Password</h2>
                          <button onClick={()=>{setMyPwdModal(false);setMyPwd("");setMyPwdMsg("");}} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center font-bold">✕</button>
                        </div>
                      </div>
                      <div className="p-8 space-y-4">
                        <input type="password" value={myPwd} onChange={e=>setMyPwd(e.target.value)} placeholder="New password (min 8 chars)" className={INP_RECT}/>
                        {myPwdMsg&&<div className="p-4 rounded-2xl text-sm font-semibold" style={myPwdOk?{background:"#E6F4EC",border:"1px solid #B9D8C7",color:DARK_GREEN}:{background:"#F7E7E3",border:"1px solid #E7BBB0",color:"#8D4A3A"}}>{myPwdMsg}</div>}
                        <div className="flex gap-3 pt-1">
                          <button onClick={()=>{setMyPwdModal(false);setMyPwd("");setMyPwdMsg("");}} className="flex-1 py-3 rounded-full bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">Cancel</button>
                          <button onClick={changeMyPassword} disabled={myPwdLoading||!myPwd} className="btn-s flex-1 py-3 rounded-full text-white font-bold disabled:opacity-40" style={{backgroundColor:SOFT_GREY}}>{myPwdLoading?"Saving…":"Update Password"}</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          </main>
        </div>
      </div>
    </>
  );
}
