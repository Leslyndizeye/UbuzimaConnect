// AdminDashboard.tsx — Hospital middle admin dashboard
// Accessible after super admin creates credentials via Hospitaladmin.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseConfig';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';
const DARK_GREEN = '#1C5438';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; font-family: 'Plus Jakarta Sans', sans-serif; }
::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
@keyframes slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
.anim-in { animation: slideUp .38s cubic-bezier(.22,1,.36,1) both; }
.card { background:#fff; border-radius:24px; border:1px solid #F1F5F9; box-shadow:0 4px 24px rgba(0,0,0,.04); }
.btn { transition:transform .15s ease,filter .15s ease; }
.btn:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(1.05); }
.trow:hover { background:#F7FDF9; }
`;

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pending:  { bg: '#FEF3C7', text: '#92400E' },
  approved: { bg: '#DCFCE7', text: '#166534' },
  rejected: { bg: '#FEE2E2', text: '#991B1B' },
  revoked:  { bg: '#F1F5F9', text: '#475569' },
};

interface MeUser {
  id: number; email: string; full_name: string;
  hospital_id: number | null; is_admin: boolean; status: string;
}
interface HospitalInfo {
  id: number; name: string; type: string; email: string; phone: string;
  province: string; district: string; address: string; contact_name: string;
  contact_role: string; logo_base64: string | null; moh_license: string;
  num_radiologists: string; num_machines: string; monthly_volume: string;
  is_active: boolean; approved_at: string;
}
interface Stats {
  radiologists: { total: number; approved: number; pending: number };
  patients: { total: number };
  diagnoses: { total: number; verified: number; verification_rate: number; breakdown: Record<string, number> };
  last_activity: string | null;
}
interface Radiologist {
  id: number; full_name: string; email: string; specialization: string;
  license_number: string; years_experience: number; status: string;
  created_at: string; total_diagnoses: number;
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] || { bg: '#F1F5F9', text: '#475569' };
  return <span className="inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-full capitalize" style={{ backgroundColor: c.bg, color: c.text }}>{status}</span>;
}

type Tab = 'overview' | 'radiologists';

export default function AdminDashboard() {
  const [token, setToken]   = useState(() => localStorage.getItem('hosp_mid_token') || '');
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('hosp_mid_token'));
  const [me, setMe]         = useState<MeUser | null>(null);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass]   = useState('');
  const [loginErr, setLoginErr]     = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [hospital, setHospital] = useState<HospitalInfo | null>(null);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [rads, setRads]         = useState<Radiologist[]>([]);
  const [tab, setTab]           = useState<Tab>('overview');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // Radiologist management
  const [radLoading, setRadLoading] = useState<number | null>(null);

  const hdr = useCallback(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const loadData = useCallback(async (t: string, hospitalId: number) => {
    setLoading(true);
    try {
      const [hRes, sRes, rRes] = await Promise.all([
        fetch(`${API_BASE}/hospitals/${hospitalId}`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`${API_BASE}/hospitals/${hospitalId}/stats`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`${API_BASE}/hospitals/${hospitalId}/radiologists`, { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      if (hRes.ok)  setHospital(await hRes.json());
      if (sRes.ok)  setStats(await sRes.json());
      if (rRes.ok)  setRads(await rRes.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const doLogin = async () => {
    setLoginErr(''); setLoginLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPass });
      if (error || !data.session) { setLoginErr('Invalid credentials.'); return; }
      const t = data.session.access_token;

      // Get current user info
      const meRes = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${t}` } });
      if (!meRes.ok) {
        setLoginErr('Account not found. Contact your admin.');
        await supabase.auth.signOut();
        return;
      }
      const meData: MeUser = await meRes.json();
      if (!meData.hospital_id || !meData.is_admin) {
        setLoginErr('This account does not have hospital admin access.');
        await supabase.auth.signOut();
        return;
      }

      localStorage.setItem('hosp_mid_token', t);
      setToken(t); setAuthed(true); setMe(meData);
      loadData(t, meData.hospital_id);
    } catch (e: any) { setLoginErr(e.message); }
    finally { setLoginLoading(false); }
  };

  const signOut = async () => {
    localStorage.removeItem('hosp_mid_token');
    setToken(''); setAuthed(false); setMe(null);
    await supabase.auth.signOut();
  };

  const updateRadStatus = async (radId: number, status: string) => {
    setRadLoading(radId);
    try {
      const res = await fetch(`${API_BASE}/users/${radId}/status`, {
        method: 'PATCH', headers: hdr(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const e = await res.json(); setError(e.detail); return; }
      if (me?.hospital_id) loadData(token, me.hospital_id);
    } catch (e: any) { setError(e.message); }
    finally { setRadLoading(null); }
  };

  // Resume session on mount
  useEffect(() => {
    if (!authed || !token) return;
    (async () => {
      try {
        const meRes = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!meRes.ok) { signOut(); return; }
        const meData: MeUser = await meRes.json();
        if (!meData.hospital_id || !meData.is_admin) { signOut(); return; }
        setMe(meData);
        loadData(token, meData.hospital_id);
      } catch { signOut(); }
    })();
  }, []);

  // ── Login screen ──
  if (!authed) {
    return (
      <>
        <style>{CSS}</style>
        <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#F2F4F7' }}>
          <div className="w-full max-w-sm">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white font-black text-xl" style={{ backgroundColor: DARK_GREEN }}>H</div>
              <h1 className="text-2xl font-black text-slate-900">Hospital Dashboard</h1>
              <p className="text-sm text-slate-400 mt-1">Sign in with your admin credentials</p>
            </div>
            <div className="card p-8 space-y-4">
              {loginErr && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">{loginErr}</div>}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Email</label>
                <input value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  type="email" placeholder="you@hospital.rw" onKeyDown={e => e.key === 'Enter' && doLogin()}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Password</label>
                <input value={loginPass} onChange={e => setLoginPass(e.target.value)}
                  type="password" placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && doLogin()}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
              </div>
              <button onClick={doLogin} disabled={loginLoading || !loginEmail || !loginPass}
                className="btn w-full py-3.5 rounded-full text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ backgroundColor: DARK_GREEN }}>
                {loginLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Signing in…</> : 'Sign In'}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const CLS_COLOR: Record<string, string> = {
    Normal: '#38A169', Pneumonia: '#DD6B20', TB: '#E53E3E', Unknown: '#A0AEC0',
  };

  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-RW', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="min-h-screen flex" style={{ background: '#F2F4F7' }}>

        {/* Sidebar */}
        <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col p-5 gap-2" style={{ background: '#fff', borderRight: '1px solid #F1F5F9' }}>
          {/* Logo / Hospital */}
          <div className="flex items-center gap-3 px-2 py-3 mb-4">
            {hospital?.logo_base64
              ? <img src={hospital.logo_base64} alt="" className="w-10 h-10 rounded-xl object-contain border border-slate-100" />
              : <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-base shrink-0" style={{ backgroundColor: DARK_GREEN }}>{hospital?.name?.charAt(0) || 'H'}</div>
            }
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{hospital?.name || 'Loading…'}</p>
              <p className="text-[10px] text-slate-400 truncate">{me?.email}</p>
            </div>
          </div>

          {[
            { key: 'overview',     label: 'Overview',      icon: '⊞' },
            { key: 'radiologists', label: 'Radiologists',  icon: '👨‍⚕️' },
          ].map(item => (
            <button key={item.key} onClick={() => setTab(item.key as Tab)}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-left transition-all"
              style={tab === item.key
                ? { backgroundColor: DARK_GREEN, color: 'white' }
                : { color: '#475569' }}>
              <span>{item.icon}</span>
              {item.label}
              {item.key === 'radiologists' && stats && (
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={tab === item.key ? { background: 'rgba(255,255,255,.2)', color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>
                  {stats.radiologists.total}
                </span>
              )}
            </button>
          ))}

          <div className="mt-auto">
            <button onClick={signOut} className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors">
              <span>⎋</span> Sign Out
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-8 overflow-y-auto">

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-600 flex items-center justify-between">
              {error}
              <button onClick={() => setError('')} className="text-red-400 font-bold ml-4">✕</button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          )}

          {/* ── OVERVIEW ── */}
          {!loading && tab === 'overview' && hospital && stats && (
            <div className="space-y-6 anim-in">

              {/* Header */}
              <div>
                <h1 className="text-2xl font-black text-slate-900">{hospital.name}</h1>
                <p className="text-sm text-slate-400 mt-0.5">{hospital.district}, {hospital.province} · Active since {fmt(hospital.approved_at)}</p>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { n: stats.radiologists.approved, sub: `${stats.radiologists.pending} pending`, label: 'Radiologists', color: DARK_GREEN },
                  { n: stats.patients.total, sub: 'registered', label: 'Patients', color: '#2563EB' },
                  { n: stats.diagnoses.total, sub: `${stats.diagnoses.verified} verified`, label: 'Diagnoses', color: '#7C3AED' },
                  { n: `${stats.diagnoses.verification_rate}%`, sub: 'verification rate', label: 'Accuracy', color: '#D97706' },
                ].map(s => (
                  <div key={s.label} className="card p-6">
                    <div className="text-3xl font-black mb-1" style={{ color: s.color }}>{s.n}</div>
                    <div className="text-xs font-bold text-slate-700">{s.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Diagnosis breakdown */}
              {Object.keys(stats.diagnoses.breakdown).length > 0 && (
                <div className="card p-6">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Diagnosis Breakdown</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(stats.diagnoses.breakdown).map(([cls, count]) => (
                      <div key={cls} className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-100">
                        <div className="text-2xl font-black mb-1" style={{ color: CLS_COLOR[cls] || '#64748B' }}>{count}</div>
                        <div className="text-[10px] font-bold text-slate-500">{cls === 'TB' ? 'Tuberculosis' : cls}</div>
                        <div className="text-[9px] text-slate-300 mt-0.5">
                          {stats.diagnoses.total > 0 ? `${Math.round((count / stats.diagnoses.total) * 100)}%` : '0%'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hospital info */}
              <div className="card p-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Hospital Information</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    ['MoH License', hospital.moh_license],
                    ['Phone', hospital.phone],
                    ['Type', hospital.type],
                    ['Contact Person', hospital.contact_name],
                    ['Contact Role', hospital.contact_role],
                    ['Address', hospital.address],
                    ['X-Ray Machines', hospital.num_machines],
                    ['Monthly Volume', hospital.monthly_volume],
                  ].filter(([, v]) => v).map(([l, v]) => (
                    <div key={l} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <p className="text-[9px] text-slate-400 mb-0.5">{l}</p>
                      <p className="text-xs font-bold text-slate-800">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── RADIOLOGISTS ── */}
          {!loading && tab === 'radiologists' && (
            <div className="space-y-4 anim-in">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">Radiologists</h2>
                  <p className="text-sm text-slate-400 mt-0.5">Manage your hospital's radiologist accounts</p>
                </div>
              </div>

              {rads.length === 0 ? (
                <div className="card p-16 text-center text-sm text-slate-400">
                  No radiologists linked yet. They register in the main app and get linked via hospital ID.
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {['Name', 'Email', 'Specialization', 'License', 'Exp.', 'Status', 'Diagnoses', 'Joined', 'Actions'].map(h => (
                          <th key={h} className="text-left px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rads.map(r => (
                        <tr key={r.id} className="trow border-b border-slate-50 last:border-0">
                          <td className="px-5 py-3.5 text-xs font-bold text-slate-800">{r.full_name}</td>
                          <td className="px-5 py-3.5 text-[10px] text-slate-400 font-mono">{r.email}</td>
                          <td className="px-5 py-3.5 text-xs text-slate-500">{r.specialization || '—'}</td>
                          <td className="px-5 py-3.5 text-[10px] text-slate-400 font-mono">{r.license_number || '—'}</td>
                          <td className="px-5 py-3.5 text-xs text-slate-500">{r.years_experience ? `${r.years_experience}y` : '—'}</td>
                          <td className="px-5 py-3.5"><StatusBadge status={r.status} /></td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: r.total_diagnoses > 0 ? '#2563EB' : '#94A3B8' }}>
                              {r.total_diagnoses}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-[10px] text-slate-400 font-mono">{fmt(r.created_at)}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex gap-1.5">
                              {r.status === 'pending' && (
                                <button onClick={() => updateRadStatus(r.id, 'approved')} disabled={radLoading === r.id}
                                  className="btn text-[10px] font-bold px-3 py-1.5 rounded-full text-white disabled:opacity-40"
                                  style={{ backgroundColor: DARK_GREEN }}>
                                  {radLoading === r.id ? '…' : 'Approve'}
                                </button>
                              )}
                              {r.status === 'approved' && (
                                <button onClick={() => updateRadStatus(r.id, 'revoked')} disabled={radLoading === r.id}
                                  className="btn text-[10px] font-bold px-3 py-1.5 rounded-full text-red-600 bg-red-50 border border-red-200 disabled:opacity-40">
                                  {radLoading === r.id ? '…' : 'Revoke'}
                                </button>
                              )}
                              {r.status === 'revoked' && (
                                <button onClick={() => updateRadStatus(r.id, 'approved')} disabled={radLoading === r.id}
                                  className="btn text-[10px] font-bold px-3 py-1.5 rounded-full text-blue-600 bg-blue-50 border border-blue-200 disabled:opacity-40">
                                  {radLoading === r.id ? '…' : 'Restore'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </main>
      </div>
    </>
  );
}
