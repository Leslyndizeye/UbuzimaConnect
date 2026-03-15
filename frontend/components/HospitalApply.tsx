// frontend/components/HospitalApply.tsx
// 4-step hospital partnership application form at /hospital/apply

import { useState, useRef } from 'react';
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
Ubuzima Connect ("the Platform") provides AI-assisted chest X-ray diagnostic support to approved healthcare institutions in Rwanda. The Platform is intended to assist, not replace, qualified radiologists in clinical decision-making.

2. APPROVED USE
The Platform may only be used by licensed healthcare professionals. Hospital administrators are responsible for ensuring only approved radiologists access the system. Credentials must not be shared outside approved personnel.

3. CLINICAL RESPONSIBILITY
All AI-generated diagnoses are decision-support tools only. Final clinical decisions remain the sole responsibility of the attending radiologist or physician. Ubuzima Connect does not assume liability for clinical outcomes arising from Platform use.

4. DATA PRIVACY & SECURITY
Patient data uploaded to the Platform must comply with Rwanda's data protection regulations. Hospitals are responsible for obtaining patient consent for digital X-ray processing. Ubuzima Connect stores diagnostic data securely and does not share it with third parties without consent.

5. HOSPITAL LOGO & BRANDING
By uploading your hospital logo, you grant Ubuzima Connect permission to display it within the platform interface visible to your registered radiologists. The logo will not be used in external marketing without written consent.

6. MODEL RETRAINING
X-ray data submitted for model retraining may be used to improve the AI model. All data is anonymised before processing. Hospitals retain ownership of patient data and may request deletion at any time.

7. GOOGLE MEET ONBOARDING CALL
Prior to receiving credentials, approved applicants must attend a mandatory 30-minute onboarding call. Approval is conditional on completion of this call.

8. ACCESS REVOCATION
Ubuzima Connect reserves the right to suspend or revoke hospital access in cases of misuse or breach of these terms. Hospitals may request deactivation at any time.

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

export default function HospitalApply() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refNumber, setRefNumber] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [termsChecked, setTermsChecked] = useState(false);
  const [dataChecked, setDataChecked] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormData>({
    name:'', type:'', email:'', phone:'', moh_license:'', website:'', logo_base64:'',
    province:'', district:'', sector:'', address:'', contact_name:'', contact_role:'',
    num_radiologists:'', num_machines:'', monthly_volume:'',
    current_system:'', primary_conditions:'', heard_from:'', notes:'',
  });

  const set = (k: keyof FormData, v: string) => {
    setForm(f => ({...f, [k]: v}));
    setErrors(e => ({...e, [k]: ''}));
    if (k === 'province') setForm(f => ({...f, province: v, district: ''}));
  };

  const validate = (s: number) => {
    const required: Record<number, (keyof FormData)[]> = {
      1: ['name','type','email','phone','moh_license'],
      2: ['province','district','address','contact_name','contact_role'],
      3: ['num_radiologists','num_machines','monthly_volume'],
      4: [],
    };
    const errs: Record<string,string> = {};
    for (const k of required[s]) {
      if (!form[k].trim()) errs[k] = 'This field is required';
    }
    if (s === 4 && (!termsChecked || !dataChecked)) {
      errs['terms'] = 'Please accept all agreements to continue';
    }
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
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Submission failed');
      }
      const data = await res.json();
      setRefNumber(data.ref_number);
      setSubmitted(true);
    } catch (err: any) {
      setErrors({submit: err.message});
    } finally {
      setLoading(false);
    }
  };

  const progress = (step / 4) * 100;
  const stepLabels = ['Organisation','Location','Radiology Team','Terms'];

  const inputCls = (k: string) =>
    `w-full border rounded-xl px-4 py-3 text-sm outline-none transition-all font-sans
     ${errors[k] ? 'border-red-400 bg-red-50' : 'border-green-100 bg-white focus:border-green-500 focus:ring-2 focus:ring-green-100'}`;

  const selectCls = (k: string) =>
    `w-full border rounded-xl px-4 py-3 text-sm outline-none transition-all bg-white font-sans
     ${errors[k] ? 'border-red-400' : 'border-green-100 focus:border-green-500'}`;

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl p-12 max-w-lg w-full text-center shadow-xl">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">✅</div>
          <h2 className="text-3xl font-bold text-[#0d3320] mb-3" style={{fontFamily:'Georgia,serif'}}>Application Submitted!</h2>
          <p className="text-green-700 leading-relaxed mb-2">
            Thank you for applying to become a Ubuzima Connect hospital partner.
            Our team will review your application and get in touch within <strong>48 hours</strong>.
          </p>
          <p className="text-green-600 text-sm leading-relaxed mb-6">
            Check your email at <strong>{form.email}</strong> for a confirmation message.
            If approved for the next stage, we will schedule a Google Meet onboarding call.
          </p>
          <div className="inline-block bg-[#f5f0e8] border border-green-100 rounded-xl px-6 py-3 text-sm text-green-700 mb-8">
            Your reference: <code className="font-bold text-[#0d3320] ml-1">{refNumber}</code>
          </div>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-[#0d3320] text-white py-3 rounded-xl font-bold hover:bg-green-800 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f0e8] py-12 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-green-700 text-sm mb-8 hover:text-green-600">
          ← Back to home
        </button>
        <h1 className="text-3xl font-bold text-[#0d3320] mb-2" style={{fontFamily:'Georgia,serif'}}>Hospital Partnership Application</h1>
        <p className="text-green-700 text-sm mb-8">Ubuzima Connect — AI Chest X-Ray Diagnostic Platform</p>

        {/* Form card */}
        <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-green-100">

          {/* Form header */}
          <div className="bg-gradient-to-r from-[#0d3320] to-[#1a5c38] px-8 py-8">
            <div className="flex justify-between mb-3">
              {stepLabels.map((l,i) => (
                <span key={l} className={`text-xs font-semibold ${i+1===step?'text-yellow-300':i+1<step?'text-green-400':'text-white/40'}`}>{i+1}. {l}</span>
              ))}
            </div>
            <div className="h-1 bg-white/20 rounded-full">
              <div className="h-full bg-gradient-to-r from-yellow-400 to-yellow-300 rounded-full transition-all duration-500" style={{width:`${progress}%`}} />
            </div>
          </div>

          <div className="p-8">

            {/* STEP 1: Organisation */}
            {step === 1 && (
              <div className="space-y-5">
                <h3 className="font-bold text-[#0d3320] text-lg border-b border-green-50 pb-4">Organisation Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Hospital / Facility Name <span className="text-red-400">*</span></label>
                    <input className={inputCls('name')} value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. King Faisal Hospital Kigali"/>
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Facility Type <span className="text-red-400">*</span></label>
                    <select className={selectCls('type')} value={form.type} onChange={e=>set('type',e.target.value)}>
                      <option value="">Select type...</option>
                      {['Public Hospital','Private Hospital','NGO / Mission Hospital','District Hospital','Referral Hospital','Health Centre'].map(t=><option key={t}>{t}</option>)}
                    </select>
                    {errors.type && <p className="text-red-500 text-xs mt-1">{errors.type}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">MoH License Number <span className="text-red-400">*</span></label>
                    <input className={inputCls('moh_license')} value={form.moh_license} onChange={e=>set('moh_license',e.target.value)} placeholder="e.g. MoH/RW/2021/0042"/>
                    {errors.moh_license && <p className="text-red-500 text-xs mt-1">{errors.moh_license}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Official Email <span className="text-red-400">*</span></label>
                    <input type="email" className={inputCls('email')} value={form.email} onChange={e=>set('email',e.target.value)} placeholder="admin@hospital.rw"/>
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Phone Number <span className="text-red-400">*</span></label>
                    <input className={inputCls('phone')} value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+250 7XX XXX XXX"/>
                    {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Website (optional)</label>
                    <input className={inputCls('website')} value={form.website} onChange={e=>set('website',e.target.value)} placeholder="https://yourhospital.rw"/>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Hospital Logo</label>
                    <div
                      onClick={() => logoInputRef.current?.click()}
                      className="border-2 border-dashed border-green-100 rounded-2xl p-6 text-center cursor-pointer hover:border-green-400 hover:bg-green-50/50 transition-all"
                    >
                      {form.logo_base64 ? (
                        <img src={form.logo_base64} alt="Logo" className="h-16 mx-auto mb-2 rounded-lg object-contain"/>
                      ) : (
                        <div className="text-3xl mb-2">🏥</div>
                      )}
                      <p className="text-sm text-green-700">{form.logo_base64 ? 'Click to change logo' : 'Click to upload hospital logo'}</p>
                      <p className="text-xs text-green-500 mt-1">PNG or JPG — will appear on the platform for your radiologists</p>
                    </div>
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogo}/>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Location */}
            {step === 2 && (
              <div className="space-y-5">
                <h3 className="font-bold text-[#0d3320] text-lg border-b border-green-50 pb-4">Location in Rwanda</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Province <span className="text-red-400">*</span></label>
                    <select className={selectCls('province')} value={form.province} onChange={e=>set('province',e.target.value)}>
                      <option value="">Select province...</option>
                      {Object.keys(DISTRICTS).map(p=><option key={p}>{p}</option>)}
                    </select>
                    {errors.province && <p className="text-red-500 text-xs mt-1">{errors.province}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">District <span className="text-red-400">*</span></label>
                    <select className={selectCls('district')} value={form.district} onChange={e=>set('district',e.target.value)} disabled={!form.province}>
                      <option value="">Select district...</option>
                      {(DISTRICTS[form.province] || []).map(d=><option key={d}>{d}</option>)}
                    </select>
                    {errors.district && <p className="text-red-500 text-xs mt-1">{errors.district}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Sector / Cell</label>
                    <input className={inputCls('sector')} value={form.sector} onChange={e=>set('sector',e.target.value)} placeholder="e.g. Kacyiru Sector"/>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Contact Person <span className="text-red-400">*</span></label>
                    <input className={inputCls('contact_name')} value={form.contact_name} onChange={e=>set('contact_name',e.target.value)} placeholder="Full name"/>
                    {errors.contact_name && <p className="text-red-500 text-xs mt-1">{errors.contact_name}</p>}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Contact Person Role <span className="text-red-400">*</span></label>
                    <input className={inputCls('contact_role')} value={form.contact_role} onChange={e=>set('contact_role',e.target.value)} placeholder="e.g. Head of Radiology, IT Manager"/>
                    {errors.contact_role && <p className="text-red-500 text-xs mt-1">{errors.contact_role}</p>}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Full Physical Address <span className="text-red-400">*</span></label>
                    <textarea rows={3} className={inputCls('address') + ' resize-none'} value={form.address} onChange={e=>set('address',e.target.value)} placeholder="Street address, building, landmarks..."/>
                    {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Radiology capacity */}
            {step === 3 && (
              <div className="space-y-5">
                <h3 className="font-bold text-[#0d3320] text-lg border-b border-green-50 pb-4">Radiology Capacity</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Number of Radiologists <span className="text-red-400">*</span></label>
                    <select className={selectCls('num_radiologists')} value={form.num_radiologists} onChange={e=>set('num_radiologists',e.target.value)}>
                      <option value="">Select...</option>
                      {['1','2–3','4–6','7–10','More than 10'].map(v=><option key={v}>{v}</option>)}
                    </select>
                    {errors.num_radiologists && <p className="text-red-500 text-xs mt-1">{errors.num_radiologists}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Number of X-Ray Machines <span className="text-red-400">*</span></label>
                    <select className={selectCls('num_machines')} value={form.num_machines} onChange={e=>set('num_machines',e.target.value)}>
                      <option value="">Select...</option>
                      {['1','2–3','4–6','7+'].map(v=><option key={v}>{v}</option>)}
                    </select>
                    {errors.num_machines && <p className="text-red-500 text-xs mt-1">{errors.num_machines}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">X-Rays per Month <span className="text-red-400">*</span></label>
                    <select className={selectCls('monthly_volume')} value={form.monthly_volume} onChange={e=>set('monthly_volume',e.target.value)}>
                      <option value="">Select...</option>
                      {['Less than 50','50–200','200–500','500–1,000','More than 1,000'].map(v=><option key={v}>{v}</option>)}
                    </select>
                    {errors.monthly_volume && <p className="text-red-500 text-xs mt-1">{errors.monthly_volume}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Current Diagnostic System</label>
                    <select className={selectCls('current_system')} value={form.current_system} onChange={e=>set('current_system',e.target.value)}>
                      <option value="">Select...</option>
                      {['Manual / Paper-based only','Basic digital records','PACS system','Other hospital software'].map(v=><option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">How did you hear about us?</label>
                    <select className={selectCls('heard_from')} value={form.heard_from} onChange={e=>set('heard_from',e.target.value)}>
                      <option value="">Select...</option>
                      {['Rwanda Biomedical Centre','Ministry of Health','Colleague / Referral','Social media','ALU / Academic network','Other'].map(v=><option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Primary Conditions Diagnosed</label>
                    <input className={inputCls('primary_conditions')} value={form.primary_conditions} onChange={e=>set('primary_conditions',e.target.value)} placeholder="e.g. TB, Pneumonia, COVID-19"/>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-green-700 uppercase tracking-wider mb-1.5">Additional Notes</label>
                    <textarea rows={3} className={inputCls('notes') + ' resize-none'} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Any other information, special requirements, or questions..."/>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Terms */}
            {step === 4 && (
              <div className="space-y-5">
                <h3 className="font-bold text-[#0d3320] text-lg border-b border-green-50 pb-4">Terms & Conditions</h3>
                <div className="bg-[#f5f0e8] border border-green-100 rounded-2xl p-5">
                  <h4 className="font-bold text-[#0d3320] mb-3">Ubuzima Connect — Hospital Partner Agreement</h4>
                  <div className="max-h-48 overflow-y-auto text-sm text-green-800 leading-relaxed pr-2 whitespace-pre-line mb-4"
                    style={{scrollbarWidth:'thin'}}>
                    {TERMS}
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer text-sm text-green-800">
                    <input type="checkbox" checked={termsChecked} onChange={e=>setTermsChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0"/>
                    I confirm that I am an authorised representative of the applying institution and agree to the Ubuzima Connect Hospital Partner Terms & Conditions.
                  </label>
                </div>
                <div className="bg-[#f5f0e8] border border-green-100 rounded-2xl p-5">
                  <h4 className="font-bold text-[#0d3320] mb-3">Data Processing Agreement</h4>
                  <p className="text-sm text-green-800 leading-relaxed mb-4">
                    By submitting this application, you acknowledge that Ubuzima Connect will process the information provided — including hospital name, contact details, and uploaded logo — for the purpose of evaluating your partnership application and, if approved, configuring your organisation's access to the Platform. This data is stored securely and will not be shared with third parties except as required by Rwandan law.
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer text-sm text-green-800">
                    <input type="checkbox" checked={dataChecked} onChange={e=>setDataChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0"/>
                    I consent to the processing of my organisation's data as described above.
                  </label>
                </div>
                {errors.terms && <p className="text-red-500 text-sm">{errors.terms}</p>}
                {errors.submit && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-xl">{errors.submit}</p>}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center mt-8 pt-6 border-t border-green-50">
              <button
                onClick={back}
                className={`border border-green-200 text-green-700 px-6 py-3 rounded-full text-sm font-semibold hover:border-green-400 transition-colors ${step===1?'invisible':''}`}
              >
                ← Back
              </button>
              {step < 4 ? (
                <button onClick={next}
                  className="bg-[#0d3320] text-white px-8 py-3 rounded-full text-sm font-bold hover:bg-green-800 transition-colors">
                  Continue →
                </button>
              ) : (
                <button onClick={submit} disabled={loading}
                  className="bg-[#0d3320] text-white px-8 py-3 rounded-full text-sm font-bold hover:bg-green-800 transition-colors disabled:opacity-50 flex items-center gap-2">
                  {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Submitting...</> : 'Submit Application ✓'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}