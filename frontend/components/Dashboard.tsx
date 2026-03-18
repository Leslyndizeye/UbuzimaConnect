// components/Dashboard.tsx — App shell + full Radiologist Dashboard
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './supabaseConfig';
import AuthPage from './AuthPage';
import AdminDashboard from './AdminDashboard';
import { useHospitalBranding } from '../hooks/useHospitalBranding';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';
// Admin status is determined by is_admin field from database only

// ─── Types ────────────────────────────────────────────────────────────────────
interface BUser {
  id: number; email: string; full_name: string; hospital?: string;
  hospital_id?: number;
  license_number?: string; specialization?: string; phone_number?: string;
  years_experience?: number; role: string; status: string; is_admin: boolean; created_at: string;
}
interface Patient {
  id: number; name: string; patient_ref_id?: string; age?: number; sex?: string; hospital?: string;
  clinical_notes?: string; created_at: string;
}
interface Diagnosis {
  id: number; patient_id: number; ai_classification: string; confidence_score: number;
  tb_probability: number; pneumonia_probability: number; normal_probability: number;
  unknown_probability?: number; radiologist_verified: boolean;
  radiologist_override?: string; radiologist_notes?: string;
  xray_filename?: string; xray_storage_path?: string; xray_b64?: string; heatmap_b64?: string; ai_explanation?: string; created_at: string;
}
interface Prediction {
  classification: string; confidence_score: number; tb_probability: number;
  pneumonia_probability: number; normal_probability: number; unknown_probability?: number;
  explanation?: string; gradcam_b64?: string; xray_storage_path?: string; xray_b64?: string;
}
interface ChatContact {
  id: number; full_name: string; email: string; specialization?: string; hospital_id?: number; status?: string; phone_number?: string; years_experience?: number;
}
interface ChatMessage {
  id: number; hospital_id: number; sender_id: number; recipient_id: number; message: string; created_at: string;
}
interface SharedDiagnosisPayload {
  type: 'diagnosis_report';
  diagnosis_id: number;
  patient_name: string;
  patient_ref_masked?: string;
  classification: string;
  ai_classification?: string;
  confidence_score: number;
  xray_b64?: string;
  heatmap_b64?: string;
  xray_filename?: string;
  radiologist_name?: string;
  hospital?: string;
  hospital_logo_base64?: string;
  shared_note?: string;
  radiologist_notes?: string;
  created_at?: string | null;
}
type Tab = 'diagnose' | 'history' | 'chat' | 'profile';
type AppState = 'loading' | 'unauthenticated' | 'pending' | 'rejected' | 'approved' | 'admin';

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) throw new Error('No session');
  
  // Check if token expires within 60 seconds — if so, refresh proactively
  const expiresAt = session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSec < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session?.access_token) return refreshed.session.access_token;
  }
  return session.access_token;
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = await getToken().catch(() => null);
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: { ...headers, ...(opts.headers as any) } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API ${res.status}`);
  }
  return res.json();
}

const validId = (v: string) => /^\d{16}$/.test(v.replace(/\s/g, ''));
// DB stores "TB" but we show "Tuberculosis" everywhere in the UI
const displayClass = (c: string) => c === 'TB' ? 'Tuberculosis' : c;
const toDbClass = (c: string) => c === 'Tuberculosis' ? 'TB' : c;
const SHARED_DIAGNOSIS_PREFIX = '__UBUZIMA_SHARED_DIAGNOSIS__:';
const fmt = (iso: string) => new Date(iso).toLocaleString('en-RW', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const isApprovedStatus = (status?: string) => (status || '').toLowerCase() === 'approved';
const maskNationalId = (value?: string) => {
  if (!value) return '—';
  const id = value.replace(/\s/g, '');
  if (id.length < 6) return id;
  return `${id.slice(0, 4)}••••••••••${id.slice(-2)}`;
};
const parseSharedDiagnosisMessage = (message: string): SharedDiagnosisPayload | null => {
  if (!message.startsWith(SHARED_DIAGNOSIS_PREFIX)) return null;
  try {
    const parsed = JSON.parse(message.slice(SHARED_DIAGNOSIS_PREFIX.length));
    return parsed?.type === 'diagnosis_report' ? parsed as SharedDiagnosisPayload : null;
  } catch {
    return null;
  }
};
const dataUrlToFile = async (dataUrl: string, filename: string) => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
};
const classBadge = (c: string) =>
  c === 'Normal' ? 'bg-emerald-100 text-emerald-700' :
  (c === 'Tuberculosis' || c === 'TB') ? 'bg-red-100 text-red-700' :
  c === 'Pneumonia' ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-100 text-zinc-600';
const reportPill = (c: string) =>
  c === 'Normal'
    ? 'border border-[#166534]/20 bg-[#166534]/10 text-[#166534]'
    : (c === 'Tuberculosis' || c === 'TB')
      ? 'border border-[#DC2626]/20 bg-[#DC2626]/10 text-[#DC2626]'
      : 'border border-[#475569]/20 bg-[#475569]/10 text-[#475569]';

function EyeBtn({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors">
      {show ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
      )}
    </button>
  );
}


// ─── Hospital Logo Upload (for middle admins only) ────────────────────────────
function HospitalLogoUpload({ hospitalId, currentLogo, onUploaded }: {
  hospitalId: number;
  currentLogo: string | null;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [preview, setPreview] = React.useState<string | null>(currentLogo);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
      setMsg('Only JPG, PNG or WebP allowed'); return;
    }
    setUploading(true); setMsg('');
    try {
      const token = await getToken();
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE}/hospitals/${hospitalId}/logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
      setMsg('✅ Logo uploaded and resized successfully!');
      // Show local preview
      const reader = new FileReader();
      reader.onload = ev => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
      setTimeout(onUploaded, 1500);
    } catch (err: any) {
      setMsg('Error: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    if (!confirm('Remove hospital logo?')) return;
    setUploading(true);
    try {
      const token = await getToken();
      await fetch(`${API_BASE}/hospitals/${hospitalId}/logo`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setPreview(null);
      setMsg('Logo removed.');
      setTimeout(onUploaded, 1000);
    } catch (err: any) {
      setMsg('Error: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-bold text-sm">Hospital Logo</div>
          <div className="text-xs text-gray-400 mt-0.5">Displayed on the radiologist dashboard for your hospital</div>
        </div>
        {preview && (
          <img src={preview} alt="Hospital logo" className="h-10 w-auto object-contain rounded-lg border border-gray-100" />
        )}
      </div>
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
          ${preview ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-100 hover:border-emerald-300 hover:bg-emerald-50/20'}`}>
        {uploading
          ? <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
              Uploading and resizing…
            </div>
          : preview
            ? <p className="text-[10px] text-emerald-600 font-semibold">Click to change logo · Auto-resized to 400×400px</p>
            : <p className="text-[10px] text-gray-400 font-medium">Click to upload hospital logo (JPG, PNG · max 5MB · auto-resized)</p>
        }
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
      </div>
      {preview && !uploading && (
        <button onClick={removeLogo} className="mt-2 text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors">
          Remove logo
        </button>
      )}
      {msg && (
        <div className={`mt-3 p-3 rounded-xl text-xs font-semibold ${msg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : msg.startsWith('Error') ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-gray-50 text-gray-600'}`}>
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── Radiologist Dashboard ────────────────────────────────────────────────────
function RadiologistDashboard({ user: init, onSignOut }: { user: BUser; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('diagnose');
  const [user, setUser] = useState(init);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [busy, setBusy] = useState(false);
  const branding = useHospitalBranding(user.hospital_id);

  // Diagnose state
  const [pName, setPName] = useState('');
  const [pNid, setPNid] = useState('');
  const [pAge, setPAge] = useState('');
  const [pSex, setPSex] = useState('');
  const [nidErr, setNidErr] = useState('');
  const [files, setFiles] = useState<File[]>([]);           // multiple images
  const [previews, setPreviews] = useState<string[]>([]);   // preview URLs
  const [activeImg, setActiveImg] = useState(0);            // which image is selected
  const [predicting, setPredicting] = useState(false);
  const [pred, setPred] = useState<Prediction | null>(null);
  const [savedDiag, setSavedDiag] = useState<Diagnosis | null>(null);
  const [savedPat, setSavedPat] = useState<Patient | null>(null);
  const [predErr, setPredErr] = useState('');
  const [predInfo, setPredInfo] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  // Verification inline after diagnosis
  const [showVerifyInline, setShowVerifyInline] = useState(false);
  const [scannedKeys, setScannedKeys] = useState<Set<string>>(new Set());
  const [inlineOverride, setInlineOverride] = useState('');
  const [inlineNotes, setInlineNotes] = useState('');
  const [inlineSaving, setInlineSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // History state
  const [expanded, setExpanded] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [editPat, setEditPat] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState('');
  const [verifyDiag, setVerifyDiag] = useState<Diagnosis | null>(null);
  const [verOverride, setVerOverride] = useState('');
  const [verNotes, setVerNotes] = useState('');
  const [verSaving, setVerSaving] = useState(false);
  const [diagImageUrls, setDiagImageUrls] = useState<Record<number, string>>({});
  const [diagImageAttempts, setDiagImageAttempts] = useState<Record<number, true>>({});
  const [chatContacts, setChatContacts] = useState<ChatContact[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const [contactsError, setContactsError] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [shareDiag, setShareDiag] = useState<Diagnosis | null>(null);
  const [sharePatient, setSharePatient] = useState<Patient | null>(null);
  const [sharePayload, setSharePayload] = useState<SharedDiagnosisPayload | null>(null);
  const [shareTargetId, setShareTargetId] = useState<number | null>(null);
  const [shareNote, setShareNote] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');
  const [reportView, setReportView] = useState<'received' | 'sent'>('received');

  // Profile state
  const [editing, setEditing] = useState(false);
  const [pFullName, setPFullName] = useState(user.full_name);
  const [pHospital, setPHospital] = useState(user.hospital || '');
  const [pPhone, setPPhone] = useState(user.phone_number || '');
  const [pSpec, setPSpec] = useState(user.specialization || '');
  const [pYears, setPYears] = useState(String(user.years_experience || ''));
  const [profSaving, setProfSaving] = useState(false);
  const [profMsg, setProfMsg] = useState('');
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw1, setShowPw1] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [pwMsg, setPwMsg] = useState('');

  const initials = user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  const identityLogo = branding?.logo_base64 || null;
  const hospitalDisplayName = branding?.name || user.hospital || '—';
  const inp = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-white';

  useEffect(() => {
    setPHospital(branding?.name || user.hospital || '');
  }, [branding?.name, user.hospital]);

  const loadData = useCallback(async () => {
    setBusy(true);
    setContactsError('');
    const contactsRequest = user.hospital_id
      ? apiFetch(`/hospitals/${user.hospital_id}/radiologists`)
      : Promise.resolve([]);
    const [pr, dr, cr] = await Promise.allSettled([apiFetch('/patients'), apiFetch('/diagnoses'), contactsRequest]);
    if (pr.status === 'fulfilled') setPatients(pr.value);
    if (dr.status === 'fulfilled') setDiagnoses(dr.value);
    if (cr.status === 'fulfilled') {
      const contacts = (cr.value || [])
        .filter((contact: ChatContact) => contact.id !== user.id && isApprovedStatus(contact.status))
        .sort((a: ChatContact, b: ChatContact) => a.full_name.localeCompare(b.full_name));
      setChatContacts(contacts);
      setActiveChatId(prev => {
        if (prev && contacts.some((contact: ChatContact) => contact.id === prev)) return prev;
        return null;
      });
    } else {
      setChatContacts([]);
      setActiveChatId(null);
      setContactsError(user.hospital_id ? 'Could not load approved radiologists in your hospital.' : 'Your hospital is not linked yet.');
    }
    setBusy(false);
  }, [user.hospital_id, user.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Diagnose ────────────────────────────────────────────────────────────────
  const onNid = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 16);
    setPNid(d);
    setNidErr(d.length > 0 && d.length < 16 ? 'Must be exactly 16 digits' : '');
  };

  // Convert any image format to JPEG blob
  const toJpeg = (file: File): Promise<File> => new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url);
        const converted = new File([blob!], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
        resolve(converted);
      }, 'image/jpeg', 0.95);
    };
    img.src = url;
  });

  const addImages = async (incoming: File[]) => {
    const imageFiles = incoming.filter(f => f.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp|tiff|tif|heic|heif|avif|svg)$/i.test(f.name));
    if (!imageFiles.length) return;
    const converted = await Promise.all(imageFiles.map(toJpeg));
    const newPreviews = converted.map(f => URL.createObjectURL(f));
    // Update all state together to avoid stale closure bugs
    setFiles(prev => [...prev, ...converted]);
    setPreviews(prev => [...prev, ...newPreviews]);
    setActiveImg(prev => prev + converted.length - 1);
    setPred(null); setSavedDiag(null); setPredErr(''); setPredInfo('');
    setShowVerifyInline(false);
  };

  const onFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) await addImages(Array.from(e.target.files));
    e.target.value = '';
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    await addImages(Array.from(e.dataTransfer.files));
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(i => i.kind === 'file' && i.type.startsWith('image/'));
    if (imageItems.length) {
      const pastedFiles = imageItems.map(i => i.getAsFile()).filter(Boolean) as File[];
      await addImages(pastedFiles);
    }
  };

  const removeImage = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => { URL.revokeObjectURL(prev[idx]); return prev.filter((_, i) => i !== idx); });
    setActiveImg(prev => Math.max(0, prev >= idx ? prev - 1 : prev));
    setPred(null); setSavedDiag(null); setShowVerifyInline(false);
  };

  const runDiagnosis = async () => {
    const currentFile = files[activeImg];
    if (!currentFile || !pName.trim()) { setPredErr('Enter patient name and upload an X-ray'); return; }
    if (!validId(pNid)) { setPredErr('Enter a valid 16-digit Rwanda National ID'); return; }
    if (!pAge || isNaN(Number(pAge)) || Number(pAge) < 1 || Number(pAge) > 120) { setPredErr('Enter a valid patient age (1-120)'); return; }
    if (!pSex) { setPredErr('Select patient sex'); return; }
    // Warn if this exact image was already diagnosed this session
    const imgKey = `${currentFile.name}-${currentFile.size}`;
    if (scannedKeys.has(imgKey)) {
      setPredErr('This image was already diagnosed. Select a different thumbnail or add a new image.');
      return;
    }
    setPredicting(true); setPredErr(''); setPredInfo(''); setPred(null); setSavedDiag(null); setSavedPat(null);
    setShowVerifyInline(false);
    try {
      let patient: Patient | null = null;
      const existing = patients.find(p => p.patient_ref_id === pNid);
      if (existing) {
        patient = existing;
        setPredInfo(`Using existing patient: ${existing.name}`);
      } else {
        patient = await apiFetch('/patients', {
          method: 'POST',
          body: JSON.stringify({ name: pName.trim(), patient_ref_id: pNid, age: Number(pAge), sex: pSex }),
        });
        if (patient && patients.some(p => p.id === patient!.id)) {
          setPredInfo(`Existing patient — adding scan #${diagnoses.filter(d => d.patient_id === patient!.id).length + 1}`);
        }
      }
      if (!patient) throw new Error('Could not resolve patient');
      setSavedPat(patient);
      setPatients(prev => prev.some(p => p.id === patient!.id) ? prev : [patient!, ...prev]);

      const fd = new FormData(); fd.append('file', currentFile);
      const token = await getToken().catch(() => null);
      const res = await fetch(`${API_BASE}/predict`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Prediction failed'); }
      const result: Prediction = await res.json();
      setPred(result);

      const saved: Diagnosis = await apiFetch('/diagnoses', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: patient.id, xray_filename: currentFile.name,
          xray_storage_path: result.xray_storage_path,
          xray_b64: result.xray_b64,
          ai_classification: toDbClass(result.classification), confidence_score: result.confidence_score,
          tb_probability: result.tb_probability, pneumonia_probability: result.pneumonia_probability,
          normal_probability: result.normal_probability, unknown_probability: result.unknown_probability ?? 0,
          ai_explanation: result.explanation, heatmap_b64: result.gradcam_b64,
        }),
      });
      setSavedDiag(saved);
      setDiagnoses(prev => [saved, ...prev]);
      // Mark this image as scanned so user can't accidentally re-submit
      const imgKey = `${currentFile.name}-${currentFile.size}`;
      setScannedKeys(prev => new Set([...prev, imgKey]));
      // Refresh history so patient history tab shows the new scan
      loadData().catch(() => {});
      // Auto-open inline verify panel
      setInlineOverride(''); setInlineNotes(''); setShowVerifyInline(true);
    } catch (e: any) { setPredErr(e.message); }
    finally { setPredicting(false); }
  };

  const saveInlineVerify = async () => {
    if (!savedDiag) return;
    setInlineSaving(true);
    try {
      const finalClass = inlineOverride || pred?.classification || savedDiag.ai_classification;
      await apiFetch(`/diagnoses/${savedDiag.id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ override: toDbClass(inlineOverride) || null, radiologist_notes: inlineNotes || null }),
      });
      setShowVerifyInline(false);
      setDiagnoses(prev => prev.map(d => d.id === savedDiag.id
        ? { ...d, radiologist_verified: true, radiologist_override: inlineOverride || null, radiologist_notes: inlineNotes || null }
        : d
      ));
      setPredInfo(`Verified as ${finalClass}`);
      loadData().catch(() => {});
    } catch (e: any) {
      setPredErr(`Verification failed: ${e.message}`);
    } finally {
      setInlineSaving(false);
    }
  };

  const clearScan = () => {
    setPred(null); setSavedDiag(null); setSavedPat(null);
    setFiles([]); setPreviews([]); setActiveImg(0);
    setPName(''); setPNid('');
    setNidErr(''); setPredErr(''); setPredInfo('');
    setShowVerifyInline(false);
    setScannedKeys(new Set());
    if (fileRef.current) fileRef.current.value = '';
  };

  // ── Patient edit ────────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editPat?.name?.trim()) { setEditErr('Name is required'); return; }
    if (editPat.patient_ref_id && !validId(editPat.patient_ref_id)) { setEditErr('National ID must be exactly 16 digits'); return; }
    setEditSaving(true); setEditErr('');
    try {
      await apiFetch(`/patients/${editPat.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editPat.name.trim(),
          patient_ref_id: editPat.patient_ref_id || null,
          hospital: editPat.hospital || null,
          clinical_notes: editPat.clinical_notes || null,
        }),
      });
      setEditPat(null); loadData();
    } catch (e: any) { setEditErr(e.message); }
    finally { setEditSaving(false); }
  };

  // ── Verify diagnosis ────────────────────────────────────────────────────────
  const saveVerify = async () => {
    if (!verifyDiag) return;
    setVerSaving(true);
    try {
      await apiFetch(`/diagnoses/${verifyDiag.id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ override: verOverride || null, radiologist_notes: verNotes || null }),
      });
      setVerifyDiag(null); loadData();
    } catch (e: any) { alert(e.message); }
    finally { setVerSaving(false); }
  };

  // ── Profile ─────────────────────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!pFullName.trim()) { setProfMsg('Full name is required'); return; }
    if (!pPhone.trim()) { setProfMsg('Phone number is required'); return; }
    setProfSaving(true); setProfMsg('');
    try {
      const updated = await apiFetch(`/users/${user.id}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: pFullName.trim(),
          hospital: (branding?.name || pHospital).trim() || null,
          phone_number: pPhone.trim() || null,
          specialization: pSpec.trim() || null,
          years_experience: pYears ? parseInt(pYears) : null,
        }),
      });
      setUser(updated);
      setProfMsg('Profile updated successfully');
      // Close form after short delay so user sees the success message
      setTimeout(() => { setEditing(false); setProfMsg(''); }, 2000);
    } catch (e: any) {
      setProfMsg(`Error: ${e.message}`);
    } finally {
      setProfSaving(false);
    }
  };

  const changePw = async () => {
    if (!pwCurrent.trim()) { setPwMsg('Enter your current password first'); return; }
    if (pw1.length < 6) { setPwMsg('New password must be at least 6 characters'); return; }
    if (pw1 !== pw2) { setPwMsg('Passwords do not match'); return; }
    if (pw1 === pwCurrent) { setPwMsg('New password must be different from your current password'); return; }
    setPwMsg('Verifying your current password…');
    try {
      // Re-authenticate with current password first
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: pwCurrent,
      });
      if (signInErr) { setPwMsg('Current password is incorrect'); return; }
      // Now update to new password
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      setPwMsg('Password updated successfully');
      setPw1(''); setPw2(''); setPwCurrent('');
      setTimeout(() => { setPwOpen(false); setPwMsg(''); }, 2500);
    } catch (e: any) { setPwMsg(`Error: ${e.message}`); }
  };

  const fetchDiagnosisImageUrl = useCallback(async (diagnosis: Diagnosis) => {
    if (diagImageAttempts[diagnosis.id]) return null;
    if (!diagnosis.xray_storage_path && !diagnosis.xray_b64) return null;
    if (diagImageUrls[diagnosis.id]) return diagImageUrls[diagnosis.id];
    if (diagnosis.xray_b64) {
      setDiagImageUrls(prev => prev[diagnosis.id] ? prev : { ...prev, [diagnosis.id]: diagnosis.xray_b64! });
      setDiagImageAttempts(prev => prev[diagnosis.id] ? prev : { ...prev, [diagnosis.id]: true });
      return diagnosis.xray_b64;
    }
    const token = await getToken().catch(() => null);
    const res = await fetch(`${API_BASE}/diagnoses/${diagnosis.id}/image`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      setDiagImageAttempts(prev => prev[diagnosis.id] ? prev : { ...prev, [diagnosis.id]: true });
      return null;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    setDiagImageUrls(prev => prev[diagnosis.id] ? prev : { ...prev, [diagnosis.id]: url });
    setDiagImageAttempts(prev => prev[diagnosis.id] ? prev : { ...prev, [diagnosis.id]: true });
    return url;
  }, [diagImageAttempts, diagImageUrls]);

  useEffect(() => {
    if (tab !== 'history' || expanded == null) return;
    diagnoses
      .filter(d => d.patient_id === expanded && (d.xray_storage_path || d.xray_b64) && !diagImageUrls[d.id] && !diagImageAttempts[d.id])
      .forEach(d => { fetchDiagnosisImageUrl(d).catch(() => {}); });
  }, [tab, expanded, diagnoses, diagImageAttempts, diagImageUrls, fetchDiagnosisImageUrl]);

  useEffect(() => {
    if (!activeChatId) return;
    setReportView('received');
    setChatBusy(true); setChatError('');
    apiFetch(`/chat/messages/${activeChatId}`)
      .then(setChatMessages)
      .catch((e: any) => setChatError(e.message))
      .finally(() => setChatBusy(false));
  }, [activeChatId]);

  const exportPdfReport = async (patient: Patient | null, diagnosis: Diagnosis | null, prediction?: Prediction | null, sourceImage?: string | null) => {
    if (!patient || !diagnosis) return;
    const finalResult = diagnosis.radiologist_override || prediction?.classification || diagnosis.ai_classification;
    const storedImage = sourceImage || diagImageUrls[diagnosis.id] || await fetchDiagnosisImageUrl(diagnosis);
    const reportWindow = window.open('', '_blank', 'width=960,height=900');
    if (!reportWindow) return;
    const logo = identityLogo
      ? `<img src="${identityLogo}" alt="Hospital logo" style="max-height:56px;max-width:160px;object-fit:contain;" />`
      : '';
    const heatmap = diagnosis.heatmap_b64 ? `<img src="${diagnosis.heatmap_b64}" alt="Heatmap" style="max-width:100%;border-radius:12px;border:1px solid #e5e7eb;" />` : '<p style="color:#6b7280;">No heatmap available.</p>';
    const original = storedImage ? `<img src="${storedImage}" alt="X-ray" style="max-width:100%;border-radius:12px;border:1px solid #e5e7eb;" />` : `<p style="color:#6b7280;">Original X-ray preview was not stored for this record.</p>`;
    reportWindow.document.write(`<!doctype html><html><head><title>Ubuzima Report</title><style>
      body{font-family:Arial,sans-serif;padding:32px;color:#111827}
      h1,h2,h3{margin:0 0 12px}
      .brand{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:20px}
      .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:20px 0}
      .card{border:1px solid #e5e7eb;border-radius:14px;padding:16px;background:#fff}
      .label{font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:.08em}
      .value{font-size:15px;font-weight:700;margin-top:6px}
      .images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:18px}
    </style></head><body>
      <div class="brand">
        <div>
          <h1>Ubuzima Connect Report</h1>
          <p style="color:#6b7280;margin:0;">Generated ${new Date().toLocaleString('en-RW')}</p>
        </div>
        ${logo}
      </div>
      <div class="meta">
        <div class="card"><div class="label">Patient</div><div class="value">${patient.name}</div></div>
        <div class="card"><div class="label">National ID</div><div class="value">${maskNationalId(patient.patient_ref_id)}</div></div>
        <div class="card"><div class="label">Radiologist</div><div class="value">${user.full_name}</div></div>
        <div class="card"><div class="label">Hospital</div><div class="value">${hospitalDisplayName}</div></div>
        <div class="card"><div class="label">Final Result</div><div class="value">${displayClass(finalResult || 'Unknown')}</div></div>
        <div class="card"><div class="label">Confidence</div><div class="value">${diagnosis.confidence_score?.toFixed(1) || '0.0'}%</div></div>
      </div>
      <div class="images">
        <div class="card"><h3>Diagnosed Image</h3>${original}</div>
        <div class="card"><h3>AI Heatmap</h3>${heatmap}</div>
      </div>
    </body></html>`);
    reportWindow.document.close();
    reportWindow.focus();
    setTimeout(() => reportWindow.print(), 250);
  };

  const exportSharedReportPdf = (shared: SharedDiagnosisPayload, sentAt?: string | null) => {
    const reportWindow = window.open('', '_blank', 'width=960,height=900');
    if (!reportWindow) return;
    const logo = shared.hospital_logo_base64
      ? `<img src="${shared.hospital_logo_base64}" alt="Hospital logo" style="max-height:56px;max-width:160px;object-fit:contain;" />`
      : '';
    const original = shared.xray_b64
      ? `<img src="${shared.xray_b64}" alt="Diagnosed X-ray" style="max-width:100%;border-radius:12px;border:1px solid #e5e7eb;" />`
      : '<p style="color:#6b7280;">Diagnosed image was not attached to this shared report.</p>';
    const heatmap = shared.heatmap_b64
      ? `<img src="${shared.heatmap_b64}" alt="Heatmap" style="max-width:100%;border-radius:12px;border:1px solid #e5e7eb;" />`
      : '<p style="color:#6b7280;">No heatmap available.</p>';
    reportWindow.document.write(`<!doctype html><html><head><title>Ubuzima Shared Report</title><style>
      body{font-family:Arial,sans-serif;padding:32px;color:#111827}
      h1,h2,h3{margin:0 0 12px}
      .brand{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:20px}
      .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:20px 0}
      .card{border:1px solid #e5e7eb;border-radius:14px;padding:16px;background:#fff}
      .label{font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:.08em}
      .value{font-size:15px;font-weight:700;margin-top:6px}
      .images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:18px}
      .note{margin-top:18px}
    </style></head><body>
      <div class="brand">
        <div>
          <h1>Ubuzima Shared Report</h1>
          <p style="color:#6b7280;margin:0;">Generated ${new Date().toLocaleString('en-RW')}</p>
        </div>
        ${logo}
      </div>
      <div class="meta">
        <div class="card"><div class="label">Patient</div><div class="value">${shared.patient_name}</div></div>
        <div class="card"><div class="label">National ID</div><div class="value">${shared.patient_ref_masked || '—'}</div></div>
        <div class="card"><div class="label">Radiologist</div><div class="value">${shared.radiologist_name || '—'}</div></div>
        <div class="card"><div class="label">Hospital</div><div class="value">${shared.hospital || '—'}</div></div>
        <div class="card"><div class="label">Final Result</div><div class="value">${displayClass(shared.classification || 'Unknown')}</div></div>
        <div class="card"><div class="label">Confidence</div><div class="value">${shared.confidence_score?.toFixed(1) || '0.0'}%</div></div>
        <div class="card"><div class="label">Shared At</div><div class="value">${sentAt ? fmt(sentAt) : (shared.created_at ? fmt(shared.created_at) : '—')}</div></div>
        <div class="card"><div class="label">X-ray File</div><div class="value">${shared.xray_filename || '—'}</div></div>
      </div>
      ${shared.shared_note ? `<div class="card note"><div class="label">Shared Note</div><div class="value" style="font-size:14px;font-weight:500">${shared.shared_note}</div></div>` : ''}
      ${shared.radiologist_notes ? `<div class="card note"><div class="label">Clinical Note</div><div class="value" style="font-size:14px;font-weight:500">${shared.radiologist_notes}</div></div>` : ''}
      <div class="images">
        <div class="card"><h3>Diagnosed Image</h3>${original}</div>
        <div class="card"><h3>AI Heatmap</h3>${heatmap}</div>
      </div>
    </body></html>`);
    reportWindow.document.close();
    reportWindow.focus();
    setTimeout(() => reportWindow.print(), 250);
  };

  const openShareDiagnosis = (patient: Patient | null, diagnosis: Diagnosis | null) => {
    if (!patient || !diagnosis) return;
    setSharePatient(patient);
    setShareDiag(diagnosis);
    setSharePayload(null);
    setShareTargetId(activeChatId ?? chatContacts[0]?.id ?? null);
    setShareNote('');
    setShareError(chatContacts.length ? '' : 'No other approved radiologists are available in your hospital yet.');
  };

  const openForwardReport = (shared: SharedDiagnosisPayload) => {
    setSharePatient(null);
    setShareDiag(null);
    setSharePayload(shared);
    setShareTargetId(activeChatId ?? chatContacts[0]?.id ?? null);
    setShareNote(shared.shared_note || '');
    setShareError(chatContacts.length ? '' : 'No other approved radiologists are available in your hospital yet.');
  };

  const closeShareModal = () => {
    setShareDiag(null);
    setSharePatient(null);
    setSharePayload(null);
    setShareTargetId(null);
    setShareNote('');
    setShareError('');
  };

  const downloadSharedImage = (shared: SharedDiagnosisPayload) => {
    if (!shared.xray_b64) return;
    const link = document.createElement('a');
    link.href = shared.xray_b64;
    link.download = shared.xray_filename || `shared-report-${shared.diagnosis_id || 'image'}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const rediagnoseSharedImage = async (shared: SharedDiagnosisPayload) => {
    if (!shared.xray_b64) return;
    previews.forEach(url => URL.revokeObjectURL(url));
    const fileName = shared.xray_filename || `shared-report-${shared.diagnosis_id || Date.now()}.jpg`;
    const file = await dataUrlToFile(shared.xray_b64, fileName);
    const previewUrl = URL.createObjectURL(file);
    setFiles([file]);
    setPreviews([previewUrl]);
    setActiveImg(0);
    setPName(shared.patient_name || '');
    setPNid('');
    setPAge('');
    setPSex('');
    setPred(null);
    setSavedDiag(null);
    setSavedPat(null);
    setPredErr('');
    setPredInfo('Shared image loaded. Complete the patient details and run a new diagnosis.');
    setShowVerifyInline(false);
    setTab('diagnose');
  };

  const deleteSharedReport = async (messageId: number) => {
    if (!window.confirm('Delete this shared report from the thread?')) return;
    try {
      await apiFetch(`/chat/messages/${messageId}`, { method: 'DELETE' });
      setChatMessages(prev => prev.filter(msg => msg.id !== messageId));
    } catch (e: any) {
      setChatError(e.message);
    }
  };

  const deletePatientForever = async (patient: Patient) => {
    if (!window.confirm(`Delete ${patient.name} permanently? This removes the patient and all saved diagnoses.`)) return;
    setBusy(true);
    try {
      await apiFetch(`/patients/${patient.id}`, { method: 'DELETE' });
      setPatients(prev => prev.filter(p => p.id !== patient.id));
      setDiagnoses(prev => prev.filter(d => d.patient_id !== patient.id));
      if (expanded === patient.id) setExpanded(null);
      if (savedPat?.id === patient.id) { setSavedPat(null); setSavedDiag(null); }
      setPredInfo('Patient deleted permanently.');
    } catch (e: any) {
      setPredErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const sendSharedDiagnosis = async () => {
    if ((!shareDiag && !sharePayload) || !shareTargetId) {
      setShareError('Select a radiologist to share this diagnosis with.');
      return;
    }
    setShareBusy(true); setShareError('');
    try {
      const sent = await apiFetch(`/chat/messages/${shareTargetId}`, {
        method: 'POST',
        body: JSON.stringify(
          shareDiag
            ? { message: shareNote.trim(), shared_diagnosis_id: shareDiag.id }
            : { message: shareNote.trim(), forwarded_report: sharePayload }
        ),
      });
      if (activeChatId === shareTargetId) {
        setChatMessages(prev => [...prev, sent]);
      } else {
        setActiveChatId(shareTargetId);
      }
      setTab('chat');
      closeShareModal();
    } catch (e: any) {
      setShareError(e.message);
    } finally {
      setShareBusy(false);
    }
  };

  const filtered = patients.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.patient_ref_id || '').includes(search)
  );
  const selectedReportContact = chatContacts.find(c => c.id === activeChatId) || null;
  const sharedChatMessages = chatMessages.filter(msg => parseSharedDiagnosisMessage(msg.message));
  const activeContactMessages = activeChatId
    ? sharedChatMessages.filter(msg => msg.sender_id === activeChatId || msg.recipient_id === activeChatId)
    : [];
  const selectedReceivedCount = activeContactMessages.filter(msg => msg.recipient_id === user.id).length;
  const selectedSentCount = activeContactMessages.filter(msg => msg.sender_id === user.id).length;
  const visibleSharedChatMessages = sharedChatMessages.filter(msg =>
    reportView === 'sent' ? msg.sender_id === user.id : msg.recipient_id === user.id
  );
  const orderedVisibleSharedChatMessages = [...visibleSharedChatMessages].sort((a, b) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
  const filteredContacts = chatContacts.filter(contact => {
    const q = reportSearch.trim().toLowerCase();
    if (!q) return true;
    return contact.full_name.toLowerCase().includes(q) || (contact.email || '').toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Edit Patient Modal */}
      {editPat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold">Edit Patient</h2>
              <button onClick={() => setEditPat(null)} className="w-8 h-8 rounded-lg border flex items-center justify-center text-sm hover:bg-gray-50">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Full Name *</label>
                <input value={editPat.name} onChange={e => setEditPat({ ...editPat, name: e.target.value })} className={inp} />
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Rwanda National ID (16 digits)</label>
                <input value={editPat.patient_ref_id || ''} maxLength={16} inputMode="numeric"
                  onChange={e => setEditPat({ ...editPat, patient_ref_id: e.target.value.replace(/\D/g, '').slice(0, 16) })}
                  className={`${inp} font-mono`} placeholder="1199080012345678" />
                <div className="flex justify-between mt-1">
                  {editPat.patient_ref_id?.length > 0 && editPat.patient_ref_id.length < 16
                    ? <span className="text-[10px] text-red-500 font-semibold">Must be 16 digits</span>
                    : editPat.patient_ref_id?.length === 16
                      ? <span className="text-[10px] text-emerald-600 font-semibold">✓ Valid</span>
                      : <span />}
                  <span className="text-[10px] text-gray-400 font-mono">{(editPat.patient_ref_id || '').length}/16</span>
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Hospital</label>
                <input value={editPat.hospital || ''} onChange={e => setEditPat({ ...editPat, hospital: e.target.value })} className={inp} />
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Clinical Notes</label>
                <textarea value={editPat.clinical_notes || ''} onChange={e => setEditPat({ ...editPat, clinical_notes: e.target.value })} className={`${inp} h-20 resize-none`} />
              </div>
            </div>
            {editErr && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-semibold">{editErr}</div>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditPat(null)} className="flex-1 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-widest hover:bg-gray-50">Cancel</button>
              <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-40">
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verify Diagnosis Modal */}
      {verifyDiag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold">Verify Diagnosis</h2>
              <button onClick={() => setVerifyDiag(null)} className="w-8 h-8 rounded-lg border flex items-center justify-center text-sm hover:bg-gray-50">✕</button>
            </div>
            <div className={`p-4 rounded-2xl text-center border ${classBadge(verifyDiag.ai_classification)}`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1">AI Result</div>
              <div className="text-2xl font-black">{verifyDiag.ai_classification}</div>
              <div className="text-sm text-gray-500 mt-1">{verifyDiag.confidence_score.toFixed(1)}% confidence</div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Your Assessment</label>
                <select value={verOverride} onChange={e => setVerOverride(e.target.value)} className={inp}>
                  <option value="">Accept AI result — {verifyDiag.ai_classification}</option>
                  {['Normal', 'Pneumonia', 'Tuberculosis', 'Unknown'].filter(c => c !== verifyDiag.ai_classification).map(c => (
                    <option key={c} value={c}>Override → {c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Clinical Notes</label>
                <textarea value={verNotes} onChange={e => setVerNotes(e.target.value)} rows={3} className={`${inp} resize-none`} placeholder="Add your clinical observations..." />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setVerifyDiag(null)} className="flex-1 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-widest hover:bg-gray-50">Cancel</button>
              <button onClick={saveVerify} disabled={verSaving} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-40">
                {verSaving ? 'Saving…' : '✓ Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {(shareDiag && sharePatient) || sharePayload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold">{sharePayload ? 'Share Report Again' : 'Share Diagnosis'}</h2>
              <button onClick={closeShareModal}
                className="w-8 h-8 rounded-lg border flex items-center justify-center text-sm hover:bg-gray-50">X</button>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{sharePayload ? 'Selected Report' : 'Shared Result'}</div>
              <div className="text-sm font-bold text-gray-900">{sharePayload?.patient_name || sharePatient?.name}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${classBadge(sharePayload?.classification || shareDiag?.radiologist_override || shareDiag?.ai_classification || 'Unknown')}`}>
                  {displayClass(sharePayload?.classification || shareDiag?.radiologist_override || shareDiag?.ai_classification || 'Unknown')}
                </span>
                <span className="text-[11px] text-gray-500">{(sharePayload?.confidence_score ?? shareDiag?.confidence_score ?? 0).toFixed(1)}% confidence</span>
                <span className="text-[11px] text-gray-400">{sharePayload?.patient_ref_masked || maskNationalId(sharePatient?.patient_ref_id)}</span>
              </div>
              {sharePayload?.hospital && <div className="text-[11px] text-gray-500">{sharePayload.hospital}</div>}
            </div>
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Send To</label>
              <select value={shareTargetId ?? ""} onChange={e => setShareTargetId(e.target.value ? Number(e.target.value) : null)} className={inp}>
                <option value="">Select radiologist...</option>
                {chatContacts.map(contact => (
                  <option key={contact.id} value={contact.id}>{contact.full_name}{contact.specialization ? ` - ${contact.specialization}` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Note (optional)</label>
              <textarea value={shareNote} onChange={e => setShareNote(e.target.value)} rows={3}
                className={`${inp} resize-none`} placeholder="Add a short handoff note for this diagnosis..." />
            </div>
            {shareError && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-semibold">{shareError}</div>}
            <div className="flex gap-2 pt-1">
              <button onClick={closeShareModal}
                className="flex-1 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-widest hover:bg-gray-50">Cancel</button>
              <button onClick={sendSharedDiagnosis} disabled={shareBusy || !shareTargetId}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-40">
                {shareBusy ? "Sharing..." : (sharePayload ? "Share Again" : "Share")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-md">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-emerald-900 rounded-lg flex items-center justify-center">
              <div className="w-3 h-[1.5px] bg-emerald-100 rounded" />
            </div>
            <span className="text-sm font-bold uppercase tracking-widest text-gray-900">Ubuzima Connect</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setTab('profile')} className="flex items-center gap-2 hover:opacity-80">
              <div className="w-9 h-9 rounded-xl overflow-hidden border border-gray-200 bg-white flex items-center justify-center">
                {identityLogo
                  ? <img src={identityLogo} alt="Hospital logo" className="w-full h-full object-contain p-1" />
                  : <div className="w-full h-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-black">{initials}</div>}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-bold leading-tight">{user.full_name}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-widest">Radiologist</div>
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-100 bg-white sticky top-14 z-20">
        <div className="max-w-screen-xl mx-auto px-6 flex">
          {([
            { id: 'diagnose', label: 'Diagnose', icon: '' },
            { id: 'history', label: 'Patient History', icon: '◉', count: patients.length },
            { id: 'chat', label: 'Reports', icon: '✉', count: chatContacts.length },
            { id: 'profile', label: 'My Profile', icon: '' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${tab === t.id ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {t.icon} {t.label}
              {'count' in t && t.count > 0 && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 py-6">

        {/* ══ DIAGNOSE ══ */}
        {tab === 'diagnose' && (
          <div className="space-y-5" onPaste={onPaste}>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">New Diagnosis</h1>
              <p className="text-sm text-gray-400 mt-1">Upload chest X-rays · drag & drop · paste from clipboard</p>
            </div>
            <div className="grid lg:grid-cols-2 gap-5">

              {/* ── Left: Input panel ── */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Patient Details</div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Patient Full Name *</label>
                  <input value={pName} onChange={e => setPName(e.target.value)} placeholder="Jean Uwimana" className={inp} />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Rwanda National ID * <span className="normal-case font-normal">(16 digits)</span></label>
                  <input value={pNid} onChange={e => onNid(e.target.value)} placeholder="1199080012345678" maxLength={16} inputMode="numeric"
                    className={`${inp} font-mono ${nidErr ? 'border-red-400' : pNid.length === 16 ? 'border-emerald-400' : ''}`} />
                  <div className="flex justify-between mt-1">
                    {nidErr ? <span className="text-[10px] text-red-500 font-semibold">{nidErr}</span>
                      : pNid.length === 16 ? <span className="text-[10px] text-emerald-600 font-semibold">✓ Valid</span>
                      : <span className="text-[10px] text-gray-400">Must be exactly 16 digits</span>}
                    <span className="text-[10px] text-gray-400 font-mono">{pNid.length}/16</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Age (years) *</label>
                    <input type="number" min={1} max={120} value={pAge} onChange={e => setPAge(e.target.value)} placeholder="45" className={inp} />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Sex *</label>
                    <select value={pSex} onChange={e => setPSex(e.target.value)} className={inp}>
                      <option value="">Select…</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                </div>
                {/* Drop zone */}
                <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 pt-1">X-Ray Images</div>
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => !files.length && fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl transition-all ${
                    isDragging ? 'border-emerald-400 bg-emerald-50 scale-[1.01]' :
                    previews.length ? 'border-emerald-200 bg-white cursor-default' :
                    'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/10 cursor-pointer'
                  }`}
                >
                  {previews.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                      
                      <div className="text-sm font-semibold text-gray-500">Drop images here, click to browse, or paste</div>
                      <div className="text-xs text-gray-400">JPG · PNG · WEBP · BMP · TIFF · GIF · any image format</div>
                      <div className="text-[10px] text-emerald-600 font-semibold">All images auto-converted to JPEG</div>
                    </div>
                  ) : (
                    <div className="p-3 space-y-2">
                      {/* Active image preview */}
                      <div className="relative">
                        <img src={previews[activeImg]} alt="Selected X-ray" className="w-full max-h-48 object-contain rounded-xl bg-gray-50" />
                        <button onClick={e => { e.stopPropagation(); removeImage(activeImg); }}
                          className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600">✕</button>
                        <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                          {activeImg + 1} / {files.length}
                        </div>
                      </div>
                      {/* Thumbnails */}
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {previews.map((p, i) => {
                          const key = files[i] ? `${files[i].name}-${files[i].size}` : '';
                          const done = scannedKeys.has(key);
                          return (
                            <button key={i} onClick={e => { e.stopPropagation(); setActiveImg(i); setPred(null); setSavedDiag(null); setShowVerifyInline(false); }}
                              className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${i === activeImg ? 'border-emerald-500 scale-105' : done ? 'border-emerald-300' : 'border-gray-200 hover:border-emerald-300'}`}>
                              <img src={p} alt={`scan ${i+1}`} className="w-full h-full object-cover" />
                              {done && <div className="absolute inset-0 bg-emerald-500/60 flex items-center justify-center text-white text-lg font-bold">✓</div>}
                            </button>
                          );
                        })}
                        {/* Add more button */}
                        <button onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                          className="flex-shrink-0 w-14 h-14 rounded-lg border-2 border-dashed border-gray-300 hover:border-emerald-400 flex items-center justify-center text-gray-400 hover:text-emerald-500 text-xl">
                          +
                        </button>
                      </div>
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFileInput} className="hidden" />
                </div>

                {predInfo && <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 text-xs font-semibold">{predInfo.replace("ℹ️ ", "")}</div>}
                {predErr && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-semibold">{predErr}</div>}

                <button onClick={runDiagnosis} disabled={predicting || !files[activeImg] || !pName.trim() || !validId(pNid)}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-sm">
                  {predicting ? 'Analyzing…' : files.length > 1 ? `Analyze Image ${activeImg + 1} of ${files.length}` : 'Run AI Diagnosis'}
                </button>
                {files.length > 1 && (
                  <p className="text-[10px] text-center text-gray-400">Select a thumbnail above to switch which image to analyze</p>
                )}
              </div>

              {/* ── Right: Result panel ── */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">AI Result</div>
                {!pred && !predicting && (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-300 space-y-3">
                    
                    <div className="text-xs font-bold uppercase tracking-widest">Awaiting Scan</div>
                  </div>
                )}
                {predicting && (
                  <div className="flex flex-col items-center justify-center h-64 space-y-4">
                    <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
                    <div className="text-sm text-gray-400">Analyzing with AI model…</div>
                  </div>
                )}
                {pred && (
                  <div className="space-y-4">
                    {/* AI result badge */}
                    <div className={`p-4 rounded-2xl text-center border ${classBadge(pred.classification)}`}>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1">AI Classification</div>
                      <div className="text-3xl font-black">{displayClass(pred.classification)}</div>
                      <div className="text-sm text-gray-500 mt-1">{pred.confidence_score.toFixed(1)}% confidence</div>
                    </div>

                    {savedPat && (
                      <div className="p-3 rounded-xl bg-gray-50 text-xs space-y-1">
                        <div className="text-[8px] font-bold uppercase tracking-widest text-gray-400 mb-1">Patient</div>
                        <div className="flex justify-between"><span className="text-gray-400">Name</span><span className="font-semibold">{savedPat.name}</span></div>
                        <div className="flex justify-between"><span className="text-gray-400">National ID</span><span className="font-mono">{maskNationalId(savedPat.patient_ref_id)}</span></div>
                        {savedPat.age && <div className="flex justify-between"><span className="text-gray-400">Age</span><span>{savedPat.age} yrs</span></div>}
                        {savedPat.sex && <div className="flex justify-between"><span className="text-gray-400">Sex</span><span>{savedPat.sex}</span></div>}
                        
                      </div>
                    )}

                    {/* Probability bars */}
                    <div className="space-y-2">
                      {[
                        { label: 'Normal', val: pred.normal_probability, col: 'bg-emerald-500' },
                        { label: 'Pneumonia', val: pred.pneumonia_probability, col: 'bg-gray-500' },
                        { label: 'Tuberculosis', val: pred.tb_probability, col: 'bg-red-500' },
                      ].map(r => (
                        <div key={r.label}>
                          <div className="flex justify-between mb-1">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{r.label}</span>
                            <span className="text-xs font-bold">{(r.val * 100).toFixed(1)}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div className={`h-full rounded-full ${r.col} transition-all duration-700`} style={{ width: `${r.val * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {pred.gradcam_b64 && (
                      <div className="space-y-3">
                        {previews[activeImg] && (
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">Original X-Ray</div>
                            <img src={previews[activeImg]} alt="Original X-ray" className="w-full rounded-xl border border-gray-200" />
                          </div>
                        )}
                        <div>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">Grad-CAM Heatmap</div>
                        <img src={pred.gradcam_b64} alt="Heatmap" className="w-full rounded-xl" />
                        </div>
                      </div>
                    )}

                    {/* ── Inline verification panel ── */}
                    {savedDiag && showVerifyInline && (
                      <div className="border-2 border-gray-200 rounded-2xl p-4 bg-gray-50 space-y-3">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-gray-600">Your Assessment Required</div>
                        <p className="text-xs text-gray-600">Review the AI result and confirm or override. This is saved to the patient record.</p>
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Final Diagnosis</label>
                          <div className="grid grid-cols-2 gap-2">
                            {['Normal', 'Tuberculosis', 'Pneumonia', 'Unknown'].map(opt => (
                              <button key={opt} onClick={() => setInlineOverride(inlineOverride === opt ? '' : opt)}
                                className={`py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest border-2 transition-all ${
                                  inlineOverride === opt
                                    ? opt === 'Normal' ? 'border-emerald-500 bg-emerald-500 text-white'
                                      : opt === 'Tuberculosis' ? 'border-red-500 bg-red-500 text-white'
                                      : opt === 'Pneumonia' ? 'border-gray-500 bg-gray-500 text-white'
                                      : 'border-zinc-500 bg-zinc-500 text-white'
                                    : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
                                }`}>
                                {opt}
                                {opt === pred.classification && !inlineOverride && (
                                  <span className="block text-[8px] normal-case font-normal opacity-70">AI says this</span>
                                )}
                              </button>
                            ))}
                          </div>
                          {!inlineOverride && <p className="text-[10px] text-gray-400 mt-1">Select one to confirm or override the AI result</p>}
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Clinical Notes (optional)</label>
                          <textarea value={inlineNotes} onChange={e => setInlineNotes(e.target.value)} rows={2}
                            className={`${inp} resize-none text-xs`} placeholder="Add your clinical observations…" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setShowVerifyInline(false)}
                            className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-50">
                            Skip for now
                          </button>
                          <button onClick={saveInlineVerify} disabled={inlineSaving}
                            className="flex-1 py-2 rounded-xl bg-gray-600 hover:bg-gray-500 text-white text-xs font-bold disabled:opacity-40">
                            {inlineSaving ? 'Saving…' : inlineOverride ? `Confirm: ${inlineOverride}` : `✓ Accept AI: ${pred?.classification}`}
                          </button>
                        </div>
                      </div>
                    )}

                    {savedDiag && !showVerifyInline && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold">
                        Diagnosis saved {diagnoses.find(d => d.id === savedDiag.id)?.radiologist_verified ? '· Verified ✓' : '· Pending verification'}
                      </div>
                    )}

                    <div className="flex gap-2">
                      {savedDiag && !showVerifyInline && !diagnoses.find(d => d.id === savedDiag.id)?.radiologist_verified && (
                        <button onClick={() => { setInlineOverride(''); setInlineNotes(''); setShowVerifyInline(true); }}
                          className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200">
                          ✦ Verify Now
                        </button>
                      )}
                      {savedDiag && savedPat && (
                        <button onClick={() => { exportPdfReport(savedPat, savedDiag, pred, previews[activeImg] || null).catch(() => {}); }}
                          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold uppercase tracking-widest hover:bg-gray-50 text-gray-700">
                          Export PDF
                        </button>
                      )}
                      {savedDiag && savedPat && (
                        <button onClick={() => openShareDiagnosis(savedPat, savedDiag)}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-widest">
                          Share Result
                        </button>
                      )}
                      <button onClick={clearScan} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold uppercase tracking-widest hover:border-emerald-400 text-gray-600">
                        New Patient Scan
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ HISTORY ══ */}
        {tab === 'history' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Patient History</h1>
                <p className="text-sm text-gray-400 mt-1">{patients.length} patients · {diagnoses.length} diagnoses · {diagnoses.filter(d => !d.radiologist_verified).length} pending verification</p>
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or ID…"
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-white" />
            </div>

            {busy && <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>}

            <div className="space-y-2">
              {filtered.map(p => {
                const ptDiags = diagnoses.filter(d => d.patient_id === p.id);
                const isOpen = expanded === p.id;
                return (
                  <div key={p.id} className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                    <div className="flex items-center gap-3 px-5 py-4">
                      <button onClick={() => setExpanded(isOpen ? null : p.id)}
                        className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-xs hover:bg-gray-50 flex-shrink-0">
                        {isOpen ? '▾' : '▸'}
                      </button>
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 items-center min-w-0">
                        <div><div className="text-[8px] font-bold uppercase text-gray-400 mb-0.5">Name</div><div className="text-sm font-semibold truncate">{p.name}</div></div>
                        <div><div className="text-[8px] font-bold uppercase text-gray-400 mb-0.5">National ID</div><div className="text-xs font-mono text-gray-500">{maskNationalId(p.patient_ref_id)}</div></div>
                        <div><div className="text-[8px] font-bold uppercase text-gray-400 mb-0.5">Age</div><div className="text-xs text-gray-500">{p.age ? `${p.age} yrs` : '—'}</div></div>
                        <div><div className="text-[8px] font-bold uppercase text-gray-400 mb-0.5">Sex</div><div className="text-xs text-gray-500">{p.sex || '—'}</div></div>
                        <div>
                          <div className="text-[8px] font-bold uppercase text-gray-400 mb-0.5">Scans</div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${ptDiags.length > 0 ? 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-500'}`}>
                            {ptDiags.length} scan{ptDiags.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div><div className="text-[8px] font-bold uppercase text-gray-400 mb-0.5">Registered</div><div className="text-xs text-gray-400">{fmt(p.created_at)}</div></div>
                      </div>
                      <button onClick={() => { setEditPat({ ...p }); setEditErr(''); }}
                        className="flex-shrink-0 text-[9px] font-bold uppercase px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                        Edit
                      </button>
                      <button onClick={() => deletePatientForever(p)}
                        className="flex-shrink-0 text-[9px] font-bold uppercase px-2.5 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100">
                        Delete
                      </button>
                    </div>

                    {isOpen && (
                      <div className="border-t border-gray-100 bg-gray-50/40 px-5 py-4">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-3">Diagnoses</div>
                        {ptDiags.length === 0
                          ? <div className="text-sm text-gray-400">No diagnoses yet.</div>
                          : (
                            <div className="space-y-2">
                              {ptDiags.map(d => (
                                <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white">
                                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                                    <div>
                                      <div className="text-[8px] font-bold uppercase text-gray-400 mb-0.5">Result</div>
                                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${classBadge(d.radiologist_override || d.ai_classification)}`}>
                                        {d.radiologist_override || d.ai_classification}
                                      </span>
                                      {d.radiologist_override && <div className="text-[8px] text-gray-400 mt-0.5">AI: {displayClass(d.ai_classification)}</div>}
                                    </div>
                                    <div>
                                      <div className="text-[8px] font-bold uppercase text-gray-400 mb-0.5">Confidence</div>
                                      <div className="text-xs font-bold">{d.confidence_score.toFixed(1)}%</div>
                                    </div>
                                    <div>
                                      <div className="text-[8px] font-bold uppercase text-gray-400 mb-0.5">Status</div>
                                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${d.radiologist_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                                        {d.radiologist_verified ? 'Verified' : 'Pending'}
                                      </span>
                                    </div>
                                    <div><div className="text-[8px] font-bold uppercase text-gray-400 mb-0.5">Date</div><div className="text-[10px] text-gray-400">{fmt(d.created_at)}</div></div>
                                  </div>
                                  {(d.xray_storage_path || d.xray_b64) && (
                                    diagImageUrls[d.id]
                                      ? <img src={diagImageUrls[d.id]} alt="Diagnosis X-ray" className="w-14 h-14 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                                      : <div className="w-14 h-14 rounded-lg object-cover border border-gray-200 flex items-center justify-center text-[9px] text-gray-400 bg-gray-50 flex-shrink-0">Loading</div>
                                  )}
                                  {d.heatmap_b64 && (
                                    <img src={d.heatmap_b64} alt="Diagnosis heatmap" className="w-14 h-14 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                                  )}
                                  <button onClick={() => { exportPdfReport(p, d, null, null).catch(() => {}); }}
                                    className="flex-shrink-0 text-[9px] font-bold uppercase px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50">
                                    PDF
                                  </button>
                                  <button onClick={() => openShareDiagnosis(p, d)}
                                    className="flex-shrink-0 text-[9px] font-bold uppercase px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500">
                                    Share
                                  </button>
                                  <button onClick={() => { setVerifyDiag(d); setVerOverride(d.radiologist_override || ''); setVerNotes(d.radiologist_notes || ''); }}
                                    className={`flex-shrink-0 text-[9px] font-bold uppercase px-2.5 py-1.5 rounded-lg hover:opacity-80 ${d.radiologist_verified ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>
                                    {d.radiologist_verified ? 'Edit' : 'Verify'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && !busy && (
                <div className="p-10 rounded-2xl border border-gray-100 bg-white text-center text-sm text-gray-400">
                  {search ? 'No patients match your search.' : 'No patients yet — run a diagnosis to get started.'}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'chat' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Shared Reports</h1>
              <p className="text-sm text-[#475569] mt-1">Choose a radiologist, open received or sent reports, then review, re-share, download, delete, or diagnose again from one smooth workspace.</p>
            </div>
            <div className="grid xl:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start">
              <div className="xl:order-2 bg-white rounded-[28px] border border-[#475569]/15 p-5 md:p-6 flex flex-col min-h-[640px] shadow-[0_10px_35px_rgba(71,85,105,0.08)]">
                {!activeChatId ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-[22px] bg-[#166534]/10 text-[#166534] flex items-center justify-center text-2xl font-black">2</div>
                    <div className="text-base font-bold text-[#475569] mt-4">Choose a radiologist first</div>
                    <div className="text-sm text-[#475569] mt-2 max-w-md">Use the left panel to select an approved colleague in your hospital, then switch between received and sent reports here.</div>
                  </div>
                ) : (
                  <>
                    <div className="pb-5 border-b border-[#475569]/15 flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#475569]">Step 2 - Review Reports</div>
                        <div className="text-lg font-bold text-[#475569] mt-1">{selectedReportContact?.full_name || 'Shared Reports'}</div>
                        <div className="text-sm text-[#475569] mt-1">{selectedReportContact?.specialization || 'Radiologist'}</div>
                        <div className="text-xs text-[#475569] mt-1">{selectedReportContact?.email || ''}</div>
                      </div>
                      <div className="shrink-0">
                        <div className="inline-flex rounded-2xl border border-[#475569]/15 bg-[#475569]/10 p-1.5">
                          <button
                            onClick={() => setReportView('received')}
                            className={`px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.18em] ${reportView === 'received' ? 'bg-[#475569] text-white' : 'text-[#475569]'}`}
                          >
                            Received
                          </button>
                          <button
                            onClick={() => setReportView('sent')}
                            className={`px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.18em] ${reportView === 'sent' ? 'bg-[#166534] text-white' : 'text-[#475569]'}`}
                          >
                            Sent
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="pt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-1 rounded-full border border-[#475569]/20 bg-[#475569]/10 text-[#475569] text-[10px] font-bold">Received {selectedReceivedCount}</span>
                        <span className="px-2.5 py-1 rounded-full border border-[#166534]/20 bg-[#166534]/10 text-[#166534] text-[10px] font-bold">Sent {selectedSentCount}</span>
                      </div>
                      <div className="text-xs text-[#475569]">
                        {reportView === 'received'
                          ? 'Reports this colleague shared with you'
                          : 'Reports you shared with this colleague'}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto py-5 space-y-4">
                      {orderedVisibleSharedChatMessages.map(msg => {
                        const shared = parseSharedDiagnosisMessage(msg.message);
                        if (!shared) return null;
                        const outgoing = msg.sender_id === user.id;
                        return (
                          <article key={msg.id} className="w-full rounded-[26px] border border-[#475569]/15 bg-white p-5 shadow-[0_8px_24px_rgba(71,85,105,0.07)]">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full border ${outgoing ? 'border-[#166534]/20 bg-[#166534]/10 text-[#166534]' : 'border-[#475569]/20 bg-[#475569]/10 text-[#475569]'}`}>
                                    {outgoing ? 'Sent Report' : 'Received Report'}
                                  </span>
                                  <span className={`inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full ${reportPill(shared.classification)}`}>
                                    {displayClass(shared.classification)}
                                  </span>
                                </div>
                                <div className="mt-3 text-lg font-bold text-[#475569]">{shared.patient_name}</div>
                                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#475569]">
                                  <span>{shared.confidence_score.toFixed(1)}% confidence</span>
                                  {shared.patient_ref_masked && <span>{shared.patient_ref_masked}</span>}
                                  {shared.radiologist_name && <span>{shared.radiologist_name}</span>}
                                  {shared.hospital && <span>{shared.hospital}</span>}
                                </div>
                              </div>
                              <div className="text-[11px] text-[#475569]">{fmt(msg.created_at)}</div>
                            </div>
                            {(shared.shared_note || shared.radiologist_notes) && (
                              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                {shared.shared_note && (
                                  <div className="rounded-2xl border border-[#166534]/20 bg-[#166534]/10 p-3.5 text-xs text-[#166534]">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5">Shared Note</div>
                                    {shared.shared_note}
                                  </div>
                                )}
                                {shared.radiologist_notes && (
                                  <div className="rounded-2xl border border-[#475569]/20 bg-[#475569]/10 p-3.5 text-xs text-[#475569]">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5">Clinical Note</div>
                                    {shared.radiologist_notes}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="mt-4 grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] gap-4">
                              <div className="grid sm:grid-cols-2 gap-4">
                                <div className="rounded-[22px] border border-[#475569]/15 bg-[#475569]/[0.04] p-3">
                                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#475569] mb-2">Diagnosed Image</div>
                                  {shared.xray_b64
                                    ? <img src={shared.xray_b64} alt="Shared diagnosed X-ray" className="w-full h-48 rounded-[18px] object-contain border border-[#475569]/15 bg-white" />
                                    : <div className="h-48 rounded-[18px] border border-dashed border-[#475569]/25 flex items-center justify-center text-xs text-[#475569] bg-white">Image not attached</div>}
                                </div>
                                <div className="rounded-[22px] border border-[#475569]/15 bg-[#475569]/[0.04] p-3">
                                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#475569] mb-2">AI Heatmap</div>
                                  {shared.heatmap_b64
                                    ? <img src={shared.heatmap_b64} alt="Shared heatmap" className="w-full h-48 rounded-[18px] object-contain border border-[#475569]/15 bg-white" />
                                    : <div className="h-48 rounded-[18px] border border-dashed border-[#475569]/25 flex items-center justify-center text-xs text-[#475569] bg-white">Heatmap not attached</div>}
                                </div>
                              </div>
                              <div className="rounded-[22px] border border-[#475569]/15 bg-white p-4">
                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#475569]">Actions</div>
                                <div className="text-xs text-[#475569] mt-1">Everything for this report stays in one place.</div>
                                <div className="mt-3 flex flex-wrap gap-2.5">
                                  <button
                                    onClick={() => exportSharedReportPdf(shared, msg.created_at)}
                                    className="px-3.5 py-2.5 rounded-xl bg-[#166534] text-white text-[11px] font-bold uppercase tracking-[0.16em]"
                                  >
                                    Download Report
                                  </button>
                                  <button
                                    onClick={() => downloadSharedImage(shared)}
                                    disabled={!shared.xray_b64}
                                    className="px-3.5 py-2.5 rounded-xl border border-[#475569]/20 bg-white text-[#475569] text-[11px] font-bold uppercase tracking-[0.16em] disabled:opacity-40"
                                  >
                                    Download Image
                                  </button>
                                  <button
                                    onClick={() => rediagnoseSharedImage(shared).catch(() => setChatError('Could not load that image for re-diagnosis.'))}
                                    disabled={!shared.xray_b64}
                                    className="px-3.5 py-2.5 rounded-xl border border-[#166534]/20 bg-[#166534]/10 text-[#166534] text-[11px] font-bold uppercase tracking-[0.16em] disabled:opacity-40"
                                  >
                                    Diagnose Again
                                  </button>
                                  <button
                                    onClick={() => openForwardReport(shared)}
                                    className="px-3.5 py-2.5 rounded-xl border border-[#475569]/20 bg-[#475569]/10 text-[#475569] text-[11px] font-bold uppercase tracking-[0.16em]"
                                  >
                                    Share Again
                                  </button>
                                  <button
                                    onClick={() => deleteSharedReport(msg.id)}
                                    className="px-3.5 py-2.5 rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/10 text-[#DC2626] text-[11px] font-bold uppercase tracking-[0.16em]"
                                  >
                                    Delete Report
                                  </button>
                                </div>
                                {shared.xray_filename && <div className="mt-4 text-[11px] text-[#475569]">File: {shared.xray_filename}</div>}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                      {chatError && <div className="p-3 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/20 text-[#DC2626] text-xs font-semibold">{chatError}</div>}
                      {!chatBusy && !chatError && visibleSharedChatMessages.length === 0 && (
                        <div className="h-full flex items-center justify-center text-center rounded-[24px] border border-dashed border-[#475569]/25 bg-[#475569]/[0.04]">
                          <div className="px-6 py-10">
                            <div className="text-base font-bold text-[#475569]">No {reportView} reports yet</div>
                            <div className="text-sm text-[#475569] mt-2">
                              {reportView === 'received'
                                ? 'Reports shared by this colleague will appear here with clean actions for download, re-share, and re-diagnosis.'
                                : 'Use the Share action from patient history to send a reviewed diagnosis to this colleague.'}
                            </div>
                          </div>
                        </div>
                      )}
                      {chatBusy && <div className="text-sm text-[#475569] text-center pt-12">Loading shared reports...</div>}
                    </div>
                  </>
                )}
              </div>
              <div className="xl:order-1 bg-white rounded-[28px] border border-[#475569]/15 overflow-hidden shadow-[0_10px_35px_rgba(71,85,105,0.08)]">
                <div className="px-5 py-4 border-b border-[#475569]/15 bg-[#475569]/[0.04]">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#475569]">Step 1 - Choose Radiologist</div>
                  <div className="text-xs text-[#475569] mt-1">Search approved colleagues in your hospital and open their shared report thread.</div>
                  <div className="mt-3">
                    <input
                      value={reportSearch}
                      onChange={e => setReportSearch(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-[#475569]/20 text-sm text-[#475569] focus:outline-none focus:ring-2 focus:ring-[#166534]/15 bg-white"
                      placeholder="Search by radiologist name or email"
                    />
                  </div>
                </div>
                {contactsError && <div className="mx-4 mt-4 p-3 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/20 text-[#DC2626] text-xs font-semibold">{contactsError}</div>}
                <div className="max-h-[640px] overflow-y-auto p-3 space-y-2">
                  {filteredContacts.map(contact => {
                    const contactMessages = sharedChatMessages.filter(msg => msg.sender_id === contact.id || msg.recipient_id === contact.id);
                    const contactReceived = contactMessages.filter(msg => msg.sender_id === contact.id).length;
                    const contactSent = contactMessages.filter(msg => msg.recipient_id === contact.id).length;
                    return (
                      <button key={contact.id} onClick={() => setActiveChatId(contact.id)}
                        className={`w-full text-left rounded-[22px] border px-4 py-3.5 transition-colors ${activeChatId === contact.id ? 'border-[#166534]/30 bg-[#166534]/10 shadow-[0_10px_24px_rgba(22,101,52,0.12)]' : 'border-[#475569]/15 bg-white'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#475569] truncate">{contact.full_name}</div>
                            <div className="text-[11px] text-[#475569] mt-0.5 truncate">{contact.specialization || 'Radiologist'}</div>
                            <div className="text-[11px] text-[#475569] mt-1 truncate">{contact.email}</div>
                          </div>
                          <span className="shrink-0 text-[9px] font-bold px-2 py-1 rounded-full border border-[#166534]/20 bg-[#166534]/10 text-[#166534]">Approved</span>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-[10px] font-semibold">
                          <span className="px-2 py-1 rounded-full border border-[#475569]/20 bg-[#475569]/10 text-[#475569]">Received {contactReceived}</span>
                          <span className="px-2 py-1 rounded-full border border-[#166534]/20 bg-[#166534]/10 text-[#166534]">Sent {contactSent}</span>
                        </div>
                      </button>
                    );
                  })}
                  {!contactsError && filteredContacts.length === 0 && (
                    <div className="p-6 text-sm text-[#475569] text-center">
                      {chatContacts.length === 0 ? 'No approved radiologists are available in your hospital yet.' : 'No radiologist matches your search.'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ PROFILE ══ */}
        {tab === 'profile' && (
          <div className="space-y-5 max-w-2xl">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
              <p className="text-sm text-gray-400 mt-1">Manage your account details and password</p>
            </div>

            {/* Info card */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden border border-gray-200 bg-white flex items-center justify-center">
                    {identityLogo
                      ? <img src={identityLogo} alt="Hospital logo" className="w-full h-full object-contain p-1.5" />
                      : <div className="w-full h-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xl font-black">{initials}</div>}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{user.full_name}</div>
                    <div className="text-sm text-gray-400">{user.email}</div>
                    <div className="text-xs text-gray-500 mt-1">{hospitalDisplayName}</div>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 mt-1 inline-block">✓ Approved</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(!editing); setProfMsg(''); }}
                    className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-lg border border-gray-200 hover:border-emerald-400 transition-all">
                    {editing ? 'Cancel' : 'Edit'}
                  </button>
                  <button onClick={onSignOut} className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black">
                    Sign Out
                  </button>
                </div>
              </div>

              {editing ? (
                <div className="pt-3 border-t border-gray-100 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Full Name</label>
                      <input value={pFullName} onChange={e => setPFullName(e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Hospital</label>
                      <input
                        value={pHospital}
                        onChange={e => setPHospital(e.target.value)}
                        className={`${inp} ${branding?.name ? 'bg-gray-50 text-gray-500' : ''}`}
                        placeholder="CHUK"
                        readOnly={!!branding?.name}
                      />
                      {branding?.name && <p className="text-[10px] text-gray-400 mt-1">Hospital name comes from your approved hospital assignment.</p>}
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Phone</label>
                      <input value={pPhone} onChange={e => setPPhone(e.target.value)} className={inp} placeholder="+250 7XX XXX XXX" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Specialization</label>
                      <input value={pSpec} onChange={e => setPSpec(e.target.value)} className={inp} placeholder="Radiology" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Years Experience</label>
                      <input type="number" value={pYears} onChange={e => setPYears(e.target.value)} className={inp} placeholder="5" />
                    </div>
                  </div>
                  {profMsg && <div className={`p-3 rounded-xl text-xs font-semibold ${profMsg.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>{profMsg}</div>}
                  <button onClick={saveProfile} disabled={profSaving}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl disabled:opacity-40 text-sm">
                    {profSaving ? 'Saving…' : 'Save Profile'}
                  </button>
                </div>
              ) : (
                <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
                  {[
                    { label: 'Hospital', value: hospitalDisplayName },
                    { label: 'License', value: user.license_number },
                    { label: 'Phone', value: user.phone_number },
                    { label: 'Specialization', value: user.specialization },
                    { label: 'Experience', value: user.years_experience ? `${user.years_experience} years` : null },
                    { label: 'Role', value: user.role },
                  ].map(f => (
                    <div key={f.label}>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{f.label}</div>
                      <div className="text-sm font-semibold text-gray-700">{f.value || '—'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hospital Logo Upload — only for hospital middle admins */}
            {user.is_admin && user.hospital_id && (
              <HospitalLogoUpload
                hospitalId={user.hospital_id}
                currentLogo={branding?.logo_base64 || null}
                onUploaded={() => window.location.reload()}
              />
            )}

            {/* Change password */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm">Change Password</div>
                  <div className="text-xs text-gray-400 mt-0.5">Update your account password</div>
                </div>
                <button onClick={() => { setPwOpen(!pwOpen); setPwMsg(''); setPw1(''); setPw2(''); setPwCurrent(''); }}
                  className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-lg border border-gray-200 hover:border-emerald-400 transition-all">
                  {pwOpen ? 'Cancel' : 'Change'}
                </button>
              </div>
              {pwOpen && (
                <div className="pt-4 border-t border-gray-100 mt-4 space-y-3">
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Current Password *</label>
                    <div className="relative">
                      <input type={showPwCurrent ? 'text' : 'password'} value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} className={`${inp} pr-10`} placeholder="Enter your current password" />
                      <EyeBtn show={showPwCurrent} onToggle={() => setShowPwCurrent(s => !s)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">New Password *</label>
                    <div className="relative">
                      <input type={showPw1 ? 'text' : 'password'} value={pw1} onChange={e => setPw1(e.target.value)} className={`${inp} pr-10`} placeholder="Min 6 characters" />
                      <EyeBtn show={showPw1} onToggle={() => setShowPw1(s => !s)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Confirm New Password *</label>
                    <div className="relative">
                      <input type={showPw2 ? 'text' : 'password'} value={pw2} onChange={e => setPw2(e.target.value)} className={`${inp} pr-10`} placeholder="Repeat new password" />
                      <EyeBtn show={showPw2} onToggle={() => setShowPw2(s => !s)} />
                    </div>
                    {pw2 && pw1 !== pw2 && <p className="text-[10px] text-red-500 font-semibold mt-1">Passwords do not match</p>}
                    {pw2 && pw1 === pw2 && pw1.length >= 6 && pw1 !== pwCurrent && <p className="text-[10px] text-emerald-600 font-semibold mt-1">✓ Passwords match</p>}
                    {pw1 && pwCurrent && pw1 === pwCurrent && <p className="text-[10px] text-red-500 font-semibold mt-1">New password must differ from current</p>}
                  </div>
                  {pwMsg && <div className={`p-3 rounded-xl text-xs font-semibold ${pwMsg.startsWith('Error') || pwMsg.toLowerCase().includes('incorrect') || pwMsg.toLowerCase().includes('must') || pwMsg.toLowerCase().includes('match') || pwMsg.toLowerCase().includes('enter') ? 'bg-red-50 text-red-700 border border-red-100' : pwMsg === 'Verifying…' ? 'bg-gray-50 text-gray-700 border border-gray-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>{pwMsg}</div>}
                  <button onClick={changePw} disabled={!pwCurrent || !pw1 || pw1 !== pw2 || pw1.length < 6 || pw1 === pwCurrent}
                    className="w-full py-3 bg-gray-900 hover:bg-black text-white font-bold rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                    Update Password
                  </button>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-4">Activity</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Patients', value: patients.length },
                  { label: 'Diagnoses', value: diagnoses.length },
                  { label: 'Verified', value: diagnoses.filter(d => d.radiologist_verified).length },
                  { label: 'Pending', value: diagnoses.filter(d => !d.radiologist_verified).length },
                ].map(s => (
                  <div key={s.label} className="text-center p-3 rounded-xl bg-gray-50">
                    <div className="text-2xl font-black text-gray-900">{s.value}</div>
                    <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Shell screens ────────────────────────────────────────────────────────────
const Loading = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center space-y-4">
      <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
      <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading…</div>
    </div>
  </div>
);

const PendingScreen = ({ name, onSignOut }: { name: string; onSignOut: () => void }) => (
  <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 text-center max-w-sm w-full">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-xl font-black text-gray-900 mb-2">Application Submitted</h2>
      {name && <p className="text-gray-600 text-sm mb-2">Welcome, <strong>{name}</strong>.</p>}
      <p className="text-gray-400 text-sm mb-8 leading-relaxed">
        Your registration is under review. You'll be able to start diagnosing once an administrator approves your account.<br /><br />
        <strong className="text-gray-600">This usually takes less than 24 hours.</strong>
      </p>
      <button onClick={onSignOut} className="w-full py-2.5 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-colors">Sign Out</button>
    </div>
  </div>
);

const RejectedScreen = ({ onSignOut }: { onSignOut: () => void }) => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 text-center max-w-sm w-full">
      <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h2 className="text-xl font-black text-gray-900 mb-2">Account Rejected</h2>
      <p className="text-gray-400 text-sm mb-6">Please contact your administrator for more details.</p>
      <button onClick={onSignOut} className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl text-sm">Sign Out</button>
    </div>
  </div>
);

// ─── Main App Shell ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [bUser, setBUser] = useState<BUser | null>(null);

  const resolveSession = useCallback(async (session: any, event?: string) => {
    // If this is a PASSWORD_RECOVERY event, show the reset form — do NOT log in
    if (event === 'PASSWORD_RECOVERY') {
      setAppState('unauthenticated'); // AuthPage will show reset form via its own listener
      return;
    }
    // Also catch hash-based recovery URL (e.g. user opens the link fresh)
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      setAppState('unauthenticated');
      return;
    }
    if (!session) { setAppState('unauthenticated'); setBUser(null); return; }
    const email = (session.user?.email || '').toLowerCase();
    // Admin check handled by is_admin from database below
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) {
        const u: BUser = await res.json();
        setBUser(u);
        if (u.is_admin) setAppState('admin');
        else if (u.status === 'approved') setAppState('approved');
        else if (u.status === 'rejected' || u.status === 'revoked') setAppState('rejected');
        else setAppState('pending');
        return;
      }
      if (res.status === 404) {
        const rr = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ firebase_uid: session.user.id, email: session.user.email, full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User' }),
        });
        if (rr.ok) { const u: BUser = await rr.json(); setBUser(u); setAppState(u.status === 'approved' ? 'approved' : 'pending'); return; }
      }
    } catch (_) {}
    setAppState('pending');
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    // Invite links contain type=invite, recovery links contain type=recovery
    const isPasswordSetup = hash.includes('type=recovery') || hash.includes('type=invite');

    if (isPasswordSetup) {
      // Don't resolve session — stay on AuthPage which will show password form
      // The onAuthStateChange below will fire SIGNED_IN or PASSWORD_RECOVERY
      // and AuthPage handles it via its own listener
      setAppState('unauthenticated');
    } else {
      supabase.auth.getSession().then(({ data }) => resolveSession(data.session));
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // These events mean the user clicked an email link — show password form
      if (event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED') {
        setAppState('unauthenticated');
        return;
      }
      // SIGNED_IN from an invite link — still need to set password
      if (event === 'SIGNED_IN' && isPasswordSetup) {
        setAppState('unauthenticated');
        return;
      }
      resolveSession(session, event);
    });
    return () => subscription.unsubscribe();
  }, [resolveSession]);

  const signOut = async () => { await supabase.auth.signOut(); setAppState('unauthenticated'); setBUser(null); };

  switch (appState) {
    case 'loading': return <Loading />;
    case 'unauthenticated': return <AuthPage onAuth={() => {}} />;
    case 'pending': return <PendingScreen name={bUser?.full_name || ''} onSignOut={signOut} />;
    case 'rejected': return <RejectedScreen onSignOut={signOut} />;
    case 'admin': return <AdminDashboard />;
    case 'approved': return bUser ? <RadiologistDashboard user={bUser} onSignOut={signOut} /> : <Loading />;
    default: return <AuthPage onAuth={() => {}} />;
  }
}

