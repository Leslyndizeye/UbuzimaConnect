import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const LEGAL_SECTIONS = [
  {
    title: '1. System Classification & Clinical Disclaimer',
    paragraphs: [
      'Ubuzima Connect is classified strictly as a Clinical Decision Support System (CDSS). The artificial intelligence models (ResNet-50) deployed within this platform provide probabilistic classifications and Grad-CAM heatmaps to assist in detecting Tuberculosis, Pneumonia, and Normal chest X-ray images.',
      'This system does not provide autonomous or definitive medical diagnoses. The attending radiologist or licensed clinical administrator retains 100% of the diagnostic authority and legal liability. Users must utilize the Human-in-the-Loop verification interface to accept or override all AI predictions.',
    ],
  },
  {
    title: '2. Data Minimization & Patient Anonymization (Law No. 058/2021 Compliance)',
    paragraphs: [
      "To comply with Rwanda Law No. 058/2021 relating to the protection of personal data, all uploaded chest X-rays are structurally separated from Personally Identifiable Information (PII). Images are stored securely using UUID-based filenames, while metadata is stored in a separate PostgreSQL database.",
      'Rwanda 16-digit National IDs are strictly masked in read-only, export, and audit views to reduce unauthorized data scraping and accidental exposure.',
    ],
  },
  {
    title: '3. Role-Based Access Control (RBAC) & Auditing',
    paragraphs: [
      'Access to patient records is strictly scoped to the originating hospital boundary. Every state-changing action, including registration, image upload, AI prediction, radiologist override, and retraining activity, is recorded in an audit log.',
      'Platform access is granted only to clinicians holding a valid Rwanda Medical and Dental Council (RMDC) license, subject to approval by a clinical administrator.',
    ],
  },
  {
    title: '4. Continuous Learning & Data Retention',
    paragraphs: [
      "By utilizing the platform, hospital administrators consent to the secure use of verified, anonymized chest X-rays for the background retraining pipeline. This data is used exclusively to fine-tune the model's accuracy for the Rwandan demographic and mitigate distribution shift.",
      'Data is never sold or transferred to third-party commercial entities.',
    ],
  },
];

export default function LegalPage() {
  const [agreed, setAgreed] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(true);
  const navigate = useNavigate();

  const handleAccept = () => {
    if (rememberChoice) localStorage.setItem('ubuzima_legal_ack', 'accepted');
    sessionStorage.setItem('ubuzima_legal_redirect', '1');
    navigate('/auth?mode=register&legal=accepted');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fffc] via-white to-emerald-50/40 px-4 py-8 sm:px-6 lg:px-8 text-gray-900 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-12 top-14 h-24 w-24 rounded-full bg-emerald-200/50 blur-3xl" />
        <div className="absolute right-20 top-24 h-28 w-28 rounded-full bg-teal-100/70 blur-3xl" />
        <div className="absolute left-24 bottom-20 h-32 w-32 rounded-full bg-emerald-100/70 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        <div className="rounded-[32px] border border-slate-100 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.08)] overflow-hidden">
          <div className="px-6 md:px-10 py-8 md:py-10 bg-gradient-to-r from-[#1C5438] via-[#267347] to-[#2b7a56] text-white">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-white/10 border border-white/15 rounded-2xl flex items-center justify-center relative overflow-hidden shrink-0">
                <div className="w-5 h-[2px] rounded-full bg-white" />
              </div>
              <span className="text-[16px] md:text-[18px] font-display font-bold tracking-tight uppercase text-white">
                Ubuzima Connect
              </span>
            </div>
            <h1 className="text-2xl md:text-[2.35rem] font-black tracking-tight text-white">
              End User License Agreement (EULA) & Privacy Policy
            </h1>
            <p className="mt-4 text-base text-white/80 max-w-4xl leading-8">
              Before you request access, Ubuzima Connect requires your confirmation that you understand the clinical
              disclaimer, Law No. 058/2021 privacy commitments, role-based access controls, and anonymized retraining
              terms that govern use of the platform.
            </p>
          </div>

          <div className="px-6 md:px-10 py-8 md:py-10 space-y-5 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.08),transparent_22rem)]">
            {LEGAL_SECTIONS.map((section) => (
              <section
                key={section.title}
                className="rounded-[28px] border border-slate-100 bg-white p-5 md:p-6 shadow-[0_4px_30px_rgba(0,0,0,0.03)]"
              >
                <div className="min-w-0">
                  <h2 className="text-base md:text-lg font-black text-emerald-900 mb-3 tracking-tight">{section.title}</h2>
                  <div className="space-y-3 text-sm leading-7 text-gray-600">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              </section>
            ))}

            <div className="rounded-[28px] border border-emerald-100 bg-[#F0FDF4] p-5 md:p-6 shadow-[0_4px_30px_rgba(0,0,0,0.03)]">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-2.5 h-4 w-4 accent-emerald-600 shrink-0"
                />
                <span className="text-base leading-8 text-gray-700">
                  I have read and agree to Ubuzima Connect&apos;s EULA & Privacy Policy. I understand that final
                  medical responsibility remains with the licensed clinician and that anonymized data handling is
                  governed by the clauses above.
                </span>
              </label>

              <label className="mt-5 flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberChoice}
                  onChange={(e) => setRememberChoice(e.target.checked)}
                  className="h-4 w-4 accent-emerald-600"
                />
                <span className="text-sm text-gray-500">Remember my choice on this device</span>
              </label>

              <div className="mt-8 flex flex-col sm:flex-row sm:justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (window.history.length > 1) window.history.back();
                    else window.location.href = '/';
                  }}
                  className="px-6 py-3 rounded-full border border-slate-200 bg-white text-slate-700 text-base font-semibold hover:bg-slate-50 transition-colors"
                >
                  Decline
                </button>
                <button
                  type="button"
                  disabled={!agreed}
                  onClick={handleAccept}
                  className="px-6 py-3 rounded-full bg-emerald-700 text-white text-base font-bold hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
                >
                  Accept
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
