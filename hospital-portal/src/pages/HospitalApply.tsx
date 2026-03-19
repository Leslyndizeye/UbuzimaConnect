// pages/HospitalApply.tsx
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const FACILITY_TYPES = [
  { value: 'Public', desc: 'Government-owned health facility' },
  { value: 'Private', desc: 'Privately operated health facility' },
];

function FacilityDropdown({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = FACILITY_TYPES.find(f => f.value === value);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border bg-gray-50 text-sm font-normal outline-none transition-all text-left ${
          open ? 'border-med-emerald bg-white ring-2 ring-med-emerald/10' : 'border-gray-100'
        } ${error ? 'border-red-300' : ''}`}>
        {selected ? (
          <span className="text-gray-900 font-medium">{selected.value}</span>
        ) : (
          <span className="text-gray-300">Select facility type...</span>
        )}
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-100 shadow-2xl shadow-gray-200/60 overflow-hidden">
          {FACILITY_TYPES.map(f => (
            <button key={f.value} type="button"
              onClick={() => { onChange(f.value); setOpen(false); }}
              className={`w-full flex items-center px-4 py-3.5 text-left transition-all hover:bg-gray-50 ${
                value === f.value ? 'bg-med-emerald/5 border-l-2 border-med-emerald' : ''
              }`}>
              <div className="flex-1">
                <div className={`text-sm font-medium ${value === f.value ? 'text-med-emerald' : 'text-gray-900'}`}>{f.value}</div>
                <div className="text-[11px] text-gray-400">{f.desc}</div>
              </div>
              {value === f.value && (
                <svg className="w-4 h-4 text-med-emerald ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

const DISTRICTS: Record<string, string[]> = {
  'Kigali City':       ['Gasabo', 'Kicukiro', 'Nyarugenge'],
  'Northern Province': ['Burera', 'Gakenke', 'Gicumbi', 'Musanze', 'Rulindo'],
  'Southern Province': ['Gisagara', 'Huye', 'Kamonyi', 'Muhanga', 'Nyamagabe', 'Nyanza', 'Nyaruguru', 'Ruhango'],
  'Eastern Province':  ['Bugesera', 'Gatsibo', 'Kayonza', 'Kirehe', 'Ngoma', 'Nyagatare', 'Rwamagana'],
  'Western Province':  ['Karongi', 'Ngororero', 'Nyabihu', 'Nyamasheke', 'Rubavu', 'Rutsiro', 'Rusizi'],
};

const TERMS = `1. SCOPE OF SERVICE
Ubuzima Connect provides AI-assisted chest X-ray diagnostic support to approved healthcare institutions in Rwanda. The Platform is intended to assist, not replace, qualified radiologists in clinical decision-making.

2. APPROVED USE
The Platform may only be used by licensed healthcare professionals. Hospital administrators are responsible for ensuring only approved radiologists access the system. Credentials must not be shared outside approved personnel.

3. CLINICAL RESPONSIBILITY
All AI-generated diagnoses are decision-support tools only. Final clinical decisions remain the sole responsibility of the attending radiologist or physician. Ubuzima Connect does not assume liability for clinical outcomes.

4. DATA PRIVACY & SECURITY
Patient data must comply with Rwanda's data protection regulations. Hospitals are responsible for obtaining patient consent for digital X-ray processing. Data is stored securely and not shared with third parties without consent.

5. HOSPITAL LOGO & BRANDING
6. MODEL RETRAINING
X-ray data submitted for model retraining may be used to improve the AI model. All data is anonymised. Hospitals retain ownership and may request deletion at any time.

7. GOOGLE MEET ONBOARDING CALL
Prior to receiving credentials, approved applicants must attend a mandatory 30-minute onboarding call.

8. ACCESS REVOCATION
Ubuzima Connect reserves the right to suspend or revoke hospital access in cases of misuse or breach of these terms.

9. GOVERNING LAW
This agreement is governed by the laws of the Republic of Rwanda.`;

interface FormData {
  name: string; type: string; email: string; phone: string;
  website: string; license_document_name: string; license_document_base64: string;
  province: string; district: string; sector: string;
  address: string; contact_name: string; contact_role: string;
  num_radiologists: string; num_machines: string; monthly_volume: string;
  current_system: string; primary_conditions: string; heard_from: string; notes: string;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

// ── exact same input style as AuthPage.tsx ──
const inp = "w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 text-gray-900 text-sm font-normal outline-none focus:border-med-emerald focus:bg-white focus:ring-2 focus:ring-med-emerald/10 transition-all placeholder:text-gray-300";
const sel = "w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 text-gray-900 text-sm font-normal outline-none focus:border-med-emerald focus:bg-white focus:ring-2 focus:ring-med-emerald/10 transition-all";

function Label({ text }: { text: string }) {
  return <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-0.5 block mb-2">{text}</label>;
}

function Err({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-[9px] text-red-500 mt-1 ml-1 font-semibold">{msg}</p>;
}

export default function HospitalApply() {
  const navigate = useNavigate();
  const [step, setStep]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [termsChecked, setTermsChecked] = useState(false);
  const [dataChecked, setDataChecked]   = useState(false);
  const licenseRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormData>({
    name: '', type: '', email: '', phone: '', website: '', license_document_name: '', license_document_base64: '',
    province: '', district: '', sector: '', address: '', contact_name: '', contact_role: '',
    num_radiologists: '', num_machines: '', monthly_volume: '',
    current_system: '', primary_conditions: '', heard_from: '', notes: '',
  });

  const set = (k: keyof FormData, v: string) => {
    setForm(f => ({ ...f, [k]: v, ...(k === 'province' ? { district: '' } : {}) }));
    setErrors(e => ({ ...e, [k]: '' }));
  };

  const validate = (s: number) => {
    const required: Record<number, (keyof FormData)[]> = {
      1: ['name', 'type', 'email', 'phone', 'license_document_name', 'license_document_base64'],
      2: ['province', 'district', 'address', 'contact_name', 'contact_role'],
      3: ['num_radiologists', 'num_machines', 'monthly_volume'],
      4: [],
    };
    const errs: Record<string, string> = {};
    for (const k of required[s]) {
      if (!form[k].trim()) errs[k] = 'Required';
    }
    if (s === 4 && (!termsChecked || !dataChecked)) {
      errs['terms'] = 'Please accept all agreements to continue';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onLicensePicked = async (file?: File) => {
    if (!file) return;
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setErrors(e => ({ ...e, license_document_name: 'Use PDF, PNG, JPG, or WebP.' }));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrors(e => ({ ...e, license_document_name: 'File is too large. Max 8 MB.' }));
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setForm(f => ({
        ...f,
        license_document_name: file.name,
        license_document_base64: dataUrl,
      }));
      setErrors(e => ({ ...e, license_document_name: '', license_document_base64: '' }));
    } catch (err: any) {
      setErrors(e => ({ ...e, license_document_name: err.message || 'Failed to read file.' }));
    }
  };


  const next = () => { if (validate(step)) setStep(s => s + 1); };
  const back = () => setStep(s => s - 1);

  const submit = async () => {
    if (!validate(4)) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/hospital/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Submission failed');
      }
      await res.json();
      setSubmitted(true);
    } catch (err: any) {
      setErrors({ submit: err.message });
    } finally {
      setLoading(false);
    }
  };

  const stepLabels = ['Organisation', 'Location', 'Radiology', 'Terms'];

  // ── SUCCESS ──
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#fafafa] medical-grid flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 p-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-med-emerald rounded-2xl mb-6">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-display text-2xl font-bold text-gray-900 mb-3 tracking-tight">Application Submitted</h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-2">
            Our team will review your application and get in touch within <strong>48 hours</strong>.
          </p>
          <p className="text-sm text-gray-400 leading-relaxed mb-8">
            Check <strong className="text-gray-600">{form.email}</strong> for a confirmation.
            If approved, we'll schedule a Google Meet onboarding call.
          </p>
          <button onClick={() => navigate('/')}
            className="w-full py-4 bg-med-emerald hover:bg-black text-white font-bold rounded-2xl transition-all text-sm tracking-wide">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── FORM ──
  return (
    <div className="min-h-screen bg-[#fafafa] medical-grid flex items-center justify-center p-4">

      <div className="w-full max-w-lg">
        {/* Back */}
        <button onClick={() => navigate('/')}
          className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-gray-400 hover:text-gray-700 mb-6 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Back to home
        </button>

        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden">

          {/* Header */}
          <div className="px-8 pt-8 pb-7 bg-med-emerald">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 bg-white/10 border border-white/20 rounded-xl flex items-center justify-center">
                <div className="w-4 h-[1.5px] rounded-full bg-white" />
              </div>
              <span className="font-display text-[10px] font-bold text-white/60 uppercase tracking-widest">Ubuzima Connect</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-white mb-1 tracking-tight">Hospital Partnership</h1>
            <p className="text-[11px] text-white/50 uppercase tracking-widest mb-6">AI Chest X-Ray Diagnostic Platform · Rwanda</p>

            {/* Progress */}
            <div className="flex justify-between mb-3">
              {stepLabels.map((l, i) => (
                <span key={l} className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  i + 1 === step ? 'text-white' : i + 1 < step ? 'text-white/60' : 'text-white/25'
                }`}>
                  {i + 1}. {l}
                </span>
              ))}
            </div>
            <div className="h-1 bg-white/15 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${(step / 4) * 100}%` }} />
            </div>
          </div>

          {/* Body */}
          <div className="px-8 py-7">

            {/* ── STEP 1 ── */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-300 border-b border-gray-50 pb-3 mb-1">Organisation Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label text="Hospital / Facility Name *" />
                    <input className={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. King Faisal Hospital Kigali" />
                    <Err msg={errors.name} />
                  </div>
                  <div>
                    <Label text="Facility Type *" />
                    <FacilityDropdown value={form.type} onChange={v => set('type', v)} error={errors.type} />
                    <Err msg={errors.type} />
                  </div>
                  <div>
                    <Label text="Health Facility License *" />
                    <input
                      ref={licenseRef}
                      type="file"
                      accept=".pdf,image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={e => onLicensePicked(e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (licenseRef.current) licenseRef.current.value = '';
                        licenseRef.current?.click();
                      }}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 text-left text-sm text-gray-700 hover:bg-white hover:border-med-emerald transition-all"
                    >
                      <span className="block font-medium text-gray-900">
                        {form.license_document_name || 'Upload valid Rwanda health facility license'}
                      </span>
                      <span className="block text-[11px] text-gray-400 mt-1">
                        Required for all public and private health facilities. PDF, PNG, JPG, or WebP.
                      </span>
                    </button>
                    <Err msg={errors.license_document_name || errors.license_document_base64} />
                  </div>
                  <div>
                    <Label text="Official Email *" />
                    <input type="email" className={inp} value={form.email} onChange={e => set('email', e.target.value)} placeholder="admin@hospital.rw" />
                    <Err msg={errors.email} />
                  </div>
                  <div>
                    <Label text="Phone Number *" />
                    <input className={inp} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+250 7XX XXX XXX" />
                    <Err msg={errors.phone} />
                  </div>
                  <div className="col-span-2">
                    <Label text="Website (optional)" />
                    <input className={inp} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://yourhospital.rw" />
                  </div>

                </div>
              </div>
            )}

            {/* ── STEP 2 ── */}
            {step === 2 && (
              <div className="space-y-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-300 border-b border-gray-50 pb-3 mb-1">Location in Rwanda</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label text="Province *" />
                    <select className={sel} value={form.province} onChange={e => set('province', e.target.value)}>
                      <option value="">Select…</option>
                      {Object.keys(DISTRICTS).map(p => <option key={p}>{p}</option>)}
                    </select>
                    <Err msg={errors.province} />
                  </div>
                  <div>
                    <Label text="District *" />
                    <select className={sel} value={form.district} onChange={e => set('district', e.target.value)} disabled={!form.province}>
                      <option value="">Select…</option>
                      {(DISTRICTS[form.province] || []).map(d => <option key={d}>{d}</option>)}
                    </select>
                    <Err msg={errors.district} />
                  </div>
                  <div>
                    <Label text="Sector / Cell" />
                    <input className={inp} value={form.sector} onChange={e => set('sector', e.target.value)} placeholder="e.g. Kacyiru" />
                  </div>
                  <div>
                    <Label text="Contact Person *" />
                    <input className={inp} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Full name" />
                    <Err msg={errors.contact_name} />
                  </div>
                  <div className="col-span-2">
                    <Label text="Contact Person Role *" />
                    <input className={inp} value={form.contact_role} onChange={e => set('contact_role', e.target.value)} placeholder="e.g. Head of Radiology, IT Manager" />
                    <Err msg={errors.contact_role} />
                  </div>
                  <div className="col-span-2">
                    <Label text="Physical Address *" />
                    <textarea rows={2} className={inp + ' resize-none'} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street, building, landmarks…" />
                    <Err msg={errors.address} />
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 3 ── */}
            {step === 3 && (
              <div className="space-y-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-300 border-b border-gray-50 pb-3 mb-1">Radiology Capacity</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label text="Number of Radiologists *" />
                    <select className={sel} value={form.num_radiologists} onChange={e => set('num_radiologists', e.target.value)}>
                      <option value="">Select…</option>
                      {['1', '2–3', '4–6', '7–10', 'More than 10'].map(v => <option key={v}>{v}</option>)}
                    </select>
                    <Err msg={errors.num_radiologists} />
                  </div>
                  <div>
                    <Label text="X-Ray Machines *" />
                    <select className={sel} value={form.num_machines} onChange={e => set('num_machines', e.target.value)}>
                      <option value="">Select…</option>
                      {['1', '2–3', '4–6', '7+'].map(v => <option key={v}>{v}</option>)}
                    </select>
                    <Err msg={errors.num_machines} />
                  </div>
                  <div>
                    <Label text="X-Rays per Month *" />
                    <select className={sel} value={form.monthly_volume} onChange={e => set('monthly_volume', e.target.value)}>
                      <option value="">Select…</option>
                      {['Less than 50', '50–200', '200–500', '500–1,000', 'More than 1,000'].map(v => <option key={v}>{v}</option>)}
                    </select>
                    <Err msg={errors.monthly_volume} />
                  </div>
                  <div>
                    <Label text="Current Diagnostic System" />
                    <select className={sel} value={form.current_system} onChange={e => set('current_system', e.target.value)}>
                      <option value="">Select…</option>
                      {['Manual / Paper-based', 'Basic digital records', 'PACS system', 'Other software'].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label text="How did you hear about us?" />
                    <select className={sel} value={form.heard_from} onChange={e => set('heard_from', e.target.value)}>
                      <option value="">Select…</option>
                      {['Rwanda Biomedical Centre', 'Ministry of Health', 'Colleague / Referral', 'Social media', 'ALU / Academic network', 'Other'].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label text="Primary Conditions Diagnosed" />
                    <input className={inp} value={form.primary_conditions} onChange={e => set('primary_conditions', e.target.value)} placeholder="e.g. TB, Pneumonia" />
                  </div>
                  <div className="col-span-2">
                    <Label text="Additional Notes" />
                    <textarea rows={2} className={inp + ' resize-none'} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Special requirements, questions for our team…" />
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 4 ── */}
            {step === 4 && (
              <div className="space-y-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-300 border-b border-gray-50 pb-3 mb-1">Terms & Conditions</p>
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                  <p className="text-[10px] font-bold text-gray-700 mb-2">Ubuzima Connect — Hospital Partner Agreement</p>
                  <div className="max-h-36 overflow-y-auto text-[10px] text-gray-400 leading-relaxed whitespace-pre-line pr-1 mb-3"
                    style={{ scrollbarWidth: 'thin' }}>
                    {TERMS}
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={termsChecked} onChange={e => setTermsChecked(e.target.checked)}
                      className="mt-0.5 w-3.5 h-3.5 accent-emerald-600 flex-shrink-0" />
                    <span className="text-[10px] text-gray-500 leading-relaxed">
                      I am an authorised representative of the applying institution and agree to the Hospital Partner Terms & Conditions.
                    </span>
                  </label>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                  <p className="text-[10px] font-bold text-gray-700 mb-2">Data Processing Agreement</p>
                  <p className="text-[10px] text-gray-400 leading-relaxed mb-3">
                    By submitting, you acknowledge that Ubuzima Connect will process your organisation's information — including hospital name and contact details — to evaluate your partnership application and configure system access if approved. Data is stored securely and not shared with third parties except as required by Rwandan law.
                  </p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={dataChecked} onChange={e => setDataChecked(e.target.checked)}
                      className="mt-0.5 w-3.5 h-3.5 accent-emerald-600 flex-shrink-0" />
                    <span className="text-[10px] text-gray-500">
                      I consent to the processing of my organisation's data as described above.
                    </span>
                  </label>
                </div>
                {errors.terms && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                      <span className="text-red-600 text-[10px] font-black">!</span>
                    </div>
                    <p className="text-[10px] text-red-600 font-semibold">{errors.terms}</p>
                  </div>
                )}
                {errors.submit && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                      <span className="text-red-600 text-[10px] font-black">!</span>
                    </div>
                    <p className="text-[10px] text-red-600 font-semibold">{errors.submit}</p>
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-100">
              <button onClick={back}
                className={`text-[11px] font-medium uppercase tracking-widest text-gray-400 hover:text-gray-700 transition-colors ${step === 1 ? 'invisible' : ''}`}>
                ← Back
              </button>
              {step < 4 ? (
                <button onClick={next}
                  className="py-3 px-8 bg-med-emerald hover:bg-black text-white font-bold rounded-2xl transition-all text-sm">
                  Continue →
                </button>
              ) : (
                <button onClick={submit} disabled={loading}
                  className="py-3 px-8 bg-med-emerald hover:bg-black text-white font-bold rounded-2xl transition-all text-sm disabled:opacity-50 flex items-center gap-2">
                  {loading
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting…</>
                    : 'Submit Application'
                  }
                </button>
              )}
            </div>
          </div>

          <p className="text-center text-[10px] text-gray-300 pb-6 font-medium">© 2026 Ubuzima Connect · Rwanda</p>
        </div>
      </div>
    </div>
  );
}
