// components/HospitalAdminDashboard.tsx
// Matches existing AdminDashboard design — same palette, same Panel/Tbl components
// Uses localStorage to persist login across refreshes
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseConfig';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

// ── Design tokens (same as AdminDashboard) ──
const DARK_GREEN = '#1C5438';
const BG_APP     = '#F2F4F7';
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; font-family: 'Plus Jakarta Sans', sans-serif; }
::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
@keyframes slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
.anim-in { animation:slideUp .38s cubic-bezier(.22,1,.36,1) both; }
.panel-card { background:#fff; border-radius:28px; border:1px solid #F1F5F9; box-shadow:0 4px 30px rgba(0,0,0,.03); }
.btn-s { transition:transform .15s ease,filter .15s ease; }
.btn-s:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(1.06); }
.trow:hover { background:#F7FDF9; }
`;

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
interface Stats { total_applications: number; pending_review: number; active_hospitals: number; total_radiologists: number; }

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pending:   { bg: '#FEF3C7', text: '#92400E' },
  reviewing: { bg: '#DBEAFE', text: '#1E40AF' },
  meeting:   { bg: '#EDE9FE', text: '#5B21B6' },
  approved:  { bg: '#DCFCE7', text: '#166534' },
  rejected:  { bg: '#FEE2E2', text: '#991B1B' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] || { bg: '#F1F5F9', text: '#475569' };
  return <span className="inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-full capitalize" style={{ backgroundColor: c.bg, color: c.text }}>{status}</span>;
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`panel-card ${className}`}>{children}</div>;
}

export default function HospitalAdminDashboard() {
  const navigate = useNavigate();
  const [token, setToken]   = useState<string>(() => localStorage.getItem('hosp_admin_token') || '');
  const [authed, setAuthed] = useState<boolean>(() => !!localStorage.getItem('hosp_admin_token'));
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass]   = useState('');
  const [loginErr, setLoginErr]     = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [apps, setApps]     = useState<Application[]>([]);
  const [stats, setStats]   = useState<Stats | null>(null);
  const [tab, setTab]       = useState<'all' | 'pending' | 'approved'>('all');
  const [selected, setSelected] = useState<Application | null>(null);
  const [meetLink, setMeetLink] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]   = useState('');

  const headers = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchData = useCallback(async (t: string) => {
    try {
      const [appsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/hospital/applications`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`${API_BASE}/hospitals/stats/summary`, { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      if (appsRes.ok) setApps(await appsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => {
    if (authed && token) fetchData(token);
  }, [authed, token, fetchData]);

  const doLogin = async () => {
    setLoginErr(''); setLoginLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPass });
      if (error || !data.session) { setLoginErr('Invalid credentials.'); return; }
      const t = data.session.access_token;
      // Verify this is actually an admin by hitting a protected endpoint
      const test = await fetch(`${API_BASE}/hospital/applications`, { headers: { Authorization: `Bearer ${t}` } });
      if (!test.ok) { setLoginErr('Access denied. Admin credentials required.'); await supabase.auth.signOut(); return; }
      localStorage.setItem('hosp_admin_token', t);
      setToken(t);
      setAuthed(true);
      fetchData(t);
    } catch (e: any) {
      setLoginErr(e.message);
    } finally {
      setLoginLoading(false);
    }
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
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ status, ...extra }),
      });
      await fetchData(token);
      setSelected(null); setMeetLink(''); setRejectReason('');
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const approveApp = async (id: number) => {
    if (!confirm('Approve this hospital and send admin credentials?')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/hospital/applications/${id}/approve`, {
        method: 'POST', headers: headers(),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
      const hospital = await res.json();
      alert(`✅ ${hospital.name} approved!\n\nSend credentials to: ${hospital.email}`);
      await fetchData(token);
      setSelected(null);
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-RW', { day: '2-digit', month: 'short', year: 'numeric' });

  const filtered = apps.filter(a => {
    if (tab === 'pending') return ['pending', 'reviewing', 'meeting'].includes(a.status);
    if (tab === 'approved') return a.status === 'approved';
    return true;
  });

  // ── LOGIN SCREEN ──
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
              <h2 className="text-xl font-black text-gray-900">Hospital Admin Portal</h2>
              <p className="text-xs text-gray-400 mt-1">Sign in with your Ubuzima Connect admin credentials</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-0.5">Email</label>
                <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  placeholder="admin@ubuzima.rw"
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-gray-900 text-xs font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-0.5">Password</label>
                <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doLogin()}
                  placeholder="••••••••"
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-gray-900 text-xs font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all" />
              </div>
              {loginErr && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-semibold">{loginErr}</div>}
              <button onClick={doLogin} disabled={loginLoading}
                className="btn-s w-full py-3.5 bg-emerald-900 hover:bg-emerald-800 text-white font-bold rounded-xl transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
                {loginLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in…</> : 'Sign In →'}
              </button>
            </div>
            <button onClick={() => navigate('/')} className="w-full mt-4 text-[9px] font-bold uppercase tracking-widest text-gray-300 hover:text-gray-500 transition-colors text-center">
              ← Back to portal
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── DASHBOARD ──
  return (
    <>
      <style>{CSS}</style>
      <div className="min-h-screen flex text-slate-800" style={{ backgroundColor: BG_APP }}>

        {/* Sidebar */}
        <aside className="w-[240px] shrink-0 flex flex-col sticky top-4 h-[calc(100vh-2rem)] bg-white m-4 rounded-[32px] shadow-sm z-30">
          <div className="h-[80px] flex items-center px-6 gap-2.5">
            <div className="w-7 h-7 bg-emerald-900 rounded-lg flex items-center justify-center">
              <div className="w-3.5 h-[1.5px] rounded-full bg-emerald-100" />
            </div>
            <span className="text-sm font-black text-slate-900">Ubuzima Connect</span>
          </div>
          <p className="px-6 pb-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Hospital Admin</p>
          <nav className="flex-1 px-4 space-y-1">
            {([['all', 'All Applications'], ['pending', 'Pending Review'], ['approved', 'Active Hospitals']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left text-[13px] font-semibold transition-all ${tab === id ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}>
                {label}
                {id === 'pending' && stats && stats.pending_review > 0 && (
                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-md text-white" style={{ backgroundColor: DARK_GREEN }}>{stats.pending_review}</span>
                )}
              </button>
            ))}
          </nav>
          <button onClick={signOut} className="mx-4 mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors text-xs font-semibold">
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            Sign Out
          </button>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-[80px] flex items-center justify-between px-8 sticky top-0 z-20">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Hospital Applications</h1>
              <p className="text-xs text-slate-400 mt-0.5">Manage hospital partnership applications</p>
            </div>
            <div className="flex items-center gap-3">
              {error && <div className="px-4 py-2 rounded-full text-xs font-semibold bg-red-50 border border-red-200 text-red-700">{error}<button onClick={() => setError('')} className="ml-2">✕</button></div>}
              <button onClick={() => fetchData(token)} className="px-4 py-2 rounded-full text-slate-600 text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50">Refresh</button>
            </div>
          </header>

          <main className="flex-1 px-8 pb-8">

            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-4 gap-4 mb-6 anim-in">
                {[
                  { n: stats.total_applications, l: 'Total Applications', dark: true },
                  { n: stats.pending_review,     l: 'Pending Review',     dark: true },
                  { n: stats.active_hospitals,   l: 'Active Hospitals',   dark: false },
                  { n: stats.total_radiologists, l: 'Total Radiologists', dark: false },
                ].map(s => (
                  <div key={s.l} className={`rounded-[28px] p-6 ${s.dark ? 'text-white' : 'bg-white border border-slate-100'}`} style={s.dark ? { backgroundColor: DARK_GREEN } : {}}>
                    <div className="text-4xl font-black tracking-tight mb-1" style={!s.dark ? { color: DARK_GREEN } : {}}>{s.n}</div>
                    <div className={`text-xs font-semibold ${s.dark ? 'text-white/60' : 'text-slate-400'}`}>{s.l}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Table */}
            <Panel className="overflow-hidden anim-in">
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
                    {filtered.map(a => (
                      <tr key={a.id} className="trow border-b border-slate-50 last:border-0 transition-colors">
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
                            {!['approved', 'rejected'].includes(a.status) && (
                              <button onClick={() => approveApp(a.id)} className="btn-s text-[11px] font-bold px-3 py-1.5 rounded-full text-white" style={{ backgroundColor: DARK_GREEN }}>Approve</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} className="px-6 py-16 text-center text-sm text-slate-400">No applications found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </main>
        </div>

        {/* Detail modal */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,.45)', backdropFilter: 'blur(6px)' }} onClick={e => e.target === e.currentTarget && setSelected(null)}>
            <div className="w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
              {/* Modal header */}
              <div className="px-8 pt-7 pb-6" style={{ background: `linear-gradient(135deg,${DARK_GREEN},#267347)` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selected.logo_base64
                      ? <img src={selected.logo_base64} alt="" className="w-12 h-12 rounded-xl object-contain bg-white/10 p-1" />
                      : <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-white font-black text-lg">{selected.name.charAt(0)}</div>
                    }
                    <div>
                      <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                      <StatusBadge status={selected.status} />
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold">✕</button>
                </div>
              </div>

              <div className="p-8 space-y-5">
                {/* Details grid */}
                {[
                  { title: 'Organisation', fields: [['Type', selected.type], ['MoH License', selected.moh_license], ['Email', selected.email], ['Phone', selected.phone]] },
                  { title: 'Location', fields: [['Province', selected.province], ['District', selected.district], ['Contact', selected.contact_name], ['Role', selected.contact_role], ['Address', selected.address]] },
                  { title: 'Radiology', fields: [['Radiologists', selected.num_radiologists], ['Machines', selected.num_machines], ['Monthly Volume', selected.monthly_volume]] },
                ].map(s => (
                  <div key={s.title}>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">{s.title}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {s.fields.filter(([, v]) => v).map(([l, v]) => (
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
                    <p className="text-[9px] font-bold uppercase text-amber-400 mb-1">Notes</p>
                    <p className="text-xs text-amber-700">{selected.notes}</p>
                  </div>
                )}

                {/* Actions for non-final statuses */}
                {!['approved', 'rejected'].includes(selected.status) && (
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-0.5 mb-1 block">Schedule Google Meet</label>
                      <div className="flex gap-2">
                        <input value={meetLink} onChange={e => setMeetLink(e.target.value)}
                          placeholder="https://meet.google.com/xxx-xxxx-xxx"
                          className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
                        <button onClick={() => updateStatus(selected.id, 'meeting', { meet_link: meetLink })} disabled={!meetLink || actionLoading}
                          className="btn-s px-4 py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-40" style={{ backgroundColor: '#7C3AED' }}>
                          Send Invite
                        </button>
                      </div>
                    </div>
                    <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                      placeholder="Rejection reason (optional)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-xs outline-none focus:border-emerald-500" />
                    <div className="flex gap-2">
                      <button onClick={() => approveApp(selected.id)} disabled={actionLoading}
                        className="btn-s flex-1 py-3 rounded-full text-white font-bold text-sm disabled:opacity-40" style={{ backgroundColor: DARK_GREEN }}>
                        ✓ Approve & Send Credentials
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