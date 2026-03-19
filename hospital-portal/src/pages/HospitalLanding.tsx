// pages/HospitalLanding.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  { num: '01', title: 'Submit Application',    desc: 'Fill in your hospital details, upload your health facility license, and share your radiology team info. Takes under 10 minutes.' },
  { num: '02', title: 'Review & Verification', desc: 'Our team verifies your Ministry of Health registration and credentials within 48 hours.' },
  { num: '03', title: 'Google Meet Onboarding',desc: 'A 30-minute call to walk through the platform and confirm your terms of access.' },
  { num: '04', title: 'Go Live',               desc: 'Receive admin credentials. Your hospital logo appears. Your radiologists register and start diagnosing.' },
];

const BENEFITS = [
  { title: 'AI at Radiologist Level',   desc: 'ResNet-50 trained on 13,000+ chest X-rays. Detects TB and pneumonia with 98% validation accuracy and AUC 1.0.' },
  { title: 'Grad-CAM Explanations',     desc: 'Every diagnosis shows a heatmap highlighting which region of the X-ray drove the AI decision — building clinical trust.' },
  { title: 'Your Brand on Platform',    desc: 'Your hospital logo and name appear throughout the platform. Your radiologists see your identity.' },
  { title: 'Full Team Management',      desc: 'Control radiologist access from your admin dashboard — approve, reject, or revoke at any time.' },
  { title: 'Audit Trails & Compliance', desc: 'Every action is logged with timestamps. Full accountability for clinical governance and compliance.' },
  { title: 'Continuously Improving',    desc: 'Upload your own X-ray data to retrain the model. The AI improves with data from your patient population.' },
];

const STATS = [
  { n: '8,551',  l: 'TB cases in Rwanda per year' },
  { n: '15,000+',l: 'Pneumonia cases per year' },
  { n: '17',     l: 'Trained radiologists nationwide' },
  { n: '8s',     l: 'Average AI diagnosis time' },
  { n: '99%',    l: 'Validation accuracy (AUC 1.0)' },
];

export default function HospitalLanding() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-white">

      {/* ── NAV ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8 md:px-12 flex items-center justify-between ${scrolled ? 'bg-white/80 backdrop-blur-md shadow-sm' : 'bg-transparent'}`}>
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div className="w-7 h-7 bg-med-emerald rounded-md flex items-center justify-center transition-transform group-hover:scale-105">
            <div className="w-4 h-[1.5px] bg-white rounded-full" />
          </div>
          <span className="text-[13px] font-bold tracking-tight text-gray-900 uppercase font-display">Ubuzima Connect</span>
        </div>

        <div className="hidden md:flex items-center gap-10 text-[11px] font-medium text-gray-500 uppercase tracking-widest">
          <a href="#how"      className="hover:text-black transition-colors">How It Works</a>
          <a href="#benefits" className="hover:text-black transition-colors">Benefits</a>
          <a href="https://ubuzimaconnect.vercel.app/auth" target="_blank" rel="noreferrer" className="hover:text-black transition-colors">Radiologist Login ↗</a>
        </div>

        <button onClick={() => navigate('/apply')}
          className="px-6 py-2.5 bg-med-emerald text-white text-[11px] font-medium rounded-full hover:bg-black transition-all shadow-md group">
          Apply <span className="ml-1 opacity-70 group-hover:translate-x-0.5 transition-transform">→</span>
        </button>
      </nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-24 pb-16 bg-[#fafafa] overflow-hidden">
        <div className="absolute inset-0 medical-grid pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(6,78,59,0.04) 0%, transparent 65%)' }} />

        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 flex flex-col items-center text-center">

          {/* Badge */}
          <div className="fu mb-8 flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-med-emerald pdot" />
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-500">Now accepting hospital partners · Rwanda 2026</span>
          </div>

          {/* Headline */}
          <h1 className="fu2 font-display font-medium tracking-tight text-gray-900 leading-[1.03] mb-8 max-w-5xl"
            style={{ fontSize: 'clamp(2.8rem, 7vw, 5.5rem)', letterSpacing: '-0.03em' }}>
            AI Chest X-Ray Diagnostics<br />
            <span className="text-gray-900/45 italic">for Your Hospital.</span>
          </h1>

          {/* Sub-headline */}
          <p className="fu3 text-base md:text-lg text-gray-500 max-w-2xl mx-auto font-normal leading-relaxed mb-12">
            Ubuzima Connect brings ResNet-50 AI diagnosis to your facility.
            Detect TB and pneumonia in seconds giving your radiologists the support they need,
            wherever they are in Rwanda.
          </p>

          {/* CTAs */}
          <div className="fu3 flex flex-col sm:flex-row items-center justify-center gap-8 mb-20">
            <button onClick={() => navigate('/apply')}
              className="px-8 py-3.5 bg-med-emerald text-white font-medium text-[13px] rounded-full hover:bg-black transition-all shadow-lg flex items-center gap-3 group">
              Apply for Access <span className="opacity-70 group-hover:translate-x-0.5 transition-transform">→</span>
            </button>
            <a href="#how" className="text-[13px] font-medium text-gray-700 hover:text-black transition-colors">
              See how it works
            </a>
          </div>

          {/* Stats */}
          <div className="fu3 grid grid-cols-2 md:grid-cols-5 gap-8 w-full max-w-4xl pt-4">
            {STATS.map(s => (
              <div key={s.n} className="text-center">
                <div className="font-display font-bold text-gray-900 mb-1.5" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>{s.n}</div>
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-widest leading-snug">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="py-32 px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="mb-24 flex flex-col md:flex-row md:items-end justify-between gap-12">
            <div className="max-w-2xl space-y-6">
              <span className="text-[11px] font-bold text-med-emerald uppercase tracking-[0.5em] block">Process</span>
              <h2 className="font-display font-medium tracking-tighter text-gray-900 leading-[0.95]"
                style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}>
                From application to active<br />in 4 steps.
              </h2>
              <p className="text-base text-gray-500 max-w-md">Most hospitals go live within 5–7 business days after submitting.</p>
            </div>
            <button onClick={() => navigate('/apply')}
              className="shrink-0 px-10 py-4 border border-gray-200 text-gray-900 font-bold text-[12px] uppercase tracking-widest rounded-full hover:bg-med-emerald hover:text-white hover:border-med-emerald transition-all">
              Start Application
            </button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {STEPS.map((s, i) => (
              <div key={i} className="group relative">
                <div className="font-display font-bold text-neutral-100 absolute -top-8 -left-2 select-none group-hover:text-med-emerald/10 transition-colors"
                  style={{ fontSize: '5rem', lineHeight: 1 }}>
                  {s.num}
                </div>
                <div className="relative z-10 pt-10 p-8 bg-gray-50/60 rounded-[2.5rem] border border-transparent hover:bg-white hover:border-gray-100 hover:shadow-2xl transition-all duration-700">
                  <h3 className="font-display text-lg font-bold text-gray-900 mb-3 group-hover:text-med-emerald transition-colors tracking-tight">{s.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
                  <div className="mt-6 w-10 h-px bg-gray-200 group-hover:w-full group-hover:bg-med-emerald transition-all duration-700" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BENEFITS ── */}
      <section id="benefits" className="py-32 px-8 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="mb-24 flex flex-col md:flex-row md:items-end justify-between gap-12">
            <div className="max-w-2xl space-y-6">
              <span className="text-[11px] font-bold text-med-emerald uppercase tracking-[0.5em] block">Why Partner With Us</span>
              <h2 className="font-display font-medium tracking-tighter text-gray-900 leading-[0.95]"
                style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}>
                Built for Rwanda's<br />
                <span className="text-gray-900/40 italic">healthcare reality.</span>
              </h2>
            </div>
            <p className="text-base text-gray-500 max-w-sm leading-relaxed">
              Designed from the ground up for hospitals in resource-constrained settings.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
            {BENEFITS.map((b, i) => (
              <div key={i} className="group p-12 bg-gray-50/50 rounded-[3rem] border border-transparent hover:bg-white hover:border-gray-100 hover:shadow-2xl transition-all duration-700">
                <h3 className="font-display text-2xl font-bold text-gray-900 mb-4 transition-colors group-hover:text-med-emerald">{b.title}</h3>
                <p className="text-gray-500 text-base leading-relaxed mb-8 font-normal">{b.desc}</p>
                <div className="w-10 h-px bg-gray-200 group-hover:w-full group-hover:bg-med-emerald transition-all duration-700" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-32 px-8 bg-white relative overflow-hidden">
        <div className="absolute inset-0 medical-grid opacity-20 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(6,78,59,0.05) 0%, transparent 65%)', filter: 'blur(80px)' }} />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-block mb-12">
            <div className="flex items-center gap-4 text-med-emerald">
              <div className="w-12 h-px bg-med-emerald/30" />
              <span className="text-[11px] font-bold uppercase tracking-[0.5em]">Hospital Partnership Programme</span>
              <div className="w-12 h-px bg-med-emerald/30" />
            </div>
          </div>

          <h2 className="font-display font-medium tracking-tighter text-gray-900 mb-10 leading-[0.95]"
            style={{ fontSize: 'clamp(2.8rem, 7vw, 6rem)' }}>
            Ready to bring AI<br />
            <span className="text-med-emerald italic">to your hospital?</span>
          </h2>

          <p className="text-lg md:text-xl text-gray-500 mb-12 max-w-xl mx-auto leading-relaxed">
            Our team reviews every application personally. Most hospitals hear back within 48 hours.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
            <button onClick={() => navigate('/apply')}
              className="px-12 py-5 bg-med-emerald text-white font-bold uppercase tracking-widest text-[11px] rounded-full hover:bg-black hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-med-emerald/20">
              Start Your Application
            </button>
            <p className="text-[12px] text-gray-400 font-medium">
              Questions?{' '}
              <a href="mailto:leslynd@ubuzimaconnect.rw" className="text-med-emerald font-bold hover:underline">
                leslynd@ubuzimaconnect.rw
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-20 px-8 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mb-16">
            <div className="lg:col-span-5 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-med-emerald flex items-center justify-center">
                  <div className="w-5 h-[1.5px] bg-white rounded-full" />
                </div>
                <span className="font-display text-lg font-bold tracking-tight text-gray-900 uppercase">Ubuzima Connect</span>
              </div>
              <p className="text-gray-500 text-base leading-relaxed max-w-xs">
                AI-powered chest X-ray diagnostics for Rwanda's healthcare system.
              </p>
            </div>

            <div className="lg:col-span-3 space-y-6">
              <h4 className="text-[11px] font-bold text-gray-900 uppercase tracking-[0.5em]">Hospital Portal</h4>
              <ul className="space-y-4 text-[13px] font-medium text-gray-400 uppercase tracking-widest">
                <li><a href="#how"      className="hover:text-med-emerald transition-colors">How It Works</a></li>
                <li><a href="#benefits" className="hover:text-med-emerald transition-colors">Benefits</a></li>
                <li><button onClick={() => navigate('/apply')} className="hover:text-med-emerald transition-colors">Apply Now</button></li>
              </ul>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <h4 className="text-[11px] font-bold text-gray-900 uppercase tracking-[0.5em]">Platform</h4>
              <ul className="space-y-4 text-[13px] font-medium text-gray-400 uppercase tracking-widest">
                <li>
                  <a href="https://ubuzimaconnect.vercel.app/auth" target="_blank" rel="noreferrer"
                    className="hover:text-med-emerald transition-colors">Radiologist Login ↗</a>
                </li>
                <li>
                  <button onClick={() => navigate('/admin')} className="hover:text-med-emerald transition-colors">Admin</button>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-10 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6 text-[11px] font-bold text-gray-400 uppercase tracking-[0.4em]">
            <div>© 2026 Ubuzima Connect</div>
            <div className="flex items-center gap-10">
              <a href="mailto:leslynd@ubuzimaconnect.rw" className="hover:text-med-emerald transition-colors">Contact</a>
              <span>AI-powered diagnostics · Rwanda</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
