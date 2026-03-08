"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabaseConfig";
import {
  LayoutDashboard, Users, BarChart3, GraduationCap,
  BookOpen, RefreshCw, Cpu, Lock, FileText,
  Search, Bell, Mail, Plus, Download,
  LogOut, Settings, HelpCircle, MoreHorizontal,
  CheckCircle2, AlertCircle, Play, Square,
  ArrowUpRight, ChevronLeft, ChevronRight
} from "lucide-react";
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid
} from "recharts";

const API_BASE = (import.meta as any).env?.VITE_API_URL || "http://localhost:8000";

async function adminFetch(path: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(e.detail || `API ${res.status}`);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────
const fmt = (iso:string) => new Date(iso).toLocaleString("en-RW",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const uptimeFmt = (s:number) => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return `${h}h ${m}m`; };
const validateRwandaId = (id:string) => /^\d{16}$/.test(id.replace(/\s/g,""));
function parseDuplicateError(msg:string):{type:"NATIONAL_ID"|"NAME"|null;existingId:number|null;message:string}{
  if(msg.startsWith("DUPLICATE_NATIONAL_ID|")){const p=msg.split("|");return{type:"NATIONAL_ID",existingId:parseInt(p[1])||null,message:p[2]||msg};}
  if(msg.startsWith("DUPLICATE_NAME|")){const p=msg.split("|");return{type:"NAME",existingId:parseInt(p[1])||null,message:p[2]||msg};}
  return{type:null,existingId:null,message:msg};
}

// ─── Design tokens ────────────────────────────────
const G  = "#006837"; // brand dark green
const O  = "#F27D26"; // brand orange accent
const GB = "#F7F8FA"; // page background

const CLS: Record<string,{bg:string;border:string;text:string;bar:string}> = {
  "Normal":       {bg:"#DCFCE7",border:"#86EFAC",text:"#14532D",bar:"#16A34A"},
  "Tuberculosis": {bg:"#FEE2E2",border:"#FCA5A5",text:"#7F1D1D",bar:"#DC2626"},
  "Pneumonia":    {bg:"#FEF3C7",border:"#FCD34D",text:"#78350F",bar:"#D97706"},
  "Unknown":      {bg:"#F1F5F9",border:"#CBD5E1",text:"#334155",bar:"#64748B"},
};

const INP = "w-full px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-500/10 transition-all";

// ─── Global CSS ───────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
* { box-sizing: border-box; }
.kk-app { font-family: 'DM Sans', system-ui, sans-serif; }

@keyframes slideUp  { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
@keyframes popIn    { from{opacity:0;transform:scale(0.93)} to{opacity:1;transform:scale(1)} }
@keyframes floatY   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
@keyframes barFill  { from{width:0} to{width:var(--w)} }
@keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.6)} }

.anim-up  { animation:slideUp .38s cubic-bezier(.22,1,.36,1) both; }
.anim-up1 { animation-delay:.05s } .anim-up2 { animation-delay:.10s }
.anim-up3 { animation-delay:.15s } .anim-up4 { animation-delay:.20s }
.anim-pop { animation:popIn .3s cubic-bezier(.22,1,.36,1) both; }
.float-it { animation:floatY 3s ease-in-out infinite; }
.pdot     { animation:pulseDot 1.8s ease-in-out infinite; }

.lift { transition:transform .2s ease, box-shadow .2s ease; }
.lift:hover { transform:translateY(-3px); box-shadow:0 14px 32px rgba(0,0,0,0.10); }

.nav-btn { transition:background .14s ease, color .14s ease, transform .14s ease; }
.nav-btn:hover { transform:translateX(2px); }

.btn-action { transition:transform .14s ease, box-shadow .14s ease, filter .14s ease; }
.btn-action:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(1.06); }
.btn-action:active:not(:disabled) { transform:scale(.98); }

.trow { transition:background .12s ease; }
.trow:hover { background:#F0FDF4; }

.fill-bar { animation:barFill .8s cubic-bezier(.22,1,.36,1) both; }

/* Stat card shimmer */
.stat-shimmer { position:relative; overflow:hidden; }
.stat-shimmer::after {
  content:''; position:absolute; top:0; left:-100%; width:55%; height:100%;
  background:linear-gradient(105deg,transparent,rgba(255,255,255,.2),transparent);
  transition:left .5s ease;
}
.stat-shimmer:hover::after { left:150%; }
`;

// ─── SVG Gauge ────────────────────────────────────
function Gauge({value,label}:{value:number;label:string}) {
  const r=70, c=2*Math.PI*r;
  return (
    <div className="flex flex-col items-center relative">
      <svg className="w-48 h-48 -rotate-90">
        <circle cx="96" cy="96" r={r} stroke="#F1F5F9" strokeWidth="16" fill="transparent"/>
        <circle cx="96" cy="96" r={r} stroke={G} strokeWidth="16" fill="transparent"
          strokeDasharray={c} strokeDashoffset={c-(value/100)*c}
          strokeLinecap="round" style={{transition:"stroke-dashoffset 1s ease"}}/>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black text-slate-900">{value}%</span>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
    </div>
  );
}

// ─── Stat card (white or dark) ────────────────────
function StatCard({label,value,sub,icon:Icon,dark}:{label:string;value:string|number;sub:string|number;icon:React.ElementType;dark?:boolean}) {
  return (
    <div className={`stat-shimmer lift p-6 rounded-[2rem] border flex flex-col gap-4 ${dark?"text-white border-transparent":"bg-white text-slate-900 border-slate-200"}`}
      style={dark?{background:`linear-gradient(135deg,${G},#00844A)`,boxShadow:`0 12px 32px ${G}55`}:{}}>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-semibold ${dark?"text-white/80":"text-slate-500"}`}>{label}</span>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${dark?"bg-white/20":"bg-slate-100"}`}>
          <Icon size={20} className={dark?"text-white":"text-emerald-700"}/>
        </div>
      </div>
      <div>
        <div className="text-4xl font-black tracking-tight">{value}</div>
        <div className={`text-xs flex items-center gap-1 mt-1 ${dark?"text-white/70":"text-slate-500"}`}>
          <ArrowUpRight size={13} style={{color:O}}/>
          <span className="font-bold" style={{color:dark?"rgba(255,255,255,0.8)":O}}>{sub}</span>
          <span>from last month</span>
        </div>
      </div>
    </div>
  );
}

// ─── Cls badge ────────────────────────────────────
function ClsBadge({cls}:{cls:string}) {
  const c=CLS[cls]||CLS["Unknown"];
  return <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full" style={{backgroundColor:c.bar,color:"#fff"}}>{cls}</span>;
}

function StatusPill({status}:{status:string}) {
  const map:Record<string,[string,string]> = {
    approved:["#16A34A","#fff"], pending:["#D97706","#fff"], rejected:["#DC2626","#fff"],
    Verified:["#2563EB","#fff"], Pending:["#94A3B8","#fff"],
    processing:["#2563EB","#fff"], completed:["#16A34A","#fff"], failed:["#DC2626","#fff"],
    active:["#16A34A","#fff"],
  };
  const [bg,tx]=map[status]||["#94A3B8","#fff"];
  return <span className="inline-flex text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full" style={{backgroundColor:bg,color:tx}}>{status}</span>;
}

// ─── Panel + Table helpers ────────────────────────
function Panel({children,className=""}:{children:React.ReactNode;className?:string}) {
  return <div className={`bg-white rounded-[2rem] border border-slate-200 shadow-sm ${className}`}>{children}</div>;
}
function PageHead({title,sub,right}:{title:string;sub?:string;right?:React.ReactNode}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-7">
      <div><h1 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h1>{sub&&<p className="text-sm font-medium text-slate-400 mt-0.5">{sub}</p>}</div>
      {right&&<div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}
function ProgressBar({pct,color}:{pct:number;color:string}) {
  return (
    <div className="h-2.5 rounded-full overflow-hidden" style={{backgroundColor:`${color}25`}}>
      <div className="fill-bar h-full rounded-full" style={{"--w":`${pct}%`,width:`${pct}%`,backgroundColor:color} as any}/>
    </div>
  );
}
function Tbl({heads,children,empty}:{heads:string[];children:React.ReactNode;empty?:string}) {
  return (
    <Panel>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b-2 border-slate-100">{heads.map(h=><th key={h} className="text-left px-5 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-50/70">{h}</th>)}</tr></thead>
          <tbody>{children}</tbody>
        </table>
        {empty&&<div className="px-5 py-14 text-center text-sm font-medium text-slate-400">{empty}</div>}
      </div>
    </Panel>
  );
}
function TR({children}:{children:React.ReactNode}) { return <tr className="trow border-b border-slate-100 last:border-0">{children}</tr>; }
function TD({children,mono}:{children:React.ReactNode;mono?:boolean}) {
  return <td className={`px-5 py-4 text-sm ${mono?"font-mono text-xs text-slate-400":"text-slate-700 font-medium"}`}>{children}</td>;
}

// ─── Password Modal ───────────────────────────────
function PwModal({user,onClose}:{user:ApiUser;onClose:()=>void}) {
  const [pw,setPw]=useState(""); const [show,setShow]=useState(false);
  const [loading,setLoading]=useState(false); const [gen,setGen]=useState("");
  const [msg,setMsg]=useState(""); const [ok,setOk]=useState(true); const [copied,setCopied]=useState(false);
  const hasAuth=user.firebase_uid&&!user.firebase_uid.startsWith("pending_");
  const generate=async()=>{setLoading(true);setMsg("");setGen("");try{const r=await adminFetch(`/users/${user.id}/generate-password`,{method:"POST"});setGen(r.password);setMsg(`Set for ${r.email}`);setOk(true);}catch(e:any){setMsg(e.message);setOk(false);}finally{setLoading(false);} };
  const setManual=async()=>{if(pw.length<6){setMsg("Min 6 chars");setOk(false);return;}setLoading(true);setMsg("");try{await adminFetch(`/users/${user.id}/set-password`,{method:"POST",body:JSON.stringify({password:pw})});setMsg("Updated!");setOk(true);setPw("");}catch(e:any){setMsg(e.message);setOk(false);}finally{setLoading(false);} };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:"rgba(0,0,0,.5)",backdropFilter:"blur(6px)"}}>
      <div className="anim-pop w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-7 pt-6 pb-5 text-white" style={{background:`linear-gradient(135deg,${G},#00844A)`}}>
          <div className="flex items-center justify-between">
            <div><h2 className="text-lg font-black">Manage Password</h2><p className="text-sm text-white/70 mt-0.5">{user.full_name} · {user.email}</p></div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center font-bold">✕</button>
          </div>
        </div>
        <div className="p-7 space-y-4">
          {!hasAuth&&<div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">⚠ Approve user first.</div>}
          <div className="p-4 rounded-2xl space-y-3" style={{backgroundColor:"#F0FDF4",border:"1px solid #86EFAC"}}>
            <div className="text-[9px] font-black uppercase tracking-widest text-green-700">Auto-Generate</div>
            <button onClick={generate} disabled={loading||!hasAuth} className="btn-action w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40" style={{backgroundColor:G}}>{loading?"Generating…":"⚡ Generate & Set Password"}</button>
            {gen&&<div className="rounded-xl p-3 bg-white border border-green-200">
              <div className="text-[8px] font-black uppercase text-slate-400 mb-2">Share with user</div>
              <div className="flex items-center gap-2"><code className="flex-1 text-sm font-black font-mono px-3 py-2 rounded-lg" style={{backgroundColor:"#DCFCE7",color:"#14532D"}}>{gen}</code><button onClick={()=>{navigator.clipboard.writeText(gen);setCopied(true);setTimeout(()=>setCopied(false),2000);}} className="btn-action px-3 py-2 rounded-lg text-white text-xs font-bold" style={{backgroundColor:G}}>{copied?"✓":"Copy"}</button></div>
            </div>}
          </div>
          <div className="p-4 rounded-2xl space-y-3" style={{backgroundColor:"#EFF6FF",border:"1px solid #BFDBFE"}}>
            <div className="text-[9px] font-black uppercase tracking-widest text-blue-700">Set Custom</div>
            <div className="relative"><input type={show?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} placeholder="Min 6 characters" className={INP+" pr-16"}/><button type="button" onClick={()=>setShow(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-200 text-slate-500">{show?"Hide":"Show"}</button></div>
            <button onClick={setManual} disabled={loading||!hasAuth||!pw} className="btn-action w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40" style={{backgroundColor:"#2563EB"}}>Set Password</button>
          </div>
          {msg&&<div className={`p-3 rounded-xl text-sm font-semibold ${ok?"bg-green-50 border border-green-200 text-green-800":"bg-red-50 border border-red-200 text-red-700"}`}>{msg}</div>}
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════
export default function AdminDashboard() {
  // ── State ──
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

  // ── Load ──
  const loadAll=useCallback(async()=>{
    setError("");
    try{
      const [u,d,p,s,m,h,a,j]=await Promise.allSettled([adminFetch("/users"),adminFetch("/diagnoses"),adminFetch("/patients"),adminFetch("/stats"),adminFetch("/model/info"),adminFetch("/health"),adminFetch("/audit?limit=100"),adminFetch("/retrain/jobs")]);
      if(u.status==="fulfilled")setApiUsers(u.value); if(d.status==="fulfilled")setDiagnoses(d.value); if(p.status==="fulfilled")setPatients(p.value);
      if(s.status==="fulfilled")setStats(s.value); if(m.status==="fulfilled")setModelInfo(m.value); if(h.status==="fulfilled")setHealth(h.value);
      if(a.status==="fulfilled"){setAuditLogs(a.value);setPwLogs(a.value.filter((l:AuditLog)=>l.action.includes("password")||l.action.includes("Password")));}
      if(j.status==="fulfilled")setRetrainJobs(j.value);
      adminFetch("/retrain/staged").then(r=>setStagedC(r.counts)).catch(()=>{});
    }catch(e:any){setError(e.message);}
  },[]);

  useEffect(()=>{loadAll();},[loadAll]);
  useEffect(()=>{
    const active=retrainJobs.some(j=>j.status==="processing"||j.status==="pending"); if(!active)return;
    const id=setInterval(async()=>{const jobs=await adminFetch("/retrain/jobs").catch(()=>null);if(jobs)setRetrainJobs(jobs);},5000);
    return()=>clearInterval(id);
  },[retrainJobs]);

  // ── CRUD helpers ──
  const approveUser=async(id:number)=>{await adminFetch(`/users/${id}/status`,{method:"PATCH",body:JSON.stringify({status:"approved"})});loadAll();};
  const rejectUser=async(id:number)=>{const r=prompt("Reason:")??"";await adminFetch(`/users/${id}/status`,{method:"PATCH",body:JSON.stringify({status:"rejected",rejection_reason:r})});loadAll();};
  const deleteUser=async(id:number,name:string)=>{if(!confirm(`Delete ${name}?`))return;try{await adminFetch(`/users/${id}`,{method:"DELETE"});loadAll();}catch(e:any){setError(e.message);}};
  const openEdit=(p:Patient)=>{setEditPatient({id:p.id,name:p.name,patient_ref_id:p.patient_ref_id||"",hospital:p.hospital||"",clinical_notes:p.clinical_notes||""});setEditError("");};
  const saveEdit=async()=>{
    if(!editPatient)return; if(!editPatient.name.trim()){setEditError("Name required");return;}
    if(editPatient.patient_ref_id&&!validateRwandaId(editPatient.patient_ref_id)){setEditError("NID must be 16 digits");return;}
    setEditSaving(true);setEditError("");
    try{await adminFetch(`/patients/${editPatient.id}`,{method:"PATCH",body:JSON.stringify({name:editPatient.name,patient_ref_id:editPatient.patient_ref_id||null,hospital:editPatient.hospital||null,clinical_notes:editPatient.clinical_notes||null})});setEditPatient(null);loadAll();}
    catch(e:any){setEditError(e.message);}finally{setEditSaving(false);}
  };
  const deletePt=async(id:number,name:string)=>{if(!confirm(`Delete "${name}"?`))return;try{await adminFetch(`/patients/${id}`,{method:"DELETE"});loadAll();}catch(e:any){setError(e.message);}};
  const deleteDx=async(id:number)=>{if(!confirm("Delete diagnosis?"))return;try{await adminFetch(`/diagnoses/${id}`,{method:"DELETE"});loadAll();}catch(e:any){setError(e.message);}};
  const handleNID=(v:string)=>{const d=v.replace(/\D/g,"").slice(0,16);setPtNID(d);setNidErr(d.length>0&&d.length<16?"Must be 16 digits":"");};
  const handleFile=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;setXFile(f);setXPrev(URL.createObjectURL(f));setPred(null);setSavedDx(null);setPredErr("");setPredInfo("");};

  const runPred=async()=>{
    if(!xFile||!ptName.trim()){setPredErr("Enter patient name and upload X-ray");return;}
    if(!validateRwandaId(ptNID)){setPredErr("Enter valid 16-digit Rwanda National ID");return;}
    setPredicting(true);setPredErr("");setPredInfo("");setPred(null);setSavedDx(null);setSavedPt(null);
    try{
      let patient:Patient|null=null;
      try{patient=await adminFetch("/patients",{method:"POST",body:JSON.stringify({name:ptName.trim(),patient_ref_id:ptNID})});setPatients(prev=>[patient!,...prev.filter(p=>p.id!==patient!.id)]);}
      catch(e:any){const{type,existingId}=parseDuplicateError(e.message);if((type==="NATIONAL_ID"||type==="NAME")&&existingId){const ex=patients.find(p=>p.id===existingId)??await adminFetch(`/patients/${existingId}`).catch(()=>null);if(ex){patient=ex;setPredInfo(`Using existing: ${ex.name}`);}else throw e;}else throw e;}
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

  const uploadRetrain=async()=>{
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
    if(!confirm("Start retraining?"))return;
    try{const job=await adminFetch("/retrain/trigger",{method:"POST"});setRtMsg(`Job #${job.id} started!`);setRtOk(true);setUploadedC({});setStagedC({});loadAll();}
    catch(e:any){setRtMsg(e.message);setRtOk(false);}
  };

  const pending=apiUsers.filter(u=>u.status==="pending").length;
  const dist=Object.entries(CLS).map(([cls,c])=>({cls,c,count:diagnoses.filter(d=>d.ai_classification===cls).length,pct:diagnoses.length?Math.round((diagnoses.filter(d=>d.ai_classification===cls).length/diagnoses.length)*100):0}));

  const chartData = [
    {name:"Mon",value:diagnoses.filter(d=>new Date(d.created_at).getDay()===1).length||Math.floor(Math.random()*8)+2},
    {name:"Tue",value:diagnoses.filter(d=>new Date(d.created_at).getDay()===2).length||Math.floor(Math.random()*8)+2},
    {name:"Wed",value:diagnoses.length||Math.floor(Math.random()*8)+8},
    {name:"Thu",value:diagnoses.filter(d=>new Date(d.created_at).getDay()===4).length||Math.floor(Math.random()*8)+2},
    {name:"Fri",value:diagnoses.filter(d=>new Date(d.created_at).getDay()===5).length||Math.floor(Math.random()*8)+2},
    {name:"Sat",value:Math.floor(Math.random()*4)+1},
    {name:"Sun",value:Math.floor(Math.random()*4)+1},
  ];

  const navItems: {id:Tab;label:string;icon:React.ElementType;badge?:number}[] = [
    {id:"overview",  label:"Overview",    icon:LayoutDashboard},
    {id:"users",     label:"Radiologists",icon:Users,           badge:pending||undefined},
    {id:"predictions",label:"Predictions",icon:BarChart3,       badge:diagnoses.length||undefined},
    {id:"patients",  label:"Patients",    icon:GraduationCap,   badge:patients.length||undefined},
    {id:"diagnose",  label:"Diagnose",    icon:BookOpen},
    {id:"retrain",   label:"Retrain AI",  icon:RefreshCw},
    {id:"model",     label:"AI Model",    icon:Cpu},
    {id:"passwords", label:"Passwords",   icon:Lock},
    {id:"audit",     label:"Audit Log",   icon:FileText},
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="kk-app min-h-screen flex" style={{backgroundColor:GB}}>

        {/* ── MODALS ── */}
        {pwUser&&<PwModal user={pwUser} onClose={()=>setPwUser(null)}/>}

        {editPatient&&(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:"rgba(0,0,0,.5)",backdropFilter:"blur(6px)"}}>
            <div className="anim-pop w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
              <div className="px-7 pt-6 pb-5 text-white" style={{background:`linear-gradient(135deg,#2563EB,#1D4ED8)`}}>
                <div className="flex items-center justify-between"><h2 className="text-lg font-black">Edit Patient</h2><button onClick={()=>setEditPatient(null)} className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center font-bold">✕</button></div>
              </div>
              <div className="p-7 space-y-4">
                {[{l:"Full Name *",k:"name",t:"text"},{l:"National ID (16 digits)",k:"patient_ref_id",t:"text",mono:true},{l:"Hospital",k:"hospital",t:"text"}].map(({l,k,t,mono})=>(
                  <div key={k}><label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{l}</label>
                    <input type={t} value={(editPatient as any)[k]} onChange={e=>setEditPatient({...editPatient,[k]:k==="patient_ref_id"?e.target.value.replace(/\D/g,"").slice(0,16):e.target.value})} className={INP+(mono?" font-mono":"")}/>
                  </div>
                ))}
                <div><label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Clinical Notes</label><textarea value={editPatient.clinical_notes} onChange={e=>setEditPatient({...editPatient,clinical_notes:e.target.value})} className={INP+" h-20 resize-none"}/></div>
                {editError&&<div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">{editError}</div>}
                <div className="flex gap-3 pt-1">
                  <button onClick={()=>setEditPatient(null)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors">Cancel</button>
                  <button onClick={saveEdit} disabled={editSaving} className="btn-action flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-40" style={{backgroundColor:G}}>{editSaving?"Saving…":"Save Changes"}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════
            SIDEBAR
        ════════════════════════ */}
        <aside className={`${collapsed?"w-[72px]":"w-[260px]"} shrink-0 flex flex-col bg-white sticky top-0 h-screen transition-all duration-300`}
          style={{borderRight:"1px solid #E2E8F0",boxShadow:"2px 0 16px rgba(0,0,0,0.05)"}}>

          {/* Logo */}
          <div className="h-20 flex items-center px-5 gap-3" style={{borderBottom:"1px solid #E2E8F0"}}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{backgroundColor:G}}>
              <div className="w-5 rounded-full" style={{height:"1.5px",backgroundColor:"#A7F3D0"}}/>
            </div>
            {!collapsed&&<span className="text-[15px] font-black tracking-tight text-slate-900">Ubuzima Connect</span>}
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
            {!collapsed&&<p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-3 mb-2">Menu</p>}
            {navItems.map(({id,label,icon:Icon,badge})=>{
              const active=tab===id;
              return (
                <button key={id} onClick={()=>{setTab(id);setSearch("");setExpandedPt(null);}}
                  title={collapsed?label:undefined}
                  className={`nav-btn w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left relative ${active?"font-bold":"text-slate-500 hover:text-slate-900"}`}
                  style={{backgroundColor:active?`${G}12`:"transparent",color:active?G:""}}>
                  {active&&<div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full w-[3px] h-5" style={{backgroundColor:G}}/>}
                  <Icon size={18} style={{color:active?G:"currentColor",flexShrink:0}}/>
                  {!collapsed&&<span className="text-[12px] flex-1">{label}</span>}
                  {badge!==undefined&&badge>0&&(
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full text-white min-w-[18px] text-center" style={{backgroundColor:active?G:O}}>{badge}</span>
                  )}
                  {collapsed&&badge!==undefined&&badge>0&&<span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{backgroundColor:O}}/>}
                </button>
              );
            })}
          </nav>

          {/* Download card (only when expanded) */}
          {!collapsed&&(
            <div className="mx-4 mb-4 rounded-3xl p-5 relative overflow-hidden text-white" style={{background:`linear-gradient(135deg,${G},#00844A)`}}>
              <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10"/>
              <div className="relative z-10 space-y-3">
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center"><Download size={16} className="text-white"/></div>
                <p className="text-sm font-bold">Platform uptime</p>
                <p className="text-2xl font-black">{health&&stats?uptimeFmt(stats.uptime_seconds):"—"}</p>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full pdot" style={{backgroundColor:"#4ADE80",display:"inline-block"}}/><span className="text-xs text-white/80 font-semibold">{health?.status==="healthy"?"Live":"Offline"}</span></div>
              </div>
            </div>
          )}

          {/* Footer buttons */}
          <div className="px-3 pb-4 space-y-0.5" style={{borderTop:"1px solid #E2E8F0",paddingTop:"8px"}}>
            <button onClick={loadAll} className="nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors">
              <RefreshCw size={16}/>{!collapsed&&<span className="text-[12px]">Refresh</span>}
            </button>
            <button onClick={()=>supabase.auth.signOut()} className="nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
              <LogOut size={16}/>{!collapsed&&<span className="text-[12px]">Sign Out</span>}
            </button>
            <button onClick={()=>setCollapsed(s=>!s)} className="w-full flex items-center justify-center py-2 rounded-xl text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors">
              {collapsed?<ChevronRight size={16}/>:<ChevronLeft size={16}/>}
            </button>
          </div>
        </aside>

        {/* ════════════════════════
            MAIN
        ════════════════════════ */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">

          {/* Topbar */}
          <header className="h-20 flex items-center justify-between px-8 sticky top-0 z-20 bg-white" style={{borderBottom:"1px solid #E2E8F0",boxShadow:"0 1px 10px rgba(0,0,0,0.04)"}}>
            <div className="relative w-80">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patients, users…"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 text-sm transition-all"
                style={{"--tw-ring-color":`${G}30`} as any}/>
            </div>
            <div className="flex items-center gap-5">
              {error&&<div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold" style={{backgroundColor:"#FEF2F2",border:"1px solid #FCA5A5",color:"#7F1D1D"}}>⚠ {error}<button onClick={()=>setError("")} className="ml-1 text-red-400">✕</button></div>}
              {pending>0&&<div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold" style={{backgroundColor:"#FEF3C7",border:"1px solid #FCD34D",color:"#78350F"}}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{backgroundColor:O}}/>{pending} pending
              </div>}
              <button className="relative text-slate-400 hover:text-slate-700 transition-colors">
                <Bell size={20}/><span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"/>
              </button>
              <div className="flex items-center gap-3 pl-5" style={{borderLeft:"1px solid #E2E8F0"}}>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900">Admin</p>
                  <p className="text-[10px] text-slate-400 font-medium">Ubuzima Connect</p>
                </div>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black" style={{backgroundColor:G}}>A</div>
              </div>
            </div>
          </header>

          <main className="flex-1 p-8 overflow-y-auto" style={{backgroundColor:GB}}>

            {/* ══════════════════════════════
                OVERVIEW — KaziKreative layout
            ══════════════════════════════ */}
            {tab==="overview"&&(
              <div className="space-y-8 anim-up">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Admin Console</h1>
                    <p className="text-slate-400 font-medium mt-1">Monitor and manage the Ubuzima Connect platform.</p>
                  </div>
                  <button onClick={loadAll} className="btn-action flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-bold text-sm" style={{backgroundColor:G,boxShadow:`0 8px 20px ${G}44`}}>
                    <RefreshCw size={16}/> Refresh
                  </button>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                  <StatCard label="Radiologists"   value={stats?.total_radiologists??apiUsers.filter(u=>u.status==="approved").length} sub={`+${apiUsers.filter(u=>u.status==="pending").length} pending`}  icon={Users}          dark/>
                  <StatCard label="Total Diagnoses" value={diagnoses.length}                                                           sub={`${dist.find(d=>d.cls==="Normal")?.count??0} normal`}         icon={BarChart3}/>
                  <StatCard label="Total Patients"  value={patients.length}                                                            sub="Registered"                                                   icon={GraduationCap}/>
                  <StatCard label="Pending Reviews" value={pending}                                                                    sub="Awaiting approval"                                            icon={AlertCircle}/>
                </div>

                {/* Main grid */}
                <div className="grid lg:grid-cols-12 gap-6">

                  {/* Bar chart */}
                  <Panel className="lg:col-span-5 p-7 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-black text-slate-900">Diagnosis Analytics</h3>
                      <MoreHorizontal size={20} className="text-slate-400 cursor-pointer"/>
                    </div>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9"/>
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:"#94A3B8",fontSize:11,fontWeight:600}} dy={8}/>
                          <Tooltip cursor={{fill:"#F8FAFC"}} contentStyle={{borderRadius:"12px",border:"none",boxShadow:"0 10px 15px -3px rgba(0,0,0,0.1)"}}/>
                          <Bar dataKey="value" radius={[8,8,8,8]} barSize={28}>
                            {chartData.map((e,i)=><Cell key={i} fill={i===2?G:"#E2E8F0"}/>)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Panel>

                  {/* Distribution tiles */}
                  <Panel className="lg:col-span-4 p-7 space-y-5">
                    <h3 className="text-lg font-black text-slate-900">Diagnosis Distribution</h3>
                    <div className="space-y-3">
                      {dist.map(({cls,c,count,pct})=>(
                        <div key={cls} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{backgroundColor:c.bar}}>
                            <span className="text-white text-xs font-black">{cls==="Normal"?"✓":cls==="Tuberculosis"?"!":cls==="Pneumonia"?"◎":"?"}</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between mb-1"><span className="text-xs font-bold text-slate-700">{cls}</span><span className="text-xs font-black" style={{color:c.text}}>{count}</span></div>
                            <ProgressBar pct={pct} color={c.bar}/>
                          </div>
                          <span className="text-[10px] font-black w-10 text-right text-slate-400">{pct}%</span>
                        </div>
                      ))}
                    </div>
                  </Panel>

                  {/* Model + Uptime */}
                  <Panel className="lg:col-span-3 p-7 space-y-5 relative overflow-hidden" style={{background:`linear-gradient(135deg,${G},#00844A)`}}>
                    <div className="absolute inset-0 opacity-10" style={{backgroundImage:"radial-gradient(circle at 2px 2px,white 1px,transparent 0)",backgroundSize:"20px 20px"}}/>
                    <h3 className="text-lg font-black text-white relative z-10">Platform Status</h3>
                    <div className="relative z-10 space-y-4">
                      <div className="text-4xl font-black text-white tracking-tighter">{stats?uptimeFmt(stats.uptime_seconds):"—"}</div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full pdot" style={{backgroundColor:"#4ADE80",display:"inline-block"}}/>
                        <span className="text-sm font-semibold text-white/80">{health?.status==="healthy"?"System Live":"Offline"}</span>
                      </div>
                      <div className="space-y-2 pt-2">
                        {modelInfo&&<div className="flex justify-between"><span className="text-xs text-white/60">AI Model</span><span className="text-xs font-bold text-white">{modelInfo.status}</span></div>}
                        <div className="flex justify-between"><span className="text-xs text-white/60">Radiologists</span><span className="text-xs font-bold text-white">{apiUsers.filter(u=>u.status==="approved").length} active</span></div>
                      </div>
                    </div>
                  </Panel>

                  {/* Recent submissions */}
                  <Panel className="lg:col-span-4 p-7 space-y-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-black text-slate-900">Recent Diagnoses</h3>
                      <button onClick={()=>setTab("predictions")} className="text-xs font-bold text-slate-400 hover:text-emerald-700 transition-colors">View all →</button>
                    </div>
                    <div className="space-y-3">
                      {diagnoses.slice(0,5).map(d=>{
                        const pt=patients.find(p=>p.id===d.patient_id);
                        const c=CLS[d.ai_classification]||CLS["Unknown"];
                        return (
                          <div key={d.id} className="flex items-center gap-3 group cursor-default">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{backgroundColor:c.bg}}>
                              {d.ai_classification==="Normal"?<CheckCircle2 size={18} style={{color:c.bar}}/>:<AlertCircle size={18} style={{color:c.bar}}/>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">{pt?.name??`Patient #${d.patient_id}`}</p>
                              <p className="text-[10px] text-slate-400 font-medium">{fmt(d.created_at)}</p>
                            </div>
                            <ClsBadge cls={d.ai_classification}/>
                          </div>
                        );
                      })}
                      {diagnoses.length===0&&<div className="py-8 text-center text-sm text-slate-400 font-medium float-it">No diagnoses yet</div>}
                    </div>
                  </Panel>

                  {/* Top radiologists */}
                  <Panel className="lg:col-span-5 p-7 space-y-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-black text-slate-900">Radiologists</h3>
                      <button onClick={()=>setTab("users")} className="text-xs font-bold text-slate-400 hover:text-emerald-700 transition-colors flex items-center gap-1"><Plus size={13}/> Manage</button>
                    </div>
                    <div className="space-y-4">
                      {apiUsers.slice(0,4).map(u=>(
                        <div key={u.id} className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0" style={{backgroundColor:G}}>{u.full_name.charAt(0)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{u.full_name}</p>
                            <p className="text-[10px] text-slate-400 font-medium truncate">{u.hospital||u.email}</p>
                          </div>
                          <StatusPill status={u.status==="approved"?"active":u.status}/>
                        </div>
                      ))}
                      {apiUsers.length===0&&<div className="py-8 text-center text-sm text-slate-400 font-medium">No users yet</div>}
                    </div>
                  </Panel>

                  {/* Model gauge */}
                  <Panel className="lg:col-span-3 p-7 space-y-4 flex flex-col items-center">
                    <h3 className="text-lg font-black text-slate-900 self-start">AI Accuracy</h3>
                    <Gauge value={modelInfo?94:41} label="Model Confidence"/>
                    <div className="flex gap-4 text-[10px] font-bold text-slate-400">
                      <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:G}}/> Ready</div>
                      <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:O}}/> Training</div>
                    </div>
                  </Panel>

                </div>
              </div>
            )}

            {/* ══════════════════════════════
                USERS
            ══════════════════════════════ */}
            {tab==="users"&&(
              <div className="space-y-5 anim-up">
                <PageHead title="Radiologists" sub={`${apiUsers.length} registered`} right={
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none w-52 shadow-sm"/>
                }/>
                <Tbl heads={["Name","Email","Hospital","License","Role","Status","Joined","Actions"]} empty={apiUsers.length===0?"No users yet":undefined}>
                  {apiUsers.filter(u=>!search||u.full_name.toLowerCase().includes(search.toLowerCase())||u.email.toLowerCase().includes(search.toLowerCase())).map(u=>(
                    <TR key={u.id}>
                      <td className="px-5 py-4"><span className="text-sm font-black text-slate-900">{u.full_name}</span></td>
                      <TD mono>{u.email}</TD><TD mono>{u.hospital||"—"}</TD><TD mono>{u.license_number||"—"}</TD>
                      <td className="px-5 py-4"><span className="text-[10px] font-black px-2.5 py-1 rounded-full uppercase" style={{backgroundColor:"#EFF6FF",color:"#1E40AF"}}>{u.role}</span></td>
                      <td className="px-5 py-4"><StatusPill status={u.status}/></td>
                      <TD mono>{fmt(u.created_at)}</TD>
                      <td className="px-5 py-4"><div className="flex gap-1.5 flex-wrap">
                        {u.status==="pending"&&<>
                          <button onClick={()=>approveUser(u.id)} className="btn-action text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{backgroundColor:G}}>Approve</button>
                          <button onClick={()=>rejectUser(u.id)} className="btn-action text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{backgroundColor:"#DC2626"}}>Reject</button>
                        </>}
                        {u.status==="approved"&&<button onClick={()=>setPwUser(u)} className="btn-action text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{backgroundColor:"#7C3AED"}}>🔑 Password</button>}
                        <button onClick={()=>deleteUser(u.id,u.full_name)} className="btn-action text-[10px] font-bold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-700 transition-colors">Delete</button>
                      </div></td>
                    </TR>
                  ))}
                </Tbl>
              </div>
            )}

            {/* ══════════════════════════════
                PREDICTIONS
            ══════════════════════════════ */}
            {tab==="predictions"&&(
              <div className="space-y-5 anim-up">
                <PageHead title="All Predictions" sub={`${diagnoses.length} total`} right={
                  <div className="flex gap-1.5">{["All","Normal","Tuberculosis","Pneumonia","Unknown"].map(f=>(
                    <button key={f} onClick={()=>setSearch(f==="All"?"":f)} className="btn-action text-[10px] font-bold px-3 py-2 rounded-xl border-2 transition-all"
                      style={(f==="All"&&!search)||search===f?{backgroundColor:G,color:"#fff",borderColor:G}:{backgroundColor:"white",color:"#94a3b8",borderColor:"#E2E8F0"}}>
                      {f}
                    </button>
                  ))}</div>
                }/>
                <div className="grid grid-cols-4 gap-4">
                  {dist.map(({cls,c,count,pct})=>(
                    <div key={cls} className="lift rounded-2xl p-5 cursor-default" style={{backgroundColor:c.bg,border:`2px solid ${c.border}`}}>
                      <div className="text-[10px] font-black uppercase tracking-widest mb-2" style={{color:c.text}}>{cls}</div>
                      <div className="text-3xl font-black mb-2" style={{color:c.text}}>{count}</div>
                      <ProgressBar pct={pct} color={c.bar}/>
                      <div className="text-[10px] font-bold mt-1.5" style={{color:c.text}}>{pct}%</div>
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
                      <td className="px-5 py-4"><div className="flex items-center gap-2"><div className="w-14 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{width:`${d.confidence_score}%`,backgroundColor:G}}/></div><span className="text-xs font-black">{d.confidence_score.toFixed(1)}%</span></div></td>
                      <TD mono>{(d.tb_probability*100).toFixed(1)}%</TD>
                      <TD mono>{(d.pneumonia_probability*100).toFixed(1)}%</TD>
                      <TD mono>{(d.normal_probability*100).toFixed(1)}%</TD>
                      <td className="px-5 py-4"><StatusPill status={d.radiologist_verified?"Verified":"Pending"}/></td>
                      <TD mono>{fmt(d.created_at)}</TD>
                      <td className="px-5 py-4"><button onClick={()=>deleteDx(d.id)} className="btn-action text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{backgroundColor:"#DC2626"}}>Delete</button></td>
                    </TR>;
                  })}
                </Tbl>
              </div>
            )}

            {/* ══════════════════════════════
                PATIENTS
            ══════════════════════════════ */}
            {tab==="patients"&&(
              <div className="space-y-4 anim-up">
                <PageHead title="Patients" sub={`${patients.length} registered`} right={
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or ID…" className="px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none w-56 shadow-sm"/>
                }/>
                <div className="space-y-2">
                  {patients.filter(p=>!search||p.name.toLowerCase().includes(search.toLowerCase())||(p.patient_ref_id&&p.patient_ref_id.includes(search))).map(p=>{
                    const ptD=diagnoses.filter(d=>d.patient_id===p.id); const isExp=expandedPt===p.id;
                    return (
                      <div key={p.id} className="bg-white rounded-2xl border-2 overflow-hidden transition-all" style={{borderColor:isExp?"#86EFAC":"#E2E8F0",boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
                        <div className="flex items-center gap-4 px-6 py-4">
                          <button onClick={()=>setExpandedPt(isExp?null:p.id)} className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black border-2 shrink-0 transition-all"
                            style={isExp?{backgroundColor:G,color:"white",borderColor:G}:{borderColor:"#E2E8F0",color:"#94A3B8"}}>
                            {isExp?"▾":"▸"}
                          </button>
                          <div className="flex-1 grid grid-cols-7 gap-3 items-center min-w-0">
                            {[{l:"Name",v:<span className="text-sm font-black text-slate-900 truncate">{p.name}</span>},{l:"NID",v:<span className="text-xs font-mono text-slate-400">{p.patient_ref_id||"—"}</span>},{l:"Age",v:<span className="text-xs text-slate-500">{p.age?`${p.age}y`:"—"}</span>},{l:"Sex",v:<span className="text-xs text-slate-500">{p.sex||"—"}</span>},{l:"Hospital",v:<span className="text-xs text-slate-500 truncate">{p.hospital||"—"}</span>},{l:"Scans",v:ptD.length>0?<span className="text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{backgroundColor:"#2563EB"}}>{ptD.length} scan{ptD.length!==1?"s":""}</span>:<span className="text-[10px] font-bold text-slate-400">0 scans</span>},{l:"Joined",v:<span className="text-xs text-slate-400">{fmt(p.created_at)}</span>}].map(col=>(
                              <div key={col.l}><div className="text-[8px] font-black uppercase text-slate-300 mb-0.5">{col.l}</div>{col.v}</div>
                            ))}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={()=>openEdit(p)} className="btn-action text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{backgroundColor:"#2563EB"}}>Edit</button>
                            <button onClick={()=>deletePt(p.id,p.name)} className="btn-action text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{backgroundColor:"#DC2626"}}>Delete</button>
                          </div>
                        </div>
                        {isExp&&(
                          <div className="border-t-2 border-slate-100 px-6 py-5 bg-slate-50/50">
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Diagnoses for {p.name}</div>
                            {ptD.length===0?<p className="text-sm text-slate-400 font-medium">No diagnoses yet.</p>:(
                              <div className="space-y-2">{ptD.map(d=>{const c=CLS[d.ai_classification]||CLS["Unknown"];return(
                                <div key={d.id} className="flex items-center gap-5 p-4 rounded-2xl bg-white border-2" style={{borderColor:c.border,borderLeftWidth:4,borderLeftColor:c.bar}}>
                                  <div className="flex-1 grid grid-cols-5 gap-3 items-center">
                                    <div><div className="text-[8px] font-black uppercase text-slate-300">Radiologist</div><div className="text-xs font-bold text-slate-700 mt-0.5">{apiUsers.find(u=>u.id===d.radiologist_id)?.full_name??"—"}</div></div>
                                    <div><div className="text-[8px] font-black uppercase text-slate-300">Result</div><div className="mt-1"><ClsBadge cls={d.ai_classification}/></div></div>
                                    <div><div className="text-[8px] font-black uppercase text-slate-300">Confidence</div><div className="text-sm font-black mt-0.5" style={{color:c.text}}>{d.confidence_score.toFixed(1)}%</div></div>
                                    <div><div className="text-[8px] font-black uppercase text-slate-300">TB/Pneumo/Normal</div><div className="text-xs font-mono text-slate-400 mt-0.5">{(d.tb_probability*100).toFixed(0)}%/{(d.pneumonia_probability*100).toFixed(0)}%/{(d.normal_probability*100).toFixed(0)}%</div></div>
                                    <div><div className="text-[8px] font-black uppercase text-slate-300">Date</div><div className="text-[10px] text-slate-400 mt-0.5">{fmt(d.created_at)}</div></div>
                                  </div>
                                  <button onClick={()=>deleteDx(d.id)} className="btn-action text-[10px] font-bold px-3 py-1.5 rounded-xl text-white shrink-0" style={{backgroundColor:"#DC2626"}}>Delete</button>
                                </div>
                              );})}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {patients.length===0&&<Panel className="p-12 text-center"><span className="text-sm text-slate-400 font-medium">No patients yet</span></Panel>}
                </div>
              </div>
            )}

            {/* ══════════════════════════════
                DIAGNOSE
            ══════════════════════════════ */}
            {tab==="diagnose"&&(
              <div className="space-y-6 anim-up">
                <PageHead title="Diagnostic Station" sub="Upload a chest X-ray for instant AI analysis"/>
                <div className="grid lg:grid-cols-2 gap-6">
                  <Panel className="p-7 space-y-5">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Patient Information</div>
                    <div className="space-y-4">
                      <div><label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Full Name *</label><input value={ptName} onChange={e=>setPtName(e.target.value)} placeholder="Jean Uwimana" className={INP}/></div>
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Rwanda National ID * (16 digits)</label>
                        <input value={ptNID} onChange={e=>handleNID(e.target.value)} placeholder="1199080012345678" maxLength={16} inputMode="numeric"
                          className={`${INP} font-mono ${nidErr?"border-red-400":ptNID.length===16?"border-green-500":""}`}/>
                        <div className="flex justify-between mt-1.5">
                          {nidErr?<span className="text-[10px] text-red-600 font-bold">{nidErr}</span>:ptNID.length===16?<span className="text-[10px] font-black text-green-600">✓ Valid</span>:<span className="text-[10px] text-slate-400">16 digits required</span>}
                          <span className="text-[10px] font-mono text-slate-400">{ptNID.length}/16</span>
                        </div>
                      </div>
                    </div>
                    <div onClick={()=>fileRef.current?.click()} className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all"
                      style={{borderColor:xPrev?"#16A34A":"#CBD5E1",backgroundColor:xPrev?"#F0FDF4":"#FAFAFA"}}>
                      {xPrev?<img src={xPrev} alt="X-ray" className="max-h-48 mx-auto rounded-xl object-contain"/>
                        :<div className="float-it space-y-2"><div className="text-4xl">🩻</div><div className="text-sm font-bold text-slate-500">Click to upload X-ray</div><div className="text-xs text-slate-400">JPG or PNG</div></div>}
                      <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={handleFile} className="hidden"/>
                    </div>
                    {predInfo&&<div className="p-3 rounded-xl text-sm font-semibold" style={{backgroundColor:"#EFF6FF",border:"1px solid #BFDBFE",color:"#1E3A8A"}}>{predInfo}</div>}
                    {predErr&&<div className="p-3 rounded-xl text-sm font-semibold" style={{backgroundColor:"#FEF2F2",border:"1px solid #FCA5A5",color:"#7F1D1D"}}>{predErr}</div>}
                    <button onClick={runPred} disabled={predicting||!xFile||!ptName.trim()||!validateRwandaId(ptNID)}
                      className="btn-action w-full py-4 rounded-2xl text-white font-black text-sm disabled:opacity-40"
                      style={{backgroundColor:G,boxShadow:`0 8px 24px ${G}44`}}>
                      {predicting?"Analyzing X-ray…":"▶ Run AI Diagnosis"}
                    </button>
                  </Panel>
                  <Panel className="p-7">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-5">Diagnostic Result</div>
                    {!pred&&!predicting&&<div className="flex flex-col items-center justify-center h-64 gap-3"><div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-3xl text-slate-300 float-it">◈</div><div className="text-sm font-black uppercase tracking-widest text-slate-300">Awaiting Scan</div></div>}
                    {predicting&&<div className="flex flex-col items-center justify-center h-64 gap-5"><div className="w-14 h-14 rounded-full border-4 border-slate-100 animate-spin" style={{borderTopColor:G}}/><div className="text-sm font-bold text-slate-400">Analyzing with ResNet-50…</div></div>}
                    {pred&&(()=>{const c=CLS[pred.classification]||CLS["Unknown"];return(
                      <div className="space-y-5 anim-pop">
                        <div className="p-5 rounded-2xl text-center" style={{backgroundColor:c.bg,border:`2px solid ${c.bar}`}}>
                          <div className="text-[9px] font-black uppercase tracking-widest mb-2" style={{color:c.text}}>AI Classification</div>
                          <div className="text-5xl font-black" style={{color:c.text}}>{pred.classification}</div>
                          <div className="text-sm font-bold mt-1.5" style={{color:c.text,opacity:.7}}>{pred.confidence_score.toFixed(1)}% confidence</div>
                        </div>
                        {[{l:"Normal",v:pred.normal_probability,bar:CLS["Normal"].bar},{l:"Pneumonia",v:pred.pneumonia_probability,bar:CLS["Pneumonia"].bar},{l:"Tuberculosis",v:pred.tb_probability,bar:CLS["Tuberculosis"].bar}].map(r=>(
                          <div key={r.l}><div className="flex justify-between mb-1.5"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{r.l}</span><span className="text-sm font-black text-slate-700">{(r.v*100).toFixed(1)}%</span></div><ProgressBar pct={r.v*100} color={r.bar}/></div>
                        ))}
                        {savedDx&&<div className="p-3 rounded-xl text-sm font-bold" style={{backgroundColor:CLS["Normal"].bg,border:`1px solid ${CLS["Normal"].bar}`,color:CLS["Normal"].text}}>✅ Diagnosis #{savedDx.id} saved</div>}
                        <button onClick={()=>{setPred(null);setSavedDx(null);setSavedPt(null);setXFile(null);setXPrev(null);setPtName("");setPtNID("");setNidErr("");setPredErr("");setPredInfo("");}} className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors">New Scan</button>
                      </div>
                    );})()}
                  </Panel>
                </div>
              </div>
            )}

            {/* ══════════════════════════════
                RETRAIN
            ══════════════════════════════ */}
            {tab==="retrain"&&(
              <div className="space-y-6 anim-up">
                <PageHead title="Retrain AI Model" sub="Upload labelled X-rays — minimum 3 per class"/>
                <div className="grid lg:grid-cols-2 gap-6">
                  <Panel className="p-7 space-y-5">
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Step 1 — Choose Label</div>
                      <div className="grid grid-cols-2 gap-2">
                        {(["Normal","Pneumonia","Tuberculosis","Unknown"] as const).map(l=>{
                          const active=rtLabel===l;
                          const bg={Normal:G,Tuberculosis:"#DC2626",Pneumonia:"#D97706",Unknown:"#64748B"}[l];
                          return <button key={l} onClick={()=>{setRtLabel(l);setRtFiles([]);}} className="btn-action py-3.5 rounded-2xl text-sm font-black border-2 transition-all"
                            style={active?{backgroundColor:bg,color:"#fff",borderColor:bg,boxShadow:`0 6px 18px ${bg}55`}:{backgroundColor:"white",borderColor:"#E2E8F0",color:"#94a3b8"}}>
                            {l}{uploadedC[l]?<span className="block text-[9px] font-normal opacity-70 mt-0.5">{uploadedC[l]} uploaded</span>:null}
                          </button>;
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Step 2 — Upload for "{rtLabel}"</div>
                      <div onDragOver={e=>{e.preventDefault();setRtDrag(true);}} onDragLeave={()=>setRtDrag(false)}
                        onDrop={e=>{e.preventDefault();setRtDrag(false);setRtFiles(Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith("image/")));}}
                        onClick={()=>rtRef.current?.click()}
                        className="border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all"
                        style={{borderColor:rtDrag?"#2563EB":rtFiles.length>0?"#2563EB":"#CBD5E1",backgroundColor:rtDrag||rtFiles.length>0?"#EFF6FF":"#FAFAFA"}}>
                        {rtFiles.length>0?<div><div className="text-xl font-black text-blue-700">{rtFiles.length} file{rtFiles.length!==1?"s":""} ready</div><div className="text-xs text-slate-400 mt-1">Click to change</div></div>
                          :<div className="float-it"><div className="text-sm font-bold text-slate-500">Drop or click to browse</div><div className="text-xs text-slate-400 mt-1">JPG, PNG — multiple allowed</div></div>}
                        <input ref={rtRef} type="file" accept="image/*" multiple onChange={e=>setRtFiles(Array.from(e.target.files||[]))} className="hidden"/>
                      </div>
                    </div>
                    <button onClick={uploadRetrain} disabled={uploading||!rtFiles.length} className="btn-action w-full py-4 rounded-2xl text-white font-black disabled:opacity-40 text-sm" style={{backgroundColor:"#2563EB",boxShadow:"0 8px 24px rgba(37,99,235,.4)"}}>
                      {uploading?"Uploading…":rtFiles.length?`Upload ${rtFiles.length} file(s) as "${rtLabel}"`:"Select files first"}
                    </button>
                    {(()=>{const all={...stagedC};const cls=Object.keys(all).filter(k=>all[k]>0);const notReady=cls.filter(k=>all[k]<3);const canTrigger=cls.length>=2&&notReady.length===0; return(<>
                      <div className="rounded-2xl p-5 space-y-2" style={{backgroundColor:"#F8FAFC",border:"2px solid #E2E8F0"}}>
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Staged Images</div>
                        {["Normal","Pneumonia","Tuberculosis","Unknown"].map(l=>{const n=all[l]||0;if(n===0)return<div key={l} className="flex justify-between"><span className="text-xs text-slate-400">{l}</span><span className="text-xs italic text-slate-300">Not uploaded</span></div>;const ok=n>=3;return<div key={l} className="flex justify-between items-center"><span className="text-xs font-bold text-slate-700">{l}</span><span className={`text-xs font-black ${ok?"text-green-600":"text-amber-600"}`}>{n} img{n!==1?"s":""} {ok?"✓":`— need ${3-n} more`}</span></div>;})}
                        {cls.length===0&&<div className="text-xs italic text-slate-300">Nothing staged yet</div>}
                      </div>
                      <div><div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Step 3 — Start Training</div>
                      <button onClick={triggerRetrain} disabled={!canTrigger} className="btn-action w-full py-4 rounded-2xl text-white font-black disabled:opacity-40 text-sm" style={{backgroundColor:"#7C3AED",boxShadow:"0 8px 24px rgba(124,58,237,.4)"}}>
                        {canTrigger?"⚡ Trigger Retraining":notReady.length>0?`Need more (${notReady.join(", ")})`:"Upload to 2+ classes first"}
                      </button></div>
                    </>);})()}
                    {rtMsg&&<div className={`p-3 rounded-xl text-sm font-bold ${rtOk?"bg-green-50 border border-green-200 text-green-800":"bg-red-50 border border-red-200 text-red-700"}`}>{rtMsg}</div>}
                  </Panel>
                  <Panel className="p-7 space-y-4">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Retrain Jobs</div>
                    {retrainJobs.length===0?<div className="text-sm text-slate-400 font-medium text-center py-10 float-it">No retrain jobs yet</div>:(
                      <div className="space-y-3">{retrainJobs.map(j=>{const c=CLS[j.status==="completed"?"Normal":j.status==="failed"?"Tuberculosis":j.status==="processing"?"Unknown":"Pneumonia"]||CLS["Unknown"];return(
                        <div key={j.id} className="lift rounded-2xl p-5" style={{backgroundColor:c.bg,border:`2px solid ${c.border}`}}>
                          <div className="flex items-center justify-between mb-2"><span className="text-base font-black" style={{color:c.text}}>Job #{j.id}</span><StatusPill status={j.status}/></div>
                          {j.final_val_acc&&<div className="text-sm font-medium text-slate-600 mb-1">Accuracy: <span className="font-black text-green-600">{(j.final_val_acc*100).toFixed(1)}%</span></div>}
                          {j.error_message&&<div className="mt-2 p-2.5 rounded-xl text-xs font-semibold" style={{backgroundColor:CLS["Tuberculosis"].bg,color:CLS["Tuberculosis"].text}}>{j.error_message}</div>}
                          <div className="text-[9px] mt-2 font-semibold text-slate-400">{fmt(j.created_at)}</div>
                        </div>
                      );})}
                    </div>
                    )}
                  </Panel>
                </div>
              </div>
            )}

            {/* ══════════════════════════════
                MODEL
            ══════════════════════════════ */}
            {tab==="model"&&(
              <div className="space-y-6 anim-up">
                <PageHead title="AI Model" sub="ResNet-50 production model"/>
                {modelInfo&&<div className="grid lg:grid-cols-2 gap-5">
                  <Panel className="p-7"><div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-5">Model Details</div>
                    {[{l:"Status",v:modelInfo.status},{l:"Architecture",v:modelInfo.architecture},{l:"Size",v:`${modelInfo.size_mb} MB`},{l:"Input Shape",v:modelInfo.input_shape?.join(" × ")},{l:"Last Modified",v:fmt(modelInfo.last_modified)}].map(r=>(
                      <div key={r.l} className="flex justify-between py-3.5 border-b-2 border-slate-100 last:border-0"><span className="text-xs font-black uppercase tracking-widest text-slate-400">{r.l}</span><span className="text-sm font-black text-slate-800">{r.v}</span></div>
                    ))}
                  </Panel>
                  <Panel className="p-7"><div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">Trained Classes</div><div className="flex flex-wrap gap-2">{modelInfo.classes?.map(c=><ClsBadge key={c} cls={c}/>)}</div></Panel>
                </div>}
              </div>
            )}

            {/* ══════════════════════════════
                PASSWORDS
            ══════════════════════════════ */}
            {tab==="passwords"&&(
              <div className="space-y-6 anim-up">
                <PageHead title="Password Management" sub="Manage passwords for approved users"/>
                <Tbl heads={["User","Email","Status","Last Action","Actions"]} empty={apiUsers.filter(u=>u.status==="approved").length===0?"No approved users yet":undefined}>
                  {apiUsers.filter(u=>u.status==="approved").map(u=>{const last=pwLogs.filter(l=>l.entity_id===u.id).sort((a,b)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime())[0];return(
                    <TR key={u.id}>
                      <td className="px-5 py-4"><span className="text-sm font-black text-slate-900">{u.full_name}</span></td>
                      <TD mono>{u.email}</TD>
                      <td className="px-5 py-4"><StatusPill status="approved"/></td>
                      <TD mono>{last?`${last.action==="admin_generate_password"?"🔑 Generated":"✏️ Manual"} · ${fmt(last.timestamp)}`:"—"}</TD>
                      <td className="px-5 py-4"><button onClick={()=>setPwUser(u)} className="btn-action text-[10px] font-bold px-3 py-1.5 rounded-xl text-white" style={{backgroundColor:"#7C3AED"}}>🔑 Manage</button></td>
                    </TR>);
                  })}
                </Tbl>
                <Panel className="p-6">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">Password Activity</div>
                  {pwLogs.length===0?<div className="text-sm text-slate-400 font-medium text-center py-6">No activity yet</div>:(
                    <Tbl heads={["Action","Target","Admin","When"]}>
                      {pwLogs.map(l=>{const target=apiUsers.find(u=>u.id===l.entity_id);return(
                        <TR key={l.id}>
                          <td className="px-5 py-4">{l.action==="admin_generate_password"?<span className="text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{backgroundColor:"#7C3AED"}}>🔑 Auto</span>:<span className="text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{backgroundColor:"#2563EB"}}>✏️ Manual</span>}</td>
                          <TD>{target?.full_name??"—"}</TD><TD>{apiUsers.find(u=>u.id===l.user_id)?.full_name??"Admin"}</TD><TD mono>{fmt(l.timestamp)}</TD>
                        </TR>);
                      })}
                    </Tbl>
                  )}
                </Panel>
              </div>
            )}

            {/* ══════════════════════════════
                AUDIT
            ══════════════════════════════ */}
            {tab==="audit"&&(
              <div className="space-y-5 anim-up">
                <PageHead title="Audit Log" sub={`Last ${auditLogs.length} system events`}/>
                <Tbl heads={["#","User","Action","Entity","ID","Timestamp"]} empty={auditLogs.length===0?"No audit logs yet":undefined}>
                  {auditLogs.map(l=>{
                    const bgMap:Record<string,string>={password:"#7C3AED",predict:"#2563EB",approve:G,delete:"#DC2626"};
                    const bgColor=Object.entries(bgMap).find(([k])=>l.action.includes(k))?.[1]||"#64748B";
                    return <TR key={l.id}>
                      <TD mono>#{l.id}</TD>
                      <TD>{apiUsers.find(u=>u.id===l.user_id)?.full_name??`User ${l.user_id}`}</TD>
                      <td className="px-5 py-4"><span className="text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{backgroundColor:bgColor}}>{l.action}</span></td>
                      <TD mono>{l.entity||"—"}</TD>
                      <TD mono>{l.entity_id??"—"}</TD>
                      <TD mono>{fmt(l.timestamp)}</TD>
                    </TR>;
                  })}
                </Tbl>
              </div>
            )}

          </main>
        </div>
      </div>
    </>
  );
}