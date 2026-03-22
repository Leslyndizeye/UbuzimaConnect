// components/HospitalAdminDashboard.tsx
// Hospital partnership dashboard — manages hospital applications + sees live stats per hospital
// byakwelianiela@gmail.com only
// Uses localStorage to persist login across refreshes
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseConfig';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

const DARK_GREEN = '#166534';
const SLATE = '#475569';
const SOFT_RED = '#DC2626';
const BG_APP     = '#F2F4F7';
const AUDIT_PAGE_SIZE = 10;

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; font-family: 'Plus Jakarta Sans', sans-serif; }
::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
 .clean-scroll { scrollbar-width: none; -ms-overflow-style: none; }
 .clean-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }
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
  id: number; ref_number: string; hospital_id: number | null; name: string; type: string;
  email: string; phone: string; moh_license: string | null;
  license_document_name: string | null;
  province: string; district: string; address: string;
  contact_name: string; contact_role: string;
  num_radiologists: string; num_machines: string; monthly_volume: string;
  notes: string; status: string; meet_link: string | null;
  rejection_reason: string | null; logo_base64: string | null;
  created_at: string;
}

interface Hospital {
  id: number; name: string; type: string; email: string; phone: string;
  moh_license: string | null; license_document_name: string | null;
  website: string; province: string; district: string;
  address: string; contact_name: string; contact_role: string;
  logo_base64: string | null; num_radiologists: string; num_machines: string;
  monthly_volume: string; is_active: boolean; created_at: string; approved_at: string;
}

interface HospitalStats {
  hospital_id: number; hospital_name: string;
  radiologists: { total: number; approved: number; pending: number };
  patients: { total: number };
  diagnoses: { total: number };
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

type DeleteDialogState =
  | { kind: 'application'; id: number; name: string }
  | { kind: 'hospital_access'; id: number; name: string }
  | null;

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pending:   { bg: '#F8FAFC', text: SLATE },
  reviewing: { bg: '#F8FAFC', text: SLATE },
  meeting:   { bg: '#ECFDF3', text: DARK_GREEN },
  approved:  { bg: '#ECFDF3', text: DARK_GREEN },
  rejected:  { bg: '#FEF2F2', text: SOFT_RED },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] || { bg: '#F1F5F9', text: '#475569' };
  return <span className="inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-full capitalize" style={{ backgroundColor: c.bg, color: c.text }}>{status}</span>;
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`panel-card ${className}`}>{children}</div>;
}

interface AuditEntry {
  id: number; user_id: number | null; action: string;
  entity: string | null; entity_id: number | null;
  detail: Record<string, any> | null; timestamp: string;
}

type MainTab = 'overview' | 'applications' | 'hospitals' | 'audit';

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
  const [hospitalLoadErrors, setHospitalLoadErrors] = useState<Record<number, string>>({});

  const [selected, setSelected]     = useState<Application | null>(null);
  const [selectedHosp, setSelectedHosp] = useState<Hospital | null>(null);
  const [loadingStats, setLoadingStats]  = useState<number | null>(null);

  const [meetLink, setMeetLink]         = useState('');
  const [meetLinkErr, setMeetLinkErr]   = useState('');
  const [meetDate, setMeetDate]         = useState('');
  const [meetTime, setMeetTime]         = useState('');
  const [meetDuration, setMeetDuration] = useState('30');
  const [meetNotes, setMeetNotes]       = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [modalErr, setModalErr]         = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]             = useState('');

  // Create Admin modal
  const [createAdminHosp, setCreateAdminHosp] = useState<Hospital | null>(null);
  const [adminEmail, setAdminEmail]     = useState('');
  const [adminName, setAdminName]       = useState('');
  const [adminPass, setAdminPass]       = useState('');
  const [adminErr, setAdminErr]         = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminCreated, setAdminCreated] = useState<{ email: string; hospital_name: string; password: string } | null>(null);

  // Hospital admin info per hospital
  const [hospitalAdmins, setHospitalAdmins] = useState<Record<number, { id: number; email: string; full_name: string; last_login: string | null } | null>>({});

  // Audit log
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditHasMore, setAuditHasMore] = useState(true);
  const auditBodyRef = useRef<HTMLDivElement | null>(null);

  // Change admin password modal
  const [changePwdHospId, setChangePwdHospId] = useState<number | null>(null);
  const [newPwd, setNewPwd]     = useState('');
  const [generatedPwd, setGeneratedPwd] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdErr, setPwdErr]     = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  const buildStarterPassword = useCallback(() => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const symbols = '!@#$%';
    let base = '';
    for (let i = 0; i < 10; i += 1) {
      base += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return `${base}${symbols[Math.floor(Math.random() * symbols.length)]}`;
  }, []);

  const hdr = useCallback((): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
  }), [token]);

  const getFreshAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const freshToken = data.session?.access_token || token;
    if (!freshToken) {
      throw new Error('Your session has expired. Please sign in again.');
    }
    if (freshToken !== token) {
      localStorage.setItem('hosp_admin_token', freshToken);
      setToken(freshToken);
    }
    return { Authorization: `Bearer ${freshToken}` };
  }, [token]);

  const openProtectedFile = useCallback(async (path: string, _fallbackName: string) => {
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: hdr() });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'File not available');
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const win = window.open(objectUrl, '_blank', 'noopener,noreferrer');
      if (!win) {
        URL.revokeObjectURL(objectUrl);
        throw new Error('Popup blocked while opening document.');
      }
      const revoke = () => URL.revokeObjectURL(objectUrl);
      win.addEventListener('beforeunload', revoke, { once: true });
      setTimeout(revoke, 60000);
    } catch (e: any) {
      setError(e.message);
    }
  }, [hdr]);

  const downloadProtectedFile = useCallback(async (path: string, fallbackName: string) => {
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: hdr() });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'File not available');
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fallbackName || 'document';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e: any) {
      setError(e.message);
    }
  }, [hdr]);

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

  const loadAudit = useCallback(async (reset = false) => {
    if (auditLoading && !reset) return;
    setAuditLoading(true);
    try {
      const headers = await getFreshAuthHeaders();
      const offset = reset ? 0 : auditLogs.length;
      const res = await fetch(`${API_BASE}/audit?limit=${AUDIT_PAGE_SIZE}&offset=${offset}`, { headers });
      if (!res.ok) return;
      const data: AuditEntry[] = await res.json();
      setAuditLogs(prev => reset ? data : [...prev, ...data]);
      setAuditHasMore(data.length === AUDIT_PAGE_SIZE);
    } catch {
      /* silent */
    } finally {
      setAuditLoading(false);
    }
  }, [auditLoading, auditLogs.length, getFreshAuthHeaders]);

  const handleAuditScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!auditHasMore || auditLoading) return;
    const target = e.currentTarget;
    const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 80;
    if (nearBottom) void loadAudit();
  }, [auditHasMore, auditLoading, loadAudit]);

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

  useEffect(() => {
    setMeetLink(selected?.meet_link || '');
    setMeetLinkErr('');
    setMeetDate('');
    setMeetTime('');
    setMeetDuration('30');
    setMeetNotes('');
    setRejectReason(selected?.rejection_reason || '');
    setModalErr('');
  }, [selected?.id]);

  const fetchHospitalStats = async (hospitalId: number) => {
    setLoadingStats(hospitalId);
    try {
      const headers = await getFreshAuthHeaders();
      const [statsRes, radsRes, adminRes] = await Promise.all([
        fetch(`${API_BASE}/hospitals/${hospitalId}/stats`,       { headers }),
        fetch(`${API_BASE}/hospitals/${hospitalId}/radiologists`,{ headers }),
        fetch(`${API_BASE}/hospitals/${hospitalId}/admin`,       { headers }),
      ]);
      const failures: string[] = [];

      if (statsRes.ok) {
        const s = await statsRes.json();
        setHospitalStats(prev => ({ ...prev, [hospitalId]: s }));
      } else {
        failures.push('operational statistics');
      }
      if (radsRes.ok) {
        const r = await radsRes.json();
        setHospitalRads(prev  => ({ ...prev, [hospitalId]: r }));
      } else {
        failures.push('radiologist list');
      }
      if (adminRes.ok) {
        const a = await adminRes.json();
        setHospitalAdmins(prev => ({ ...prev, [hospitalId]: a.admin }));
      } else {
        setHospitalAdmins(prev => ({ ...prev, [hospitalId]: null }));
        failures.push('admin account');
      }

      setHospitalLoadErrors(prev => {
        const next = { ...prev };
        if (failures.length) next[hospitalId] = `Some hospital details could not be loaded yet: ${failures.join(', ')}.`;
        else delete next[hospitalId];
        return next;
      });
    } catch (e: any) {
      setHospitalLoadErrors(prev => ({ ...prev, [hospitalId]: e.message || 'Could not load this hospital.' }));
      setError(e.message);
    }
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

  useEffect(() => {
    const hospitalId = selected?.hospital_id;
    if (!hospitalId || hospitalAdmins[hospitalId] !== undefined || !token) return;

    (async () => {
      try {
        const headers = await getFreshAuthHeaders();
        const res = await fetch(`${API_BASE}/hospitals/${hospitalId}/admin`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        setHospitalAdmins(prev => ({ ...prev, [hospitalId]: data.admin || null }));
      } catch {
        // silent in modal
      }
    })();
  }, [selected?.hospital_id, hospitalAdmins, token, getFreshAuthHeaders]);

  const createHospitalAdminAccount = useCallback(async (
    hospital: Hospital,
    email: string,
    fullName: string,
    password: string,
  ) => {
    const headers = await getFreshAuthHeaders();
    const res = await fetch(`${API_BASE}/hospitals/${hospital.id}/create-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ email, full_name: fullName, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || 'Failed to create the hospital admin account.');
    }
    setAdminCreated({ email, hospital_name: hospital.name, password });
    setAdminEmail('');
    setAdminName('');
    setAdminPass('');
    await fetchHospitalStats(hospital.id);
    return data;
  }, [getFreshAuthHeaders]);

  const doLogin = async () => {
    setLoginErr(''); setLoginLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPass });
      if (error || !data.session) { setLoginErr('Invalid credentials.'); return; }
      const t = data.session.access_token;
      const test = await fetch(`${API_BASE}/hospital/applications`, { headers: { Authorization: `Bearer ${t}` } });
      if (!test.ok) { setLoginErr('Access denied. Authorised admin credentials required.'); await supabase.auth.signOut(); return; }
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

  const updateStatus = async (id: number, status: string, extra: Record<string, string | number> = {}) => {
    setActionLoading(true);
    setModalErr('');
    try {
      await fetch(`${API_BASE}/hospital/applications/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...hdr() },
        body: JSON.stringify({ status, ...extra }),
      });
      await fetchData(token);
      setSelected(null); setMeetLink(''); setMeetLinkErr(''); setMeetDate(''); setMeetTime(''); setMeetDuration('30'); setMeetNotes(''); setRejectReason('');
    } catch (e: any) { setModalErr(e.message); }
    finally { setActionLoading(false); }
  };

  const approveApp = async (id: number) => {
    if (!confirm('Approve this hospital and create their account?')) return;
    setActionLoading(true);
    try {
      const headers = await getFreshAuthHeaders();
      const activeToken = headers.Authorization.replace(/^Bearer\s+/i, '');
      const res = await fetch(`${API_BASE}/hospital/applications/${id}/approve`, {
        method: 'POST', headers,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
      const hospital = await res.json();
      const sourceApp = apps.find(app => app.id === id);
      const starterEmail = (sourceApp?.email || hospital.email || '').trim().toLowerCase();
      const starterName = (sourceApp?.contact_name || hospital.contact_name || '').trim();
      const starterPassword = buildStarterPassword();
      setHospitals(prev => {
        const next = [hospital, ...prev.filter(existing => existing.id !== hospital.id)];
        return next.sort((a, b) => new Date(b.approved_at || b.created_at).getTime() - new Date(a.approved_at || a.created_at).getTime());
      });
      await fetchData(activeToken);
      setSelected(null);
      setSelectedHosp(hospital);
      void fetchHospitalStats(hospital.id);
      setAdminCreated(null);
      setAdminErr('');
      setAdminEmail(starterEmail);
      setAdminName(starterName);
      setAdminPass(starterPassword);
      setTab('hospitals');
      try {
        await createHospitalAdminAccount(hospital, starterEmail, starterName, starterPassword);
        setCreateAdminHosp(hospital);
      } catch (adminErr: any) {
        setAdminErr(adminErr.message || 'Hospital approved, but admin account setup still needs attention.');
        setCreateAdminHosp(hospital);
      }
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const createAdmin = async () => {
    setAdminErr(''); setAdminLoading(true);
    try {
      await createHospitalAdminAccount(createAdminHosp!, adminEmail, adminName, adminPass);
      const headers = await getFreshAuthHeaders();
      await fetchData(headers.Authorization.replace(/^Bearer\s+/i, ''));
    } catch (e: any) { setAdminErr(e.message); }
    finally { setAdminLoading(false); }
  };

  const generateAdminPassword = async () => {
    if (!changePwdHospId || !hospitalAdmins[changePwdHospId]) return;
    setPwdErr(''); setPwdSuccess(''); setGeneratedPwd(''); setPwdLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${hospitalAdmins[changePwdHospId]!.id}/generate-password`, {
        method: 'POST',
        headers: hdr(),
      });
      const data = await res.json();
      if (!res.ok) { setPwdErr(data.detail || 'Failed to generate password'); return; }
      setGeneratedPwd(data.password || '');
      setPwdSuccess('Password generated successfully.');
      setNewPwd('');
    } catch (e: any) { setPwdErr(e.message); }
    finally { setPwdLoading(false); }
  };

  const changeAdminPassword = async () => {
    if (!changePwdHospId || !hospitalAdmins[changePwdHospId]) return;
    setPwdErr(''); setPwdLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${hospitalAdmins[changePwdHospId]!.id}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...hdr() },
        body: JSON.stringify({ password: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) { setPwdErr(data.detail || 'Failed to update password'); return; }
      setPwdSuccess('Password updated successfully!');
      setGeneratedPwd('');
      setNewPwd('');
      setTimeout(() => { setChangePwdHospId(null); setPwdSuccess(''); }, 2200);
    } catch (e: any) { setPwdErr(e.message); }
    finally { setPwdLoading(false); }
  };

  const deleteApp = async (a: Application) => {
    setDeleteDialog({ kind: 'application', id: a.id, name: a.name });
    setDeleteReason('');
    setModalErr('');
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
    setDeleteDialog({ kind: 'hospital_access', id: h.id, name: h.name });
    setDeleteReason('');
    setModalErr('');
  };

  const submitDeleteAction = async () => {
    if (!deleteDialog) return;
    const reason = deleteReason.trim();
    if (reason.length < 5) {
      setModalErr('Please enter a clear reason before continuing.');
      return;
    }
    setActionLoading(true);
    try {
      const path = deleteDialog.kind === 'application'
        ? `${API_BASE}/hospital/applications/${deleteDialog.id}`
        : `${API_BASE}/hospitals/${deleteDialog.id}/deactivate`;
      const res = await fetch(path, {
        method: deleteDialog.kind === 'application' ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json', ...hdr() },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) { setModalErr(data.detail || 'Delete failed'); return; }
      if (deleteDialog.kind === 'application') {
        setApps(prev => prev.filter(x => x.id !== deleteDialog.id));
        if (selected?.id === deleteDialog.id) setSelected(null);
      } else {
        setSelectedHosp(null);
      }
      await fetchData(token);
      setDeleteDialog(null);
      setDeleteReason('');
      setModalErr('');
    } catch (e: any) { setModalErr(e.message); }
    finally { setActionLoading(false); }
  };

  const getLinkedHospitalForApplication = (app: Application | null) => {
    if (!app) return null;
    if (app.hospital_id) {
      return hospitals.find(h => h.id === app.hospital_id) || null;
    }
    return hospitals.find(h =>
      h.name === app.name &&
      h.province === app.province &&
      h.district === app.district &&
      h.address === app.address
    ) || null;
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

  const selectedLinkedHospital = getLinkedHospitalForApplication(selected);
  const selectedHospitalAdmin = selectedLinkedHospital ? hospitalAdmins[selectedLinkedHospital.id] : null;
  const selectedOrgFields: Array<[string, string | null | undefined]> = selected ? [
    ['Type', selected.type],
    [selectedHospitalAdmin ? 'Admin Email' : selectedLinkedHospital ? 'Hospital Email' : 'Email', selectedHospitalAdmin?.email || selectedLinkedHospital?.email || selected.email],
    ...(selectedHospitalAdmin && selectedHospitalAdmin.email !== selected.email ? [['Application Email', selected.email] as [string, string]] : []),
    ['Phone', selected.phone],
  ] : [];

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
              <h2 className="text-xl font-black text-gray-900">Admin Portal</h2>
              <p className="text-xs text-gray-400 mt-1">Hospital Partnership Management</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-0.5">Email</label>
                <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  placeholder="Email address"
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
                  Reset link sent to <strong>{loginEmail}</strong>.<br/>Check your inbox and click the link.
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
    { id: 'audit',        label: 'Audit Log' },
  ];
  const headerTitle = tab === 'overview' ? 'Overview' : tab === 'applications' ? 'Hospital Applications' : tab === 'audit' ? 'Audit Log' : 'Active Hospitals';
  const headerSubtitle = tab === 'overview'
    ? 'Platform-wide hospital partnership status at a glance.'
    : tab === 'applications'
      ? 'Review, update, and manage incoming hospital applications.'
      : tab === 'audit'
        ? 'Track review actions and operational changes.'
        : 'Hospital partnership review and onboarding for approved facilities.';

  return (
    <>
      <style>{CSS}</style>
      <div className="min-h-screen flex text-slate-800" style={{ backgroundColor: BG_APP }}>

        {/* ── Sidebar ── */}
        <aside className="w-[240px] shrink-0 flex flex-col sticky top-4 h-[calc(100vh-2rem)] bg-white m-4 rounded-[32px] shadow-sm z-30">
          <div className="h-[80px] flex items-center justify-center px-6 gap-2.5 text-center">
            <div className="w-7 h-7 bg-emerald-900 rounded-lg flex items-center justify-center shrink-0">
              <div className="w-3.5 h-[1.5px] rounded-full bg-emerald-100" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-slate-900 leading-tight">Ubuzima Connect</div>
            </div>
          </div>
          <nav className="flex-1 px-4 space-y-1">
            {navItems.map(({ id, label, badge }) => (
              <button
                key={id}
                onClick={() => { setTab(id); if (id === 'audit') void loadAudit(true); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all text-[13px] ${tab === id ? 'font-bold' : 'text-slate-500 hover:bg-slate-50 font-semibold'}`}
                style={tab === id ? { backgroundColor: '#ECFDF3', color: DARK_GREEN } : undefined}
              >
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
          <header className="sticky top-0 z-20 px-8 pt-6 pb-4" style={{ backgroundColor: BG_APP }}>
            <div className="rounded-[28px] border border-slate-100 bg-white px-6 py-5 shadow-sm">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{headerTitle}</h1>
                  <p className="text-xs text-slate-400 mt-1">{headerSubtitle}</p>
                </div>
                {error && (
                  <div className="px-4 py-2 rounded-full text-xs font-semibold bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
                    {error}
                    <button onClick={() => setError('')} className="font-bold">X</button>
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {navItems.map(({ id, label, badge }) => (
                  <button
                    key={id}
                    onClick={() => { setTab(id); if (id === 'audit') void loadAudit(true); }}
                    className={`px-4 py-2 rounded-full text-[11px] font-bold transition-all ${
                      tab === id ? 'text-white' : 'bg-slate-50 text-slate-500 border border-slate-200'
                    }`}
                    style={tab === id ? { backgroundColor: DARK_GREEN } : {}}
                  >
                    {label}
                    {badge !== undefined && badge > 0 && (
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] ${tab === id ? 'bg-white/20 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                        {badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
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
                        <div key={h.id} className="p-4 rounded-2xl border border-slate-200/80 hover:bg-slate-50 transition-all cursor-pointer"
                          onClick={() => { setSelectedHosp(h); setTab('hospitals'); }}>
                          <div className="flex items-center gap-3 mb-3">
                            {h.logo_base64
                              ? <img src={h.logo_base64} alt="" className="w-9 h-9 rounded-xl object-contain border border-slate-100 p-0.5" />
                              : <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black" style={{ backgroundColor: '#ECFDF3', color: DARK_GREEN }}>{h.name.charAt(0)}</div>
                            }
                            <div>
                              <p className="text-sm font-bold text-slate-800">{h.name}</p>
                              <p className="text-[10px] text-slate-400">{h.district}, {h.province}</p>
                            </div>
                          </div>
                          {s ? (
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { n: s.radiologists.approved, l: 'Radiologists' },
                                { n: s.patients.total,        l: 'Patients' },
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
                                <button onClick={() => deleteApp(a)} className="btn-s text-[11px] font-bold px-3 py-1.5 rounded-full bg-red-50 border border-red-200 hover:bg-red-100" style={{ color: SOFT_RED }}>Delete</button>
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
                  const loadErr = hospitalLoadErrors[h.id];
                  const isExpanded = selectedHosp?.id === h.id;

                  return (
                    <Panel key={h.id} className="overflow-hidden border border-slate-200/80 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                      {/* Hospital header row */}
                      <div className="flex items-center gap-4 px-6 py-5 cursor-pointer hover:bg-slate-50/50 transition-colors"
                        onClick={() => {
                          setSelectedHosp(isExpanded ? null : h);
                          if (!s) fetchHospitalStats(h.id);
                        }}>
                        <button className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold border-2 shrink-0 transition-all"
                          style={isExpanded ? { backgroundColor: DARK_GREEN, color: 'white', borderColor: DARK_GREEN } : { borderColor: '#CBD5E1', color: SLATE }}>
                          {isExpanded ? '▾' : '▸'}
                        </button>
                        {h.logo_base64
                          ? <img src={h.logo_base64} alt="" className="w-10 h-10 rounded-xl object-contain border border-slate-100 p-0.5 shrink-0" />
                          : <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black shrink-0" style={{ backgroundColor: '#ECFDF3', color: DARK_GREEN }}>{h.name.charAt(0)}</div>
                        }
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="text-base font-bold text-slate-900">{h.name}</p>
                            <StatusBadge status="approved" />
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{h.type}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{h.district}, {h.province} · {h.email} · Active since {fmt(h.approved_at)}</p>
                        </div>
                        {/* Quick stat pills */}
                        {s && (
                          <div className="flex gap-3 shrink-0">
                            {[
                              { n: s.radiologists.approved, l: 'Radiologists', color: DARK_GREEN, bg: '#ECFDF3' },
                              { n: s.patients.total,        l: 'Patients',     color: SLATE, bg: '#F8FAFC' },
                            ].map(stat => (
                              <div key={stat.l} className="text-center rounded-2xl px-4 py-2 border border-slate-200/80" style={{ backgroundColor: stat.bg }}>
                                <div className="text-lg font-black" style={{ color: stat.color }}>{stat.n}</div>
                                <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">{stat.l}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {loadingStats === h.id && <div className="w-5 h-5 border-2 rounded-full animate-spin shrink-0" style={{ borderColor: '#CBD5E1', borderTopColor: DARK_GREEN }} />}
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="border-t border-slate-200/80 bg-slate-50/55 px-6 py-6 space-y-6">
                          {loadErr && (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold" style={{ color: SOFT_RED }}>
                              {loadErr}
                            </div>
                          )}

                          {/* Hospital info */}
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Hospital Information</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {[
                                ['Phone', h.phone],
                                ['Contact Person', h.contact_name],
                                ['Contact Role', h.contact_role],
                                ['X-Ray Machines', h.num_machines],
                                ['Monthly Volume', h.monthly_volume],
                                ['Website', h.website || '—'],
                                ['Address', h.address],
                              ].map(([l, v]) => (
                                <div key={l} className="bg-white rounded-xl p-3 border border-slate-200/70">
                                  <p className="text-[9px] text-slate-400 mb-0.5">{l}</p>
                                  <p className="text-xs font-bold text-slate-800 truncate">{v}</p>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 bg-white rounded-xl p-4 border border-slate-200/70 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="text-[9px] text-slate-400 mb-0.5">Health Facility License</p>
                                <p className="text-xs font-bold text-slate-800">{h.license_document_name || 'Not uploaded'}</p>
                              </div>
                              {h.license_document_name && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => openProtectedFile(`/hospitals/${h.id}/license-document`, h.license_document_name || 'health-facility-license')}
                                    className="btn-s px-3 py-2 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold"
                                  >
                                    View License
                                  </button>
                                  <button
                                    onClick={() => downloadProtectedFile(`/hospitals/${h.id}/license-document`, h.license_document_name || 'health-facility-license')}
                                    className="btn-s px-3 py-2 rounded-full text-white text-[11px] font-bold"
                                    style={{ backgroundColor: DARK_GREEN }}
                                  >
                                    Download
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Radiologists table */}
                          {rs && rs.length > 0 && (
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Radiologists ({rs.length})</p>
                              <div className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden">
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
                                          <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: r.total_diagnoses > 0 ? DARK_GREEN : SLATE }}>
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
                          {s?.last_activity && (
                            <p className="text-[10px] text-slate-400">
                              Last diagnosis activity: <strong className="text-slate-600">{fmtFull(s.last_activity)}</strong>
                            </p>
                          )}

                          {/* Hospital Admin Status */}
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Hospital Admin Account</p>
                            {hospitalAdmins[h.id] ? (
                              <div className="bg-white rounded-2xl border border-slate-200/70 p-4 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0" style={{ backgroundColor: '#ECFDF3', color: DARK_GREEN }}>
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
                                    onClick={() => { setChangePwdHospId(h.id); setNewPwd(''); setGeneratedPwd(''); setPwdErr(''); setPwdSuccess(''); }}
                                    className="btn-s text-[10px] font-bold px-3 py-1.5 rounded-full text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200">
                                    Change Password
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                                <span className="text-slate-500 text-base">i</span>
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
                              Remove Hospital Access
                            </button>
                          </div>
                        </div>
                      )}
                    </Panel>
                  );
                })}
              </div>
            )}

            {/* ── AUDIT TAB ── */}
            {tab === 'audit' && (
              <div className="space-y-4 anim-in">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-400">System activity loads 10 records at a time as you scroll. No patient data is shown here.</p>
                  <button onClick={() => void loadAudit(true)} disabled={auditLoading}
                    className="btn-s flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-slate-600 bg-white border border-slate-200 disabled:opacity-40">
                    {auditLoading
                      ? <><div className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"/>Loading…</>
                      : '↻ Refresh'}
                  </button>
                </div>
                {auditLogs.length === 0 && !auditLoading && (
                  <Panel className="p-12 text-center text-sm text-slate-400">No audit events yet.</Panel>
                )}
                {auditLogs.length > 0 && (
                  <Panel className="overflow-hidden">
                    <div
                      ref={auditBodyRef}
                      className="overflow-x-auto overflow-y-auto max-h-[68vh]"
                      onScroll={handleAuditScroll}
                    >
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-100">
                            {['#', 'Action', 'Entity', 'Detail', 'Timestamp'].map(h => (
                              <th key={h} className="text-left px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {auditLogs.map(l => {
                            const actionColor =
                              l.action.includes('delete') || l.action.includes('reject') ? SOFT_RED
                              : l.action.includes('approve') || l.action.includes('create') ? DARK_GREEN
                              : SLATE;
                            return (
                              <tr key={l.id} className="trow border-b border-slate-50 last:border-0">
                                <td className="px-5 py-3 text-[11px] font-mono text-slate-400">#{l.id}</td>
                                <td className="px-5 py-3">
                                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white"
                                    style={{ backgroundColor: actionColor }}>
                                    {l.action}
                                  </span>
                                </td>
                                <td className="px-5 py-3 text-[11px] font-mono text-slate-500">
                                  {l.entity ? `${l.entity}${l.entity_id ? ` #${l.entity_id}` : ''}` : '—'}
                                </td>
                                <td className="px-5 py-3 text-[11px] text-slate-500 max-w-[280px]">
                                  {l.detail
                                    ? Object.entries(l.detail)
                                        .filter(([k]) => !['patient_id','nid','clinical_notes'].includes(k))
                                        .map(([k, v]) => `${k}: ${v}`)
                                        .join(' · ')
                                    : '—'}
                                </td>
                                <td className="px-5 py-3 text-[11px] font-mono text-slate-400 whitespace-nowrap">
                                  {fmtFull(l.timestamp)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div className="px-5 py-4 border-t border-slate-100 text-center text-xs text-slate-400">
                        {auditLoading && auditLogs.length > 0
                          ? 'Loading more audit events...'
                          : auditHasMore
                            ? 'Scroll down to load 10 more'
                            : 'End of audit log'}
                      </div>
                    </div>
                  </Panel>
                )}
              </div>
            )}

          </main>
        </div>

        {/* ── Change Admin Password modal ── */}
        {deleteDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,.45)', backdropFilter: 'blur(6px)' }}
            onClick={e => e.target === e.currentTarget && !actionLoading && setDeleteDialog(null)}>
            <div className="w-full max-w-md bg-white rounded-[28px] shadow-2xl p-8 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {deleteDialog.kind === 'application' ? 'Delete Application' : 'Remove Hospital Access'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {deleteDialog.kind === 'application'
                      ? `Explain why "${deleteDialog.name}" is being removed from onboarding.`
                      : `Explain why "${deleteDialog.name}" is losing access to Ubuzima Connect.`}
                  </p>
                </div>
                <button
                  onClick={() => !actionLoading && setDeleteDialog(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold">
                  X
                </button>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-xs text-red-700">
                This reason is required and will be emailed to the hospital contact.
              </div>
              {modalErr && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 font-medium">{modalErr}</div>}
              <textarea
                value={deleteReason}
                onChange={e => { setDeleteReason(e.target.value); setModalErr(''); }}
                placeholder="Enter the reason for this action"
                className="w-full min-h-[120px] px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm outline-none resize-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteDialog(null)}
                  disabled={actionLoading}
                  className="flex-1 py-3 rounded-full bg-slate-100 text-slate-600 font-bold text-sm disabled:opacity-40">
                  Cancel
                </button>
                <button
                  onClick={submitDeleteAction}
                  disabled={actionLoading}
                  className="btn-s flex-1 py-3 rounded-full text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ backgroundColor: SOFT_RED }}>
                  {actionLoading
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Sending...</>
                    : deleteDialog.kind === 'application' ? 'Delete & Notify' : 'Remove Access & Notify'}
                </button>
              </div>
            </div>
          </div>
        )}

        {changePwdHospId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,.45)', backdropFilter: 'blur(6px)' }}
            onClick={e => e.target === e.currentTarget && setChangePwdHospId(null)}>
            <div className="w-full max-w-md bg-white rounded-[28px] shadow-2xl p-8 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Manage Admin Password</h2>
                  {hospitalAdmins[changePwdHospId] && (
                    <>
                      <p className="text-sm font-semibold text-slate-700 mt-1">{hospitalAdmins[changePwdHospId]!.full_name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{hospitalAdmins[changePwdHospId]!.email}</p>
                    </>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    Choose one option below. You can either generate a secure password automatically or set a custom password manually.
                  </p>
                </div>
                <button onClick={() => setChangePwdHospId(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold">X</button>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">What happens next</p>
                <p className="text-xs text-slate-600 leading-6">
                  The hospital admin will use this email and password to sign in, then change the password to one they prefer after login.
                </p>
              </div>
              {pwdErr     && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 font-medium">{pwdErr}</div>}
              {pwdSuccess && <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-700 font-medium">{pwdSuccess}</div>}
              {generatedPwd && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Generated Password</p>
                  <div className="flex items-center justify-between gap-3">
                    <code className="text-xs font-mono font-bold text-slate-700 break-all">{generatedPwd}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(generatedPwd)}
                      className="btn-s shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold text-slate-600 bg-white border border-slate-200">
                      Copy
                    </button>
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Option 1</p>
                  <h3 className="text-sm font-bold text-slate-900 mt-1">Generate a secure password automatically</h3>
                  <p className="text-xs text-slate-500 mt-1">Use this if you want the system to create a ready-to-share password immediately.</p>
                </div>
                <button onClick={generateAdminPassword} disabled={pwdLoading}
                  className="btn-s w-full py-3 rounded-full text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ backgroundColor: DARK_GREEN }}>
                  {pwdLoading
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Processing...</>
                    : 'Generate Password'}
                </button>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Option 2</p>
                  <h3 className="text-sm font-bold text-slate-900 mt-1">Set a custom password manually</h3>
                  <p className="text-xs text-slate-500 mt-1">Use at least 8 characters so the admin can sign in safely on first login.</p>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Custom Password</label>
                  <input value={newPwd} onChange={e => setNewPwd(e.target.value)}
                    type="password" placeholder="Enter a new password"
                    onKeyDown={e => e.key === 'Enter' && newPwd.length >= 8 && changeAdminPassword()}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
                  <p className="text-[10px] text-slate-400 mt-2">Minimum 8 characters.</p>
                </div>
                <button onClick={changeAdminPassword} disabled={pwdLoading || newPwd.length < 8}
                  className="btn-s w-full py-3 rounded-full text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ backgroundColor: DARK_GREEN }}>
                  {pwdLoading
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Updating...</>
                    : 'Save Custom Password'}
                </button>
              </div>
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
                  <button onClick={() => setCreateAdminHosp(null)} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold">X</button>
                </div>
              </div>
              <div className="p-8 space-y-4">
                {adminCreated ? (
                  <div className="space-y-4">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center space-y-2">
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
                      <span className="font-bold">Hospital approved.</span> Now set up their admin account. Send credentials to <strong>{createAdminHosp.email}</strong>.
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
            <div className="clean-scroll w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="px-8 pt-7 pb-6 border-b border-slate-100" style={{ background: `linear-gradient(135deg,${DARK_GREEN},${SLATE})` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selected.logo_base64
                      ? <img src={selected.logo_base64} alt="" className="w-12 h-12 rounded-xl object-contain bg-white/10 p-1" />
                      : <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-white font-black text-lg">{selected.name.charAt(0)}</div>
                    }
                    <div>
                      <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                      <p className="text-xs text-white/70 mt-0.5">{selected.type || 'Health facility'} · {selected.district}, {selected.province}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selected.status} />
                    <button onClick={() => setSelected(null)} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold ml-2">X</button>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-5">
                {/* Details */}
                {[
                  { title: 'Organisation', fields: selectedOrgFields },
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
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Health Facility License</p>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 break-words">{selected.license_document_name || 'Not uploaded'}</p>
                      {selected.moh_license && (
                        <p className="text-[10px] text-slate-400 mt-1">Legacy license reference: {selected.moh_license}</p>
                      )}
                    </div>
                    {selected.license_document_name && (
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => openProtectedFile(`/hospital/applications/${selected.id}/license-document`, selected.license_document_name || 'health-facility-license')}
                          className="btn-s px-2.5 py-1.5 rounded-full bg-white text-slate-600 text-[10px] font-bold border border-slate-200"
                        >
                          View License
                        </button>
                        <button
                          onClick={() => downloadProtectedFile(`/hospital/applications/${selected.id}/license-document`, selected.license_document_name || 'health-facility-license')}
                          className="btn-s px-2.5 py-1.5 rounded-full text-white text-[10px] font-bold"
                          style={{ backgroundColor: DARK_GREEN }}
                        >
                          Download
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {selected.notes && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <p className="text-[9px] font-bold uppercase text-slate-500 mb-1">Notes from applicant</p>
                    <p className="text-xs text-slate-700">{selected.notes}</p>
                  </div>
                )}

                {selected.rejection_reason && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                    <p className="text-[9px] font-bold uppercase text-red-400 mb-1">Rejection reason</p>
                    <p className="text-xs text-red-700">{selected.rejection_reason}</p>
                  </div>
                )}
                {modalErr && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-xs text-red-700 font-medium">{modalErr}</p>
                  </div>
                )}

                {/* Action area for pending */}
                {!['approved', 'rejected'].includes(selected.status) && (
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2">Meeting Status</p>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Add the Google Meet link, meeting date, time, and duration. When you save, the applicant will receive a scheduled meeting email with those details.
                        </p>
                      </div>
                      <div className="relative">
                        <input value={meetLink} onChange={e => { setMeetLink(e.target.value); setMeetLinkErr(''); }}
                          placeholder="https://meet.google.com/abc-defg-hij"
                          className={`w-full px-3.5 py-2.5 rounded-xl border bg-gray-50 text-xs outline-none transition-all ${meetLinkErr ? 'border-red-300' : meetLink && !meetLinkErr ? 'border-green-300' : 'border-gray-200'}`} />
                        {meetLink && !meetLinkErr && /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(meetLink.trim()) && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-700 text-sm">OK</span>
                        )}
                      </div>
                      {meetLinkErr && <p className="text-[10px] text-red-500 font-semibold ml-0.5">{meetLinkErr}</p>}
                      <p className="text-[9px] text-slate-400 ml-0.5">Required format: https://meet.google.com/xxx-xxxx-xxx</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="date"
                          value={meetDate}
                          onChange={e => { setMeetDate(e.target.value); setModalErr(''); }}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs outline-none"
                        />
                        <input
                          type="time"
                          value={meetTime}
                          onChange={e => { setMeetTime(e.target.value); setModalErr(''); }}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs outline-none"
                        />
                        <input
                          type="number"
                          min="5"
                          step="5"
                          value={meetDuration}
                          onChange={e => setMeetDuration(e.target.value)}
                          placeholder="Duration (min)"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs outline-none"
                        />
                      </div>
                      <textarea
                        value={meetNotes}
                        onChange={e => setMeetNotes(e.target.value)}
                        placeholder="Optional note to include in the email, for example: Please join 10 minutes early with your Head of Radiology or IT Manager."
                        className="w-full px-3.5 py-3 rounded-xl border border-gray-200 bg-gray-50 text-xs outline-none min-h-[84px] resize-none"
                      />
                      <button onClick={() => {
                        if (!validateMeetLink(meetLink)) return;
                        if (!meetDate || !meetTime) { setModalErr('Meeting date and time are required before sending the invitation email.'); return; }
                        updateStatus(selected.id, 'meeting', {
                          meet_link: meetLink.trim(),
                          meet_date: meetDate,
                          meet_time: meetTime,
                          meet_duration_minutes: Number(meetDuration || 0),
                          meet_notes: meetNotes.trim(),
                        });
                      }}
                        disabled={actionLoading}
                        className="btn-s w-full py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                        style={{ backgroundColor: SLATE }}>
                        {actionLoading ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Sending...</> : 'Schedule Meeting & Send Email'}
                      </button>
                    </div>
                    <input value={rejectReason} onChange={e => { setRejectReason(e.target.value); setModalErr(''); }}
                      placeholder="Rejection reason (required)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs outline-none" />
                    <div className="flex gap-2">
                      <button onClick={() => approveApp(selected.id)} disabled={actionLoading}
                        className="btn-s flex-1 py-2.5 rounded-full text-white font-bold text-[12px] disabled:opacity-40" style={{ backgroundColor: DARK_GREEN }}>
                        Approve & Go Live
                      </button>
                      <button onClick={() => {
                        if (!rejectReason.trim()) { setModalErr('Rejection reason is required.'); return; }
                        updateStatus(selected.id, 'rejected', { rejection_reason: rejectReason.trim() });
                      }} disabled={actionLoading}
                        className="btn-s px-4 py-2.5 rounded-full font-bold text-[12px] bg-red-50 border border-red-200 disabled:opacity-40"
                        style={{ color: SOFT_RED }}>
                        Reject
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100">
                  <button onClick={() => deleteApp(selected)}
                    className="btn-s w-full py-2.5 rounded-full font-bold text-[12px] bg-red-50 border border-red-200 hover:bg-red-100"
                    style={{ color: SOFT_RED }}>
                    Delete Forever
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
