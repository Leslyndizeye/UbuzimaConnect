// components/HospitalApply.tsx
// Matches existing Ubuzima Connect design — emerald palette, same input style as AuthPage
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

const DISTRICTS: Record<string, string[]> = {
  'Kigali City':       ['Gasabo','Kicukiro','Nyarugenge'],
  'Northern Province': ['Burera','Gakenke','Gicumbi','Musanze','Rulindo'],
  'Southern Province': ['Gisagara','Huye','Kamonyi','Muhanga','Nyamagabe','Nyanza','Nyaruguru','Ruhango'],
  'Eastern Province':  ['Bugesera','Gatsibo','Kayonza','Kirehe','Ngoma','Nyagatare','Rwamagana'],
  'Western Province':  ['Karongi','Ngororero','Nyabihu','Nyamasheke','Rubavu','Rutsiro','Rusizi'],
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
By uploading your hospital logo, you grant Ubuzima Connect permission to display it within the platform interface visible to your registered radiologists only.

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
  moh_license: string; website: string; logo_base64: string;
  province: string; district: string; sector: string; address: string;
  contact_name: string; contact_role: string;
  num_radiologists: string; num_machines: string; monthly_volume: string;
  current_system: string; primary_conditions: string; heard_from: string; notes: string;
}

const inp = "w-full px-3.5 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-gray-900 text-xs font-medium outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 transition-all placeholder:text-gray-300";
const sel = "w-full px-3.5 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-gray-900 text-xs font-medium outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 transition-all";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-0.5">{label}</label>
      {children}
      {error && <p className="text-[9px] text-red-500 ml-1">{error}</p>}
    </div>
  );
}

export default function HospitalApply() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [refNumber, setRefNumber] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [termsChecked, setTermsChecked] = useState(false);
  const [dataChecked, setDataChecked] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormData>({
    name: '', type: '', email: '', phone: '', moh_license: '', website: '', logo_base64: '',
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
      1: ['name', 'type', 'email', 'phone', 'moh_license'],
      2: ['province', 'district', 'address', 'contact_name', 'contact_role'],
      3: ['num_radiologists', 'num_machines', 'monthly_volume'],
      4: [],
    };
    const errs: Record<string, string> = {};
    for (const k of required[s]) {
      if (!form[k].trim()) errs[k] = 'Required';
    }
    if (s === 4 && (!termsChecked || !dataChecked)) errs['terms'] = 'Please accept all agreements';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set('logo_base64', ev.target?.result as string);
    reader.readAsDataURL(file);
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
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Submission failed'); }
      const data = await res.json();
      setRefNumber(data.ref_number);
      setSubmitted(true);
    } catch (err: any) {
      setErrors({ submit: err.message });
    } finally {
      setLoading(false);
    }
  };

  const stepLabels = ['Organisation', 'Location', 'Radiology', 'Terms'];

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-gray-100 p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 rounded-2xl mb-4">
            <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-black text-gray-900 mb-2">Application Submitted</h2>
          <p className="text-gray-500 text-xs leading-relaxed mb-3">
            Our team will review your application and get in touch within <strong>48 hours</strong>.
          </p>
          <p className="text-gray-400 text-xs mb-5 leading-relaxed">
            Check <strong>{form.email}</strong> for a confirmation. If approved, we'll schedule a Google Meet onboarding call.
          </p>
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 inline-block mb-6">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Reference</span>
            <p className="text-sm font-black text-emerald-700 font-mono mt-0.5">{refNumber}</p>
          </div>
          <button onClick={() => navigate('/')} className="w-full py-3 bg-emerald-900 hover:bg-emerald-800 text-white font-bold rounded-xl transition-all text-sm">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400 hover:text-gray-600 mb-5 transition-colors uppercase tracking-widest">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          Back to home
        </button>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-7 pb-6 bg-emerald-900">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 bg-emerald-900 border border-emerald-700 rounded-lg flex items-center justify-center">
                <div className="w-3 h-[1.5px] rounded-full bg-emerald-100" />
              </div>
              <span className="text-xs font-bold text-white/80 uppercase tracking-widest">Ubuzima Connect</span>
            </div>
            <h1 className="text-xl font-black text-white mb-1">Hospital Partnership</h1>
            <p className="text-xs text-emerald-300 mb-5">AI Chest X-Ray Diagnostic Platform · Rwanda</p>
            {/* Progress */}
            <div className="flex justify-between mb-2">
              {stepLabels.map((l, i) => (
                <span key={l} className={`text-[9px] font-bold uppercase tracking-wider ${i + 1 === step ? 'text-emerald-300' : i + 1 < step ? 'text-emerald-500' : 'text-emerald-800'}`}>
                  {i + 1}. {l}
                </span>
              ))}
            </div>
            <div className="h-1 bg-emerald-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full transition-all duration-500" style={{ width: `${(step / 4) * 100}%` }} />
            </div>
          </div>

          <div className="px-8 py-6 space-y-4">

            {/* STEP 1 */}
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-300 pb-2 border-b border-gray-50">Organisation Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Field label="Hospital / Facility Name *" error={errors.name}>
                      <input className={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. King Faisal Hospital Kigali" />
                    </Field>
                  </div>
                  <Field label="Facility Type *" error={errors.type}>
                    <select className={sel} value={form.type} onChange={e => set('type', e.target.value)}>
                      <option value="">Select…</option>
                      {['Public Hospital','Private Hospital','NGO / Mission Hospital','District Hospital','Referral Hospital','Health Centre'].map(t=><option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="MoH License Number *" error={errors.moh_license}>
                    <input className={inp} value={form.moh_license} onChange={e => set('moh_license', e.target.value)} placeholder="MoH/RW/2021/0042" />
                  </Field>
                  <Field label="Official Email *" error={errors.email}>
                    <input type="email" className={inp} value={form.email} onChange={e => set('email', e.target.value)} placeholder="admin@hospital.rw" />
                  </Field>
                  <Field label="Phone Number *" error={errors.phone}>
                    <input className={inp} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+250 7XX XXX XXX" />
                  </Field>
                  <div className="col-span-2">
                    <Field label="Website (optional)">
                      <input className={inp} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://yourhospital.rw" />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Hospital Logo — shown to your radiologists">
                      <div onClick={() => logoRef.current?.click()} className="border-2 border-dashed border-gray-100 rounded-xl p-4 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-all">
                        {form.logo_base64
                          ? <img src={form.logo_base64} alt="Logo" className="h-10 mx-auto object-contain rounded" />
                          : <p className="text-[10px] text-gray-300 font-medium">Click to upload PNG or JPG</p>
                        }
                      </div>
                      <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
                    </Field>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-300 pb-2 border-b border-gray-50">Location in Rwanda</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Province *" error={errors.province}>
                    <select className={sel} value={form.province} onChange={e => set('province', e.target.value)}>
                      <option value="">Select…</option>
                      {Object.keys(DISTRICTS).map(p=><option key={p}>{p}</option>)}
                    </select>
                  </Field>
                  <Field label="District *" error={errors.district}>
                    <select className={sel} value={form.district} onChange={e => set('district', e.target.value)} disabled={!form.province}>
                      <option value="">Select…</option>
                      {(DISTRICTS[form.province]||[]).map(d=><option key={d}>{d}</option>)}
                    </select>
                  </Field>
                  <Field label="Sector / Cell">
                    <input className={inp} value={form.sector} onChange={e => set('sector', e.target.value)} placeholder="e.g. Kacyiru" />
                  </Field>
                  <Field label="Contact Person *" error={errors.contact_name}>
                    <input className={inp} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Full name" />
                  </Field>
                  <div className="col-span-2">
                    <Field label="Contact Person Role *" error={errors.contact_role}>
                      <input className={inp} value={form.contact_role} onChange={e => set('contact_role', e.target.value)} placeholder="e.g. Head of Radiology, IT Manager" />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Physical Address *" error={errors.address}>
                      <textarea rows={2} className={inp + ' resize-none'} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street, building, landmarks…" />
                    </Field>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <div className="space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-300 pb-2 border-b border-gray-50">Radiology Capacity</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Number of Radiologists *" error={errors.num_radiologists}>
                    <select className={sel} value={form.num_radiologists} onChange={e => set('num_radiologists', e.target.value)}>
                      <option value="">Select…</option>
                      {['1','2–3','4–6','7–10','More than 10'].map(v=><option key={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="X-Ray Machines *" error={errors.num_machines}>
                    <select className={sel} value={form.num_machines} onChange={e => set('num_machines', e.target.value)}>
                      <option value="">Select…</option>
                      {['1','2–3','4–6','7+'].map(v=><option key={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="X-Rays per Month *" error={errors.monthly_volume}>
                    <select className={sel} value={form.monthly_volume} onChange={e => set('monthly_volume', e.target.value)}>
                      <option value="">Select…</option>
                      {['Less than 50','50–200','200–500','500–1,000','More than 1,000'].map(v=><option key={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Current Diagnostic System">
                    <select className={sel} value={form.current_system} onChange={e => set('current_system', e.target.value)}>
                      <option value="">Select…</option>
                      {['Manual / Paper-based','Basic digital records','PACS system','Other software'].map(v=><option key={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="How did you hear about us?">
                    <select className={sel} value={form.heard_from} onChange={e => set('heard_from', e.target.value)}>
                      <option value="">Select…</option>
                      {['Rwanda Biomedical Centre','Ministry of Health','Colleague / Referral','Social media','ALU / Academic network','Other'].map(v=><option key={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Primary Conditions Diagnosed">
                    <input className={inp} value={form.primary_conditions} onChange={e => set('primary_conditions', e.target.value)} placeholder="e.g. TB, Pneumonia" />
                  </Field>
                  <div className="col-span-2">
                    <Field label="Additional Notes">
                      <textarea rows={2} className={inp + ' resize-none'} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Special requirements, questions…" />
                    </Field>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <div className="space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-300 pb-2 border-b border-gray-50">Terms & Conditions</p>
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                  <p className="text-[10px] font-bold text-gray-700 mb-2">Ubuzima Connect — Hospital Partner Agreement</p>
                  <div className="max-h-36 overflow-y-auto text-[10px] text-gray-400 leading-relaxed whitespace-pre-line pr-1 mb-3" style={{scrollbarWidth:'thin'}}>
                    {TERMS}
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={termsChecked} onChange={e=>setTermsChecked(e.target.checked)} className="mt-0.5 w-3.5 h-3.5 accent-emerald-600 flex-shrink-0"/>
                    <span className="text-[10px] text-gray-500 leading-relaxed">I am an authorised representative and agree to the Hospital Partner Terms & Conditions.</span>
                  </label>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                  <p className="text-[10px] font-bold text-gray-700 mb-2">Data Processing Agreement</p>
                  <p className="text-[10px] text-gray-400 leading-relaxed mb-3">By submitting, you acknowledge that Ubuzima Connect will process your organisation's information to evaluate your application and configure system access. Data is stored securely and not shared with third parties except as required by Rwandan law.</p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={dataChecked} onChange={e=>setDataChecked(e.target.checked)} className="mt-0.5 w-3.5 h-3.5 accent-emerald-600 flex-shrink-0"/>
                    <span className="text-[10px] text-gray-500">I consent to processing of my organisation's data as described above.</span>
                  </label>
                </div>
                {errors.terms && <p className="text-[10px] text-red-500">{errors.terms}</p>}
                {errors.submit && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-[10px] text-red-600 font-semibold">{errors.submit}</div>}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-50">
              <button onClick={back} className={`text-[9px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors ${step===1?'invisible':''}`}>
                ← Back
              </button>
              {step < 4 ? (
                <button onClick={next} className="py-2.5 px-7 bg-emerald-900 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-all">
                  Continue →
                </button>
              ) : (
                <button onClick={submit} disabled={loading} className="py-2.5 px-7 bg-emerald-900 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-all disabled:opacity-50 flex items-center gap-2">
                  {loading ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Submitting…</> : 'Submit Application'}
                </button>
              )}
            </div>
          </div>
          <p className="text-center text-[9px] text-gray-300 pb-5">© 2026 Ubuzima Connect · Rwanda</p>
        </div>
      </div>
    </div>
  );
}