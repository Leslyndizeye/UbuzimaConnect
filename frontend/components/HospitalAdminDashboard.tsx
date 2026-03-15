// frontend/components/HospitalAdminDashboard.tsx
// Super admin dashboard at /hospital/admin
// Login with Supabase admin credentials, then manage hospital applications

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseConfig';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

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

interface Stats {
  total_applications: number; pending_review: number;
  active_hospitals: number; total_radiologists: number;
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-yellow-900/20 text-yellow-300 border border-yellow-700/30',
  reviewing: 'bg-blue-900/20 text-blue-300 border border-blue-700/30',
  meeting:   'bg-purple-900/20 text-purple-300 border border-purple-700/30',
  approved:  'bg-green-900/20 text-green-300 border border-green-700/30',
  rejected:  'bg-red-900/20 text-red-300 border border-red-700/30',
};

export default function HospitalAdminDashboard() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass]   = useState('');
  const [loginErr, setLoginErr]     = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [token, setToken] = useState('');
  const [apps, setApps] = useState<Application[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<'all'|'pending'|'approved'>('all');
  const [selected, setSelected] = useState<Application | null>(null);
  const [meetLink, setMeetLink] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const doLogin = async () => {
    setLoginErr(''); setLoginLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPass });
    setLoginLoading(false);
    if (error || !data.session) { setLoginErr('Invalid credentials.'); return; }
    const t = data.session.access_token;
    setToken(t);
    setAuthed(true);
    fetchData(t);
  };

  const fetchData = async (t: string) => {
    const headers = { Authorization: `Bearer ${t}` };
    const [appsRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/hospital/applications`, { headers }),
      fetch(`${API_BASE}/hospitals/stats/summary`, { headers }),
    ]);
    if (appsRes.ok) setApps(await appsRes.json());
    if (statsRes.ok) setStats(await statsRes.json());
  };

  const updateStatus = async (id: number, status: string, extra: Record<string,string> = {}) => {
    setActionLoading(true);
    await fetch(`${API_BASE}/hospital/applications/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, ...extra }),
    });
    await fetchData(token);
    setSelected(null); setActionLoading(false);
  };

  const approveApp = async (id: number) => {
    setActionLoading(true);
    const res = await fetch(`${API_BASE}/hospital/applications/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const hospital = await res.json();
      alert(`✅ ${hospital.name} approved!\n\nCredentials sent to ${hospital.email}\nAdmin password: UBZ-${Math.random().toString(36).slice(2,8).toUpperCase()}`);
    }
    await fetchData(token);
    setSelected(null); setActionLoading(false);
  };

  const filtered = apps.filter(a => {
    if (tab === 'pending') return ['pending','reviewing','meeting'].includes(a.status);
    if (tab === 'approved') return a.status === 'approved';
    return true;
  });

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#0d3320] flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl p-12 max-w-md w-full text-center shadow-2xl">
          <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-6">🏥</div>
          <h2 className="text-2xl font-bold text-[#0d3320] mb-2" style={{fontFamily:'Georgia,serif'}}>Hospital Admin Portal</h2>
          <p className="text-green-700 text-sm mb-8">Sign in with your Ubuzima Connect super-admin credentials.</p>
          <input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)}
            placeholder="Admin email" className="w-full border border-green-100 rounded-xl px-4 py-3 text-sm mb-3 outline-none focus:border-green-500"/>
          <input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&doLogin()}
            placeholder="Password" className="w-full border border-green-100 rounded-xl px-4 py-3 text-sm mb-4 outline-none focus:border-green-500"/>
          {loginErr && <p className="text-red-500 text-sm mb-3">{loginErr}</p>}
          <button onClick={doLogin} disabled={loginLoading}
            className="w-full bg-[#0d3320] text-white py-3 rounded-xl font-bold hover:bg-green-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loginLoading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Signing in...</> : 'Sign In →'}
          </button>
          <button onClick={()=>navigate('/')} className="mt-4 text-green-600 text-sm hover:text-green-500">← Back to portal</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d3320]">

      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-[#0d3320] border-b border-white/10 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-white font-bold text-xl" style={{fontFamily:'Georgia,serif'}}>Ubuzima Connect</h1>
            <p className="text-white/40 text-xs mt-0.5">Hospital Applications Dashboard</p>
          </div>
          <span className="bg-yellow-500 text-[#0d3320] text-xs font-bold px-3 py-1 rounded-full">Super Admin</span>
        </div>
        <button onClick={()=>navigate('/')} className="bg-white/10 text-white/70 hover:text-white px-4 py-2 rounded-full text-sm transition-colors">
          ← Back to portal
        </button>
      </div>

      <div className="px-8 py-8">

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { n: stats.total_applications, l: 'Total Applications', gold: true },
              { n: stats.pending_review,     l: 'Pending Review',     gold: true },
              { n: stats.active_hospitals,   l: 'Active Hospitals',   gold: false },
              { n: stats.total_radiologists, l: 'Total Radiologists', gold: false },
            ].map(s => (
              <div key={s.l} className="bg-white/6 border border-white/10 rounded-2xl p-6">
                <div className={`text-3xl font-bold mb-1 ${s.gold ? 'text-yellow-300' : 'text-white'}`} style={{fontFamily:'Georgia,serif'}}>{s.n}</div>
                <div className="text-white/40 text-sm">{s.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['all','pending','approved'] as const).map(t => (
            <button key={t} onClick={()=>setTab(t)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${tab===t ? 'bg-yellow-500 text-[#0d3320]' : 'bg-white/6 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'}`}>
              {t === 'all' ? 'All Applications' : t === 'pending' ? 'Pending Review' : 'Active Hospitals'}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/8">
                {['Hospital','Type','Location','Radiologists','Submitted','Status','Actions'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-white/35 uppercase tracking-wider py-3 px-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} className="border-b border-white/6 hover:bg-white/3 transition-colors">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      {a.logo_base64
                        ? <img src={a.logo_base64} alt="" className="w-8 h-8 rounded-lg object-contain bg-white/10 p-0.5"/>
                        : <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-sm">🏥</div>
                      }
                      <div>
                        <div className="text-white font-semibold text-sm">{a.name}</div>
                        <div className="text-white/40 text-xs mt-0.5">{a.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-white/70 text-sm">{a.type}</td>
                  <td className="py-4 px-4 text-white/70 text-sm">{a.district}, {a.province}</td>
                  <td className="py-4 px-4 text-white/70 text-sm">{a.num_radiologists}</td>
                  <td className="py-4 px-4 text-white/50 text-xs">{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="py-4 px-4">
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_STYLES[a.status] || ''}`}>
                      {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex gap-2">
                      <button onClick={()=>setSelected(a)}
                        className="text-xs bg-white/10 text-white px-3 py-1.5 rounded-lg hover:bg-white/18 transition-colors">
                        View
                      </button>
                      {!['approved','rejected'].includes(a.status) && (
                        <button onClick={()=>approveApp(a.id)}
                          className="text-xs bg-green-900/30 text-green-300 px-3 py-1.5 rounded-lg hover:bg-green-900/50 transition-colors">
                          Approve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center text-white/30 py-16">No applications found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setSelected(null)}>
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-8 border-b border-green-50 flex items-start justify-between">
              <div className="flex items-center gap-4">
                {selected.logo_base64
                  ? <img src={selected.logo_base64} alt="" className="w-14 h-14 rounded-xl object-contain border border-green-100 p-1"/>
                  : <div className="w-14 h-14 rounded-xl bg-green-50 flex items-center justify-center text-2xl">🏥</div>
                }
                <div>
                  <h3 className="font-bold text-[#0d3320] text-xl" style={{fontFamily:'Georgia,serif'}}>{selected.name}</h3>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-block mt-1 ${STATUS_STYLES[selected.status]||''}`}>
                    {selected.status}
                  </span>
                </div>
              </div>
              <button onClick={()=>setSelected(null)} className="w-8 h-8 bg-green-50 rounded-full flex items-center justify-center text-green-600 hover:bg-green-100">✕</button>
            </div>
            <div className="p-8 space-y-6">
              {[
                { title: 'Organisation', fields: [
                  ['Type', selected.type], ['MoH License', selected.moh_license],
                  ['Email', selected.email], ['Phone', selected.phone],
                ]},
                { title: 'Location', fields: [
                  ['Province', selected.province], ['District', selected.district],
                  ['Contact', selected.contact_name], ['Role', selected.contact_role],
                  ['Address', selected.address],
                ]},
                { title: 'Radiology Capacity', fields: [
                  ['Radiologists', selected.num_radiologists], ['X-Ray Machines', selected.num_machines],
                  ['Monthly Volume', selected.monthly_volume],
                ]},
              ].map(section => (
                <div key={section.title}>
                  <div className="text-xs font-bold text-green-600 uppercase tracking-wider mb-3">{section.title}</div>
                  <div className="grid grid-cols-2 gap-3">
                    {section.fields.map(([l,v]) => v && (
                      <div key={l}>
                        <div className="text-xs text-green-500 mb-0.5">{l}</div>
                        <div className="text-sm font-medium text-[#0d3320]">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {selected.notes && (
                <div>
                  <div className="text-xs font-bold text-green-600 uppercase tracking-wider mb-2">Notes</div>
                  <p className="text-sm text-green-800 bg-green-50 rounded-xl p-3">{selected.notes}</p>
                </div>
              )}

              {/* Actions for pending */}
              {!['approved','rejected'].includes(selected.status) && (
                <div className="space-y-4 pt-4 border-t border-green-50">
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-2">Schedule Google Meet</label>
                    <div className="flex gap-2">
                      <input value={meetLink} onChange={e=>setMeetLink(e.target.value)}
                        placeholder="https://meet.google.com/xxx-xxxx-xxx"
                        className="flex-1 border border-green-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-green-500"/>
                      <button onClick={()=>updateStatus(selected.id,'meeting',{meet_link:meetLink})} disabled={!meetLink||actionLoading}
                        className="bg-purple-100 text-purple-700 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-200 transition-colors disabled:opacity-50">
                        📹 Send Invite
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={()=>approveApp(selected.id)} disabled={actionLoading}
                      className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors disabled:opacity-50">
                      ✓ Approve & Send Credentials
                    </button>
                    <button onClick={()=>updateStatus(selected.id,'rejected',rejectReason?{rejection_reason:rejectReason}:{})} disabled={actionLoading}
                      className="bg-red-50 text-red-600 px-6 py-3 rounded-xl font-semibold hover:bg-red-100 transition-colors disabled:opacity-50">
                      Reject
                    </button>
                  </div>
                  <input value={rejectReason} onChange={e=>setRejectReason(e.target.value)}
                    placeholder="Rejection reason (optional, sent to applicant)"
                    className="w-full border border-green-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-green-500"/>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}