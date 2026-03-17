// components/HospitalAdminDashboard.tsx
// Super admin dashboard — manages hospital applications + sees live stats per hospital
// byakwelianiela@gmail.com only
// Uses localStorage to persist login across refreshes
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseConfig';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

const DARK_GREEN = '#1C5438';
const BG_APP     = '#F2F4F7';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; font-family: 'Plus Jakarta Sans', sans-serif; }
::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
@keyframes slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
@keyframes pdot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.5)} }
.anim-in { animation:slideUp .38s cubic-bezier(.22,1,.36,1) both; }
.panel-card { background:#fff; border-radius:28px; border:1px solid #F1F5F9; box-shadow:0 4px 30px rgba(0,0,0,.03); }
.btn-s { transition:transform .15s ease,filter .15s ease; }
.btn-s:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(1.06); }
.trow { transition:background .1s ease; }
.trow:hover { background:#F7FDF9; }
.pdot { animation:pdot 2s ease-in-out infinite; }
`;

// ── Types ──
interface Application {
  id: number; ref_number: string; name: string; type: string;
  email: string; phone: string; moh_license: string;
  province: string; district: string; address: string;
  contact_name: string; contact_role: string;
  num_radiologists: string; num_machines: string; monthly_volume: string;
  notes: string; status: string; meet_link: string | null;
  rejection_reason: string | null; logo_base64: string | null;
  created_at: string;
}

interface Hospital {
  id: number; name: string; type: string; email: string; phone: string;
  moh_license: string; website: string; province: string; district: string;
  address: string; contact_name: string; contact_role: string;
  logo_base64: string | null; num_radiologists: string; num_machines: string;
  monthly_volume: string; is_active: boolean; created_at: string; approved_at: string;
}

interface HospitalStats {
  hospital_id: number; hospital_name: string;
  radiologists: { total: number; approved: number; pending: number };
  patients: { total: number };
  diagnoses: { total: number; verified: number; verification_rate: number; breakdown: Record<string, number> };
  last_activity: string | null;
}

interface Radiologist {
  id: number; full_name: string; email: string; specialization: string;
  license_number: string; years_experience: number; status: string;
  created_at: string; approved_at: string | null; total_diagnoses: number;
}

interface GlobalStats {
  total_applications: number; pending_review: number;
  active_hospitals: number; total_radiologists: number;
}

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pending:   { bg: '#FEF3C7', text: '#92400E' },
  reviewing: { bg: '#DBEAFE', text: '#1E40AF' },
  meeting:   { bg: '#EDE9FE', text: '#5B21B6' },
  approved:  { bg: '#DCFCE7', text: '#166534' },
  rejected:  { bg: '#FEE2E2', text: '#991B1B' },
};

const CLS_COLOR: Record<string, string> = {
  Normal: '#38A169', Pneumonia: '#DD6B20', TB: '#E53E3E', Unknown: '#A0AEC0',
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] || { bg: '#F1F5F9', text: '#475569' };
  return <span className="inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-full capitalize" style={{ backgroundColor: c.bg, color: c.text }}>{status}</span>;
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`panel-card ${className}`}>{children}</div>;
}

type MainTab = 'overview' | 'applications' | 'hospitals';

export default function HospitalAdminDashboard() {
  const navigate = useNavigate();
  const [token, setToken]   = useState<string>(() => localStorage.getItem('hosp_admin_token') || '');
  const [authed, setAuthed] = useState<boolean>(() => !!localStorage.getItem('hosp_admin_token'));
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass]   = useState('');
  const [loginErr, setLoginErr]     = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const [tab, setTab]         = useState<MainTab>('overview');
  const [appFilter, setAppFilter] = useState<'all'|'pending'|'approved'>('all');
  const [apps, setApps]       = useState<Application[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [hospitalStats, setHospitalStats] = useState<Record<number, HospitalStats>>({});
  const [hospitalRads, setHospitalRads]   = useState<Record<number, Radiologist[]>>({});

  const [selected, setSelected]     = useState<Application | null>(null);
  const [selectedHosp, setSelectedHosp] = useState<Hospital | null>(null);
  const [loadingStats, setLoadingStats]  = useState<number | null>(null);

  const [meetLink, setMeetLink]         = useState('');
  const [meetLinkErr, setMeetLinkErr]   = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]             = useState('');

  // Create Admin modal
  const [createAdminHosp, setCreateAdminHosp] = useState<Hospital | null>(null);
  const [adminEmail, setAdminEmail]     = useState('');
  const [adminName, setAdminName]       = useState('');
  const [adminPass, setAdminPass]       = useState('');
  const [adminErr, setAdminErr]         = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminCreated, setAdminCreated] = useState<{ email: string; hospital_name: string } | null>(null);

  // Hospital admin info per hospital
  const [hospitalAdmins, setHospitalAdmins] = useState<Record<number, { id: number; email: string; full_name: string; last_login: string | null } | null>>({});

  // Change admin password modal
  const [changePwdHospId, setChangePwdHospId] = useState<number | null>(null);
  const [newPwd, setNewPwd]     = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdErr, setPwdErr]     = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  const hdr = useCallback((): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
  }), [token]);

  const fetchData = useCallback(async (t: string) => {
    const h = { Authorization: `Bearer ${t}` };
    try {
      const [appsRes, hospitalsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/hospital/applications`, { headers: h }),
        fetch(`${API_BASE}/hospitals`, { headers: h }),
        fetch(`${API_BASE}/hospitals/stats/summary`, { headers: h }),
      ]);
      if (appsRes.ok) setApps(await appsRes.json());
      if (hospitalsRes.ok) setHospitals(await hospitalsRes.json());
      if (statsRes.ok) setGlobalStats(await statsRes.json());
    } catch (e: any) { setError(e.message); }
  }, []);

  const sendForgot = async () => {
    if (!loginEmail) { setLoginErr('Enter your email address first'); return; }
    setForgotLoading(true); setLoginErr('');
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
      redirectTo: window.location.origin + '/reset-password',
    });
    setForgotLoading(false);
    if (error) { setLoginErr(error.message); return; }
    setForgotSent(true);
  };

  const validateMeetLink = (link: string) => {
    if (!link) { setMeetLinkErr('Meet link is required'); return false; }
    const pattern = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
    if (!pattern.test(link.trim())) {
      setMeetLinkErr('Invalid format. Must be: https://meet.google.com/xxx-xxxx-xxx');
      return false;
    }
    setMeetLinkErr('');
    return true;
  };

  const fetchHospitalStats = async (hospitalId: number) => {
    setLoadingStats(hospitalId);
    try {
      const [statsRes, radsRes, adminRes] = await Promise.all([
        fetch(`${API_BASE}/hospitals/${hospitalId}/stats`,       { headers: hdr() }),
        fetch(`${API_BASE}/hospitals/${hospitalId}/radiologists`,{ headers: hdr() }),
        fetch(`${API_BASE}/hospitals/${hospitalId}/admin`,       { headers: hdr() }),
      ]);
      if (statsRes.ok)  { const s = await statsRes.json(); setHospitalStats(prev => ({ ...prev, [hospitalId]: s })); }
      if (radsRes.ok)   { const r = await radsRes.json(); setHospitalRads(prev  => ({ ...prev, [hospitalId]: r })); }
      if (adminRes.ok)  { const a = await adminRes.json(); setHospitalAdmins(prev => ({ ...prev, [hospitalId]: a.admin })); }
    } catch (e: any) { setError(e.message); }
    finally { setLoadingStats(null); }
  };

  // On mount: refresh Supabase session to get a fresh token (prevents 401 from stale token)
  useEffect(() => {
    if (!authed) return;
    supabase.auth.getSession().then(({ data }) => {
      const t = data.session?.access_token;
      if (t) {
        localStorage.setItem('hosp_admin_token', t);
        setToken(t);
        fetchData(t);
      } else {
        localStorage.removeItem('hosp_admin_token');
        setToken(''); setAuthed(false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doLogin = async () => {
    setLoginErr(''); setLoginLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPass });
      if (error || !data.session) { setLoginErr('Invalid credentials.'); return; }
      const t = data.session.access_token;
      const test = await fetch(`${API_BASE}/hospital/applications`, { headers: { Authorization: `Bearer ${t}` } });
      if (!test.ok) { setLoginErr('Access denied. Super admin credentials required.'); await supabase.auth.signOut(); return; }
      localStorage.setItem('hosp_admin_token', t);
      setToken(t); setAuthed(true);
      fetchData(t);
    } catch (e: any) { setLoginErr(e.message); }
    finally { setLoginLoading(false); }
  };

  const signOut = async () => {
    localStorage.removeItem('hosp_admin_token');
    setToken(''); setAuthed(false);
    await supabase.auth.signOut();
  };

  const updateStatus = async (id: number, status: string, extra: Record<string, string> = {}) => {
    setActionLoading(true);
    try {
      await fetch(`${API_BASE}/hospital/applications/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...hdr() },
        body: JSON.stringify({ status, ...extra }),
      });
      await fetchData(token);
      setSelected(null); setMeetLink(''); setMeetNotes(''); setMeetLinkErr(''); setRejectReason('');
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const approveApp = async (id: number) => {
    if (!confirm('Approve this hospital and create their account?')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/hospital/applications/${id}/approve`, {
        method: 'POST', headers: hdr(),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
      const hospital = await res.json();
      await fetchData(token);
      setSelected(null);
      // Immediately open the Create Admin modal for the newly approved hospital
      setAdminCreated(null); setAdminErr(''); setAdminEmail(''); setAdminName(''); setAdminPass('');
      setCreateAdminHosp(hospital);
      setTab('hospitals');
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const createAdmin = async () => {
    setAdminErr(''); setAdminLoading(true);
    try {
      const res = await fetch(`${API_BASE}/hospitals/${createAdminHosp!.id}/create-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...hdr() },
        body: JSON.stringify({ email: adminEmail, full_name: adminName, password: adminPass }),
      });
      const data = await res.json();
      if (!res.ok) { setAdminErr(data.detail || 'Failed'); return; }
      setAdminCreated({ email: adminEmail, hospital_name: createAdminHosp!.name });
      setAdminEmail(''); setAdminName(''); setAdminPass('');
    } catch (e: any) { setAdminErr(e.message); }
    finally { setAdminLoading(false); }
  };

  const changeAdminPassword = async () => {
    if (!changePwdHospId) return;
    setPwdErr(''); setPwdLoading(true);
    try {
      const res = await fetch(`${API_BASE}/hospitals/${changePwdHospId}/admin-password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...hdr() },
        body: JSON.stringify({ password: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) { setPwdErr(data.detail || 'Failed to update password'); return; }
      setPwdSuccess('Password updated successfully!');
      setNewPwd('');
      setTimeout(() => { setChangePwdHospId(null); setPwdSuccess(''); }, 2200);
    } catch (e: any) { setPwdErr(e.message); }
    finally { setPwdLoading(false); }
  };

  const removeLogo = async (h: Hospital) => {
    if (!confirm(`Remove logo for "${h.name}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/hospitals/${h.id}/logo`, { method: 'DELETE', headers: hdr() });
      if (!res.ok) { const e = await res.json(); setError(e.detail); return; }
      setHospitals(prev => prev.map(x => x.id === h.id ? { ...x, logo_base64: null } : x));
    } catch (e: any) { setError(e.message); }
  };

  const deleteHospital = async (h: Hospital) => {
    if (!confirm(`⚠️ PERMANENTLY DELETE "${h.name}"?\n\nThis will delete:\n• The hospital admin account\n• All radiologists\n• All patients and diagnoses\n\nThis CANNOT be undone.`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/hospitals/${h.id}`, { method: 'DELETE', headers: hdr() });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Delete failed'); return; }
      setSelectedHosp(null);
      await fetchData(token);
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-RW', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const fmtFull = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-RW', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filteredApps = apps.filter(a => {
    if (appFilter === 'pending') return ['pending', 'reviewing', 'meeting'].includes(a.status);
    if (appFilter === 'approved') return a.status === 'approved';
    return true;
  });

  // ── LOGIN ──
  if (!authed) {
    return (
      <>
        <style>{CSS}</style>
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-900 rounded-2xl mb-3">
                <div className="w-5 h-[1.5px] rounded-full bg-emerald-100" />
              </div>
              <h2 className="text-xl font-black text-gray-900">Super Admin Portal</h2>
              <p className="text-xs text-gray-400 mt-1">Hospital Partnership Management</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-0.5">Email</label>
                <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  placeholder="byakwelianiela@gmail.com"
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-gray-900 text-xs font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-0.5">Password</label>
                <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doLogin()} placeholder="••••••••"
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-gray-900 text-xs font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all" />
              </div>
              {loginErr && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-semibold">{loginErr}</div>}

              {!forgotMode ? (
                <>
                  <button onClick={doLogin} disabled={loginLoading}
                    className="btn-s w-full py-3.5 bg-emerald-900 hover:bg-emerald-800 text-white font-bold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2 mt-1">
                    {loginLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in…</> : 'Sign In →'}
                  </button>
                  <button onClick={() => { setForgotMode(true); setLoginErr(''); }}
                    className="w-full mt-2 text-[10px] font-bold text-emerald-600 hover:text-emerald-800 transition-colors text-center">
                    Forgot password?
                  </button>
                </>
              ) : forgotSent ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 font-semibold text-center">
                  ✅ Reset link sent to <strong>{loginEmail}</strong>.<br/>Check your inbox and click the link.
                </div>
              ) : (
                <>
                  <button onClick={sendForgot} disabled={forgotLoading}
                    className="btn-s w-full py-3.5 bg-emerald-900 hover:bg-emerald-800 text-white font-bold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2 mt-1">
                    {forgotLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending…</> : 'Send Reset Link →'}
                  </button>
                  <button onClick={() => { setForgotMode(false); setForgotSent(false); setLoginErr(''); }}
                    className="w-full mt-2 text-[10px] font-bold text-gray-400 hover:text-gray-600 transition-colors text-center">
                    ← Back to Sign In
                  </button>
                </>
              )}
            </div>
            <button onClick={() => navigate('/')} className="w-full mt-4 text-[9px] font-bold uppercase tracking-widest text-gray-300 hover:text-gray-500 transition-colors text-center">
              ← Back to portal
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── MAIN DASHBOARD ──
  const navItems: { id: MainTab; label: string; badge?: number }[] = [
    { id: 'overview',     label: 'Overview' },
    { id: 'applications', label: 'Applications', badge: apps.filter(a => ['pending','reviewing','meeting'].includes(a.status)).length || undefined },
    { id: 'hospitals',    label: 'Active Hospitals', badge: hospitals.length || undefined },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="min-h-screen flex text-slate-800" style={{ backgroundColor: BG_APP }}>

        {/* ── Sidebar ── */}
        <aside className="w-[240px] shrink-0 flex flex-col sticky top-4 h-[calc(100vh-2rem)] bg-white m-4 rounded-[32px] shadow-sm z-30">
          <div className="h-[80px] flex items-center px-6 gap-2.5">
            <div className="w-7 h-7 bg-emerald-900 rounded-lg flex items-center justify-center shrink-0">
              <div className="w-3.5 h-[1.5px] rounded-full bg-emerald-100" />
            </div>
            <div>
              <div className="text-xs font-black text-slate-900 leading-tight">Ubuzima Connect</div>
              <div className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">Super Admin</div>
            </div>
          </div>
          <nav className="flex-1 px-4 space-y-1">
            {navItems.map(({ id, label, badge }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all ${tab === id ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-500 hover:bg-slate-50 font-semibold'} text-[13px]`}>
                {label}
                {badge !== undefined && badge > 0 && (
                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-md text-white" style={{ backgroundColor: DARK_GREEN }}>{badge}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="px-4 pb-4 space-y-2">
            <button onClick={() => fetchData(token)} className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl text-slate-400 hover:bg-slate-50 text-xs font-semibold transition-colors">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
              Refresh
            </button>
            <button onClick={signOut} className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              Sign Out
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-[80px] flex items-center justify-between px-8 sticky top-0 z-20">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {tab === 'overview' ? 'Overview' : tab === 'applications' ? 'Hospital Applications' : 'Active Hospitals'}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Hospital Partnership Dashboard · byakwelianiela@gmail.com</p>
            </div>
            {error && (
              <div className="px-4 py-2 rounded-full text-xs font-semibold bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
                ⚠ {error}
                <button onClick={() => setError('')} className="font-bold">✕</button>
              </div>
            )}
          </header>

          <main className="flex-1 px-8 pb-8 space-y-6">

            {/* ══ OVERVIEW ══ */}
            {tab === 'overview' && (
              <div className="space-y-6 anim-in">
                {/* Global stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {globalStats && [
                    { n: globalStats.total_applications, l: 'Total Applications',    dark: true },
                    { n: globalStats.pending_review,     l: 'Pending Review',        dark: true },
                    { n: globalStats.active_hospitals,   l: 'Active Hospitals',      dark: false },
                    { n: globalStats.total_radiologists, l: 'Linked Radiologists',   dark: false },
                  ].map(s => (
                    <div key={s.l} className={`rounded-[28px] p-6 ${s.dark ? 'text-white' : 'bg-white border border-slate-100'}`}
                      style={s.dark ? { backgroundColor: DARK_GREEN } : {}}>
                      <div className="text-4xl font-black tracking-tight mb-1" style={!s.dark ? { color: DARK_GREEN } : {}}>{s.n}</div>
                      <div className={`text-xs font-semibold ${s.dark ? 'text-white/60' : 'text-slate-400'}`}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Pending applications quick view */}
                <Panel className="p-6">
                  <div className="flex items-center justify-between mb-5">
                    <p className="font-bold text-slate-800">Pending Applications</p>
                    <button onClick={() => setTab('applications')} className="text-[11px] border border-slate-200 px-3 py-1.5 rounded-full text-slate-500 font-medium hover:bg-slate-50">
                      View all →
                    </button>
                  </div>
                  <div className="space-y-3">
                    {apps.filter(a => ['pending','reviewing','meeting'].includes(a.status)).slice(0, 5).map(a => (
                      <div key={a.id} className="flex items-center gap-4 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => { setSelected(a); setTab('applications'); }}>
                        {a.logo_base64
                          ? <img src={a.logo_base64} alt="" className="w-9 h-9 rounded-xl object-contain border border-slate-200 p-0.5 bg-white" />
                          : <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-black">{a.name.charAt(0)}</div>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{a.name}</p>
                          <p className="text-[10px] text-slate-400">{a.district}, {a.province} · {fmt(a.created_at)}</p>
                        </div>
                        <StatusBadge status={a.status} />
                      </div>
                    ))}
                    {apps.filter(a => ['pending','reviewing','meeting'].includes(a.status)).length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-6">No pending applications</p>
                    )}
                  </div>
                </Panel>

                {/* Active hospitals summary */}
                <Panel className="p-6">
                  <div className="flex items-center justify-between mb-5">
                    <p className="font-bold text-slate-800">Active Hospitals</p>
                    <button onClick={() => setTab('hospitals')} className="text-[11px] border border-slate-200 px-3 py-1.5 rounded-full text-slate-500 font-medium hover:bg-slate-50">
                      View details →
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {hospitals.map(h => {
                      const s = hospitalStats[h.id];
                      return (
                        <div key={h.id} className="p-4 rounded-2xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all cursor-pointer"
                          onClick={() => { setSelectedHosp(h); setTab('hospitals'); }}>
                          <div className="flex items-center gap-3 mb-3">
                            {h.logo_base64
                              ? <img src={h.logo_base64} alt="" className="w-9 h-9 rounded-xl object-contain border border-slate-100 p-0.5" />
                              : <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-black">{h.name.charAt(0)}</div>
                            }
                            <div>
                              <p className="text-sm font-bold text-slate-800">{h.name}</p>
                              <p className="text-[10px] text-slate-400">{h.district}, {h.province}</p>
                            </div>
                          </div>
                          {s ? (
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { n: s.radiologists.approved, l: 'Radiologists' },
                                { n: s.patients.total,        l: 'Patients' },
                                { n: s.diagnoses.total,       l: 'Diagnoses' },
                              ].map(stat => (
                                <div key={stat.l} className="bg-white rounded-xl p-2.5 text-center border border-slate-50">
                                  <div className="text-lg font-black text-slate-900">{stat.n}</div>
                                  <div className="text-[9px] text-slate-400 font-semibold">{stat.l}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-300 text-center py-2">Loading stats…</div>
                          )}
                        </div>
                      );
                    })}
                    {hospitals.length === 0 && <p className="col-span-2 text-sm text-slate-400 text-center py-6">No active hospitals yet</p>}
                  </div>
                </Panel>
              </div>
            )}

            {/* ══ APPLICATIONS ══ */}
            {tab === 'applications' && (
              <div className="space-y-4 anim-in">
                {/* Filter tabs */}
                <div className="flex gap-2">
                  {(['all', 'pending', 'approved'] as const).map(f => (
                    <button key={f} onClick={() => setAppFilter(f)}
                      className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${appFilter === f ? 'text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      style={appFilter === f ? { backgroundColor: DARK_GREEN } : {}}>
                      {f === 'all' ? 'All' : f === 'pending' ? 'Pending / In Review' : 'Approved'}
                      {f === 'pending' && apps.filter(a => ['pending','reviewing','meeting'].includes(a.status)).length > 0 && (
                        <span className="ml-1.5 bg-white/25 px-1.5 py-0.5 rounded-full text-[9px]">
                          {apps.filter(a => ['pending','reviewing','meeting'].includes(a.status)).length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <Panel className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-100">
                          {['Hospital', 'Type', 'Location', 'Radiologists', 'Submitted', 'Status', 'Actions'].map(h => (
                            <th key={h} className="text-left px-6 py-5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredApps.map(a => (
                          <tr key={a.id} className="trow border-b border-slate-50 last:border-0">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {a.logo_base64
                                  ? <img src={a.logo_base64} alt="" className="w-8 h-8 rounded-lg object-contain border border-slate-100 p-0.5" />
                                  : <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-black">{a.name.charAt(0)}</div>
                                }
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{a.name}</p>
                                  <p className="text-[10px] text-slate-400">{a.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">{a.type}</td>
                            <td className="px-6 py-4 text-xs text-slate-500">{a.district}, {a.province}</td>
                            <td className="px-6 py-4 text-xs text-slate-500">{a.num_radiologists}</td>
                            <td className="px-6 py-4 text-xs text-slate-400 font-mono">{fmt(a.created_at)}</td>
                            <td className="px-6 py-4"><StatusBadge status={a.status} /></td>
                            <td className="px-6 py-4">
                              <div className="flex gap-1.5">
                                <button onClick={() => setSelected(a)} className="btn-s text-[11px] font-bold px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200">View</button>
                                {!['approved','rejected'].includes(a.status) && (
                                  <button onClick={() => approveApp(a.id)} className="btn-s text-[11px] font-bold px-3 py-1.5 rounded-full text-white" style={{ backgroundColor: DARK_GREEN }}>Approve</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredApps.length === 0 && (
                          <tr><td colSpan={7} className="px-6 py-16 text-center text-sm text-slate-400">No applications found</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>
            )}

            {/* ══ ACTIVE HOSPITALS ══ */}
            {tab === 'hospitals' && (
              <div className="space-y-4 anim-in">
                {hospitals.length === 0 && (
                  <Panel className="p-12 text-center text-sm text-slate-400">No active hospitals yet. Approve applications to see them here.</Panel>
                )}
                {hospitals.map(h => {
                  const s  = hospitalStats[h.id];
                  const rs = hospitalRads[h.id];
                  const isExpanded = selectedHosp?.id === h.id;

                  return (
                    <Panel key={h.id} className="overflow-hidden">
                      {/* Hospital header row */}
                      <div className="flex items-center gap-4 px-6 py-5 cursor-pointer hover:bg-slate-50/50 transition-colors"
                        onClick={() => {
                          setSelectedHosp(isExpanded ? null : h);
                          if (!s) fetchHospitalStats(h.id);
                        }}>
                        <button className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold border-2 shrink-0 transition-all"
                          style={isExpanded ? { backgroundColor: DARK_GREEN, color: 'white', borderColor: DARK_GREEN } : { borderColor: '#E2E8F0', color: '#94A3B8' }}>
                          {isExpanded ? '▾' : '▸'}
                        </button>
                        {h.logo_base64
                          ? <img src={h.logo_base64} alt="" className="w-10 h-10 rounded-xl object-contain border border-slate-100 p-0.5 shrink-0" />
                          : <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 font-black shrink-0">{h.name.charAt(0)}</div>
                        }
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="text-base font-bold text-slate-900">{h.name}</p>
                            <StatusBadge status="approved" />
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{h.type}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{h.district}, {h.province} · {h.email} · Active since {fmt(h.approved_at)}</p>
                        </div>
                        {/* Quick stat pills */}
                        {s && (
                          <div className="flex gap-3 shrink-0">
                            {[
                              { n: s.radiologists.approved, l: 'Radiologists', color: '#1C5438' },
                              { n: s.patients.total,        l: 'Patients',     color: '#2563EB' },
                              { n: s.diagnoses.total,       l: 'Diagnoses',    color: '#7C3AED' },
                            ].map(stat => (
                              <div key={stat.l} className="text-center bg-slate-50 rounded-2xl px-4 py-2 border border-slate-100">
                                <div className="text-lg font-black" style={{ color: stat.color }}>{stat.n}</div>
                                <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">{stat.l}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {loadingStats === h.id && <div className="w-5 h-5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin shrink-0" />}
                      </div>

                      {/* Expanded details */}
                      {isExpanded && s && (
                        <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-6 space-y-6">

                          {/* Hospital info */}
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Hospital Information</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {[
                                ['MoH License', h.moh_license],
                                ['Phone', h.phone],
                                ['Contact Person', h.contact_name],
                                ['Contact Role', h.contact_role],
                                ['X-Ray Machines', h.num_machines],
                                ['Monthly Volume', h.monthly_volume],
                                ['Website', h.website || '—'],
                                ['Address', h.address],
                              ].map(([l, v]) => (
                                <div key={l} className="bg-white rounded-xl p-3 border border-slate-100">
                                  <p className="text-[9px] text-slate-400 mb-0.5">{l}</p>
                                  <p className="text-xs font-bold text-slate-800 truncate">{v}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Diagnosis breakdown */}
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Diagnosis Breakdown</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {Object.entries(s.diagnoses.breakdown).map(([cls, count]) => (
                                <div key={cls} className="bg-white rounded-xl p-4 border border-slate-100 text-center">
                                  <div className="text-2xl font-black mb-1" style={{ color: CLS_COLOR[cls] || '#64748B' }}>{count}</div>
                                  <div className="text-[10px] font-bold text-slate-500">{cls === 'TB' ? 'Tuberculosis' : cls}</div>
                                  <div className="text-[9px] text-slate-300 mt-0.5">
                                    {s.diagnoses.total > 0 ? `${Math.round((count / s.diagnoses.total) * 100)}%` : '0%'}
                                  </div>
                                </div>
                              ))}
                              <div className="bg-white rounded-xl p-4 border border-slate-100 text-center">
                                <div className="text-2xl font-black mb-1 text-emerald-600">{s.diagnoses.verification_rate}%</div>
                                <div className="text-[10px] font-bold text-slate-500">Verified</div>
                                <div className="text-[9px] text-slate-300 mt-0.5">{s.diagnoses.verified} / {s.diagnoses.total}</div>
                              </div>
                            </div>
                          </div>

                          {/* Radiologists table */}
                          {rs && rs.length > 0 && (
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Radiologists ({rs.length})</p>
                              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                                <table className="w-full">
                                  <thead>
                                    <tr className="border-b border-slate-100">
                                      {['Name', 'Email', 'Specialization', 'License', 'Experience', 'Status', 'Diagnoses', 'Joined'].map(h => (
                                        <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rs.map(r => (
                                      <tr key={r.id} className="trow border-b border-slate-50 last:border-0">
                                        <td className="px-4 py-3 text-xs font-bold text-slate-800">{r.full_name}</td>
                                        <td className="px-4 py-3 text-[10px] text-slate-400 font-mono">{r.email}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500">{r.specialization || '—'}</td>
                                        <td className="px-4 py-3 text-[10px] text-slate-400 font-mono">{r.license_number || '—'}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500">{r.years_experience ? `${r.years_experience}y` : '—'}</td>
                                        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                                        <td className="px-4 py-3">
                                          <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: r.total_diagnoses > 0 ? '#2563EB' : '#94A3B8' }}>
                                            {r.total_diagnoses}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-[10px] text-slate-400 font-mono">{fmt(r.created_at)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {rs && rs.length === 0 && (
                            <p className="text-xs text-slate-400 text-center py-4">No radiologists linked to this hospital yet. They register and get linked via hospital_id.</p>
                          )}

                          {/* Last activity */}
                          {s.last_activity && (
                            <p className="text-[10px] text-slate-400">
                              Last diagnosis activity: <strong className="text-slate-600">{fmtFull(s.last_activity)}</strong>
                            </p>
                          )}

                          {/* Hospital Admin Status */}
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Hospital Admin Account</p>
                            {hospitalAdmins[h.id] ? (
                              <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 font-black text-sm shrink-0">
                                    {hospitalAdmins[h.id]!.full_name.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-800">{hospitalAdmins[h.id]!.full_name}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">{hospitalAdmins[h.id]!.email}</p>
                                    <p className="text-[9px] text-slate-400 mt-0.5">
                                      {hospitalAdmins[h.id]!.last_login
                                        ? `Last seen: ${fmtFull(hospitalAdmins[h.id]!.last_login!)}`
                                        : 'Never logged in yet'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`text-[9px] font-bold px-2.5 py-1.5 rounded-full border ${
                                    hospitalAdmins[h.id]!.last_login &&
                                    (new Date().getTime() - new Date(hospitalAdmins[h.id]!.last_login!).getTime()) < 7 * 24 * 60 * 60 * 1000
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-slate-50 text-slate-400 border-slate-200'
                                  }`}>
                                    {hospitalAdmins[h.id]!.last_login &&
                                     (new Date().getTime() - new Date(hospitalAdmins[h.id]!.last_login!).getTime()) < 7 * 24 * 60 * 60 * 1000
                                      ? '● Active' : '○ Inactive'}
                                  </span>
                                  <button
                                    onClick={() => { setChangePwdHospId(h.id); setNewPwd(''); setPwdErr(''); setPwdSuccess(''); }}
                                    className="btn-s text-[10px] font-bold px-3 py-1.5 rounded-full text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200">
                                    Change Password
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                                <span className="text-amber-500 text-base">⚠</span>
                                <p className="text-xs font-bold text-amber-700">No admin account set for this hospital yet.</p>
                              </div>
                            )}
                          </div>

                          {/* Logo section */}
                          {h.logo_base64 && (
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Hospital Logo</p>
                              <div className="flex items-center gap-4 bg-white rounded-2xl border border-slate-100 p-4">
                                <img src={h.logo_base64} alt="" className="w-16 h-16 rounded-xl object-contain border border-slate-100 p-1" />
                                <div>
                                  <p className="text-xs font-bold text-slate-700 mb-2">Logo set by hospital admin</p>
                                  <button onClick={() => removeLogo(h)}
                                    className="btn-s text-[10px] font-bold px-3 py-1.5 rounded-full text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100">
                                    Remove Logo
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Admin actions */}
                          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                            <button
                              onClick={() => { setCreateAdminHosp(h); setAdminCreated(null); setAdminErr(''); }}
                              className="btn-s flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-white"
                              style={{ backgroundColor: DARK_GREEN }}>
                              + {hospitalAdmins[h.id] ? 'Update Admin Account' : 'Create Admin Account'}
                            </button>
                            <button
                              onClick={() => deleteHospital(h)}
                              disabled={actionLoading}
                              className="btn-s flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-40">
                              Delete Hospital + All Data
                            </button>
                          </div>
                        </div>
                      )}
                    </Panel>
                  );
                })}
              </div>
            )}

          </main>
        </div>

        {/* ── Change Admin Password modal ── */}
        {changePwdHospId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,.45)', backdropFilter: 'blur(6px)' }}
            onClick={e => e.target === e.currentTarget && setChangePwdHospId(null)}>
            <div className="w-full max-w-sm bg-white rounded-[28px] shadow-2xl p-8 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Change Admin Password</h2>
                  {hospitalAdmins[changePwdHospId] && (
                    <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{hospitalAdmins[changePwdHospId]!.email}</p>
                  )}
                </div>
                <button onClick={() => setChangePwdHospId(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold">✕</button>
              </div>
              {pwdErr     && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 font-medium">{pwdErr}</div>}
              {pwdSuccess && <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-700 font-medium">{pwdSuccess}</div>}
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">New Password (min 8 characters)</label>
                <input value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  type="password" placeholder="••••••••"
                  onKeyDown={e => e.key === 'Enter' && newPwd.length >= 8 && changeAdminPassword()}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
              </div>
              <button onClick={changeAdminPassword} disabled={pwdLoading || newPwd.length < 8}
                className="btn-s w-full py-3 rounded-full text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ backgroundColor: DARK_GREEN }}>
                {pwdLoading
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Updating…</>
                  : 'Update Password'}
              </button>
            </div>
          </div>
        )}

        {/* ── Create Admin modal ── */}
        {createAdminHosp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,.45)', backdropFilter: 'blur(6px)' }}
            onClick={e => e.target === e.currentTarget && setCreateAdminHosp(null)}>
            <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden">
              <div className="px-8 pt-7 pb-6" style={{ background: `linear-gradient(135deg,${DARK_GREEN},#267347)` }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1">New Admin Account</p>
                    <h2 className="text-lg font-bold text-white">{createAdminHosp.name}</h2>
                  </div>
                  <button onClick={() => setCreateAdminHosp(null)} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold">✕</button>
                </div>
              </div>
              <div className="p-8 space-y-4">
                {adminCreated ? (
                  <div className="space-y-4">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center space-y-2">
                      <div className="text-2xl">✅</div>
                      <p className="text-sm font-bold text-emerald-800">Admin account created!</p>
                      <p className="text-xs text-emerald-600">Send these credentials to the hospital contact:</p>
                      <div className="bg-white rounded-xl p-3 border border-emerald-100 text-left mt-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-slate-500">Email:</p>
                          <strong className="text-slate-800 font-mono text-[11px]">{adminCreated.email}</strong>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-slate-500">Dashboard URL:</p>
                          <a href={`${window.location.origin}/dashboard`} target="_blank" rel="noreferrer"
                            className="text-emerald-700 font-mono text-[11px] underline underline-offset-2 font-bold">
                            {window.location.origin}/dashboard
                          </a>
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(`Email: ${adminCreated.email}\nDashboard: ${window.location.origin}/dashboard`)}
                          className="w-full mt-1 text-[10px] font-bold py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                          Copy credentials
                        </button>
                      </div>
                    </div>
                    <button onClick={() => setCreateAdminHosp(null)} className="w-full py-3 rounded-full text-white font-bold text-sm" style={{ backgroundColor: DARK_GREEN }}>Done</button>
                  </div>
                ) : (
                  <>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-700">
                      <span className="font-bold">✅ Hospital approved!</span> Now set up their admin account. Send credentials to <strong>{createAdminHosp.email}</strong>.
                    </div>
                    {adminErr && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 font-medium">{adminErr}</div>}
                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Full Name</label>
                        <input value={adminName} onChange={e => setAdminName(e.target.value)}
                          placeholder="e.g. Dr. Jean Bosco"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Email Address</label>
                        <input value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
                          type="email" placeholder="admin@hospital.rw"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Password (min 8 characters)</label>
                        <input value={adminPass} onChange={e => setAdminPass(e.target.value)}
                          type="password" placeholder="••••••••"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
                      </div>
                    </div>
                    <button onClick={createAdmin} disabled={adminLoading || !adminEmail || !adminName || !adminPass}
                      className="btn-s w-full py-3 rounded-full text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                      style={{ backgroundColor: DARK_GREEN }}>
                      {adminLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Creating…</> : 'Create Admin Account'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Application detail modal ── */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,.45)', backdropFilter: 'blur(6px)' }}
            onClick={e => e.target === e.currentTarget && setSelected(null)}>
            <div className="w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="px-8 pt-7 pb-6" style={{ background: `linear-gradient(135deg,${DARK_GREEN},#267347)` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selected.logo_base64
                      ? <img src={selected.logo_base64} alt="" className="w-12 h-12 rounded-xl object-contain bg-white/10 p-1" />
                      : <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-white font-black text-lg">{selected.name.charAt(0)}</div>
                    }
                    <div>
                      <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                      <p className="text-xs text-white/60 mt-0.5">Ref: {selected.ref_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selected.status} />
                    <button onClick={() => setSelected(null)} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold ml-2">✕</button>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-5">
                {/* Details */}
                {[
                  { title: 'Organisation', fields: [['Type', selected.type], ['MoH License', selected.moh_license], ['Email', selected.email], ['Phone', selected.phone]] },
                  { title: 'Location', fields: [['Province', selected.province], ['District', selected.district], ['Contact', selected.contact_name], ['Role', selected.contact_role], ['Address', selected.address]] },
                  { title: 'Radiology Capacity', fields: [['Radiologists', selected.num_radiologists], ['X-Ray Machines', selected.num_machines], ['Monthly Volume', selected.monthly_volume]] },
                ].map(section => (
                  <div key={section.title}>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">{section.title}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {section.fields.filter(([, v]) => v).map(([l, v]) => (
                        <div key={l} className="bg-slate-50 rounded-xl p-3">
                          <p className="text-[9px] text-slate-400 mb-0.5">{l}</p>
                          <p className="text-xs font-bold text-slate-800">{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {selected.notes && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <p className="text-[9px] font-bold uppercase text-amber-500 mb-1">Notes from applicant</p>
                    <p className="text-xs text-amber-700">{selected.notes}</p>
                  </div>
                )}

                {/* Action area for pending */}
                {!['approved', 'rejected'].includes(selected.status) && (
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <div className="space-y-2">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Schedule Google Meet</label>
                      <div className="relative">
                        <input value={meetLink} onChange={e => { setMeetLink(e.target.value); setMeetLinkErr(''); }}
                          placeholder="https://meet.google.com/abc-defg-hij"
                          className={`w-full px-3.5 py-2.5 rounded-xl border bg-gray-50 text-xs outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all ${meetLinkErr ? 'border-red-300 focus:border-red-400' : meetLink && !meetLinkErr ? 'border-emerald-300' : 'border-gray-100 focus:border-emerald-500'}`} />
                        {meetLink && !meetLinkErr && /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(meetLink.trim()) && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 text-sm">✓</span>
                        )}
                      </div>
                      {meetLinkErr && <p className="text-[10px] text-red-500 font-semibold ml-0.5">{meetLinkErr}</p>}
                      <p className="text-[9px] text-slate-300 ml-0.5">Format: https://meet.google.com/xxx-xxxx-xxx</p>
                      <button onClick={() => { if (validateMeetLink(meetLink)) updateStatus(selected.id, 'meeting', { meet_link: meetLink.trim() }); }}
                        disabled={actionLoading}
                        className="btn-s w-full py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-2" style={{ backgroundColor: '#7C3AED' }}>
                        {actionLoading ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Sending…</> : '📅 Send Meeting Invite by Email'}
                      </button>
                    </div>
                    <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                      placeholder="Rejection reason (optional — sent to applicant)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-xs outline-none focus:border-emerald-500" />
                    <div className="flex gap-2">
                      <button onClick={() => approveApp(selected.id)} disabled={actionLoading}
                        className="btn-s flex-1 py-3 rounded-full text-white font-bold text-sm disabled:opacity-40" style={{ backgroundColor: DARK_GREEN }}>
                        ✓ Approve & Go Live
                      </button>
                      <button onClick={() => updateStatus(selected.id, 'rejected', rejectReason ? { rejection_reason: rejectReason } : {})} disabled={actionLoading}
                        className="btn-s px-5 py-3 rounded-full text-red-600 font-bold text-sm bg-red-50 border border-red-200 disabled:opacity-40">
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}