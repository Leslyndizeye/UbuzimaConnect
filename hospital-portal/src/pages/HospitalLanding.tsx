// pages/HospitalLanding.tsx
// Standalone hospital portal landing page
// Design: Plus Jakarta Sans, emerald-900, same DNA as main Ubuzima Connect app
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
html { scroll-behavior: smooth; }
body { background: #fff; color: #111; overflow-x: hidden; }

@keyframes fadeUp  { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
@keyframes floatY  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
@keyframes pdot    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(1.6)} }
@keyframes ticker  { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
@keyframes barIn   { from{width:0} to{width:var(--w)} }

.fu  { animation: fadeUp .65s cubic-bezier(.22,1,.36,1) both; }
.fu2 { animation: fadeUp .65s cubic-bezier(.22,1,.36,1) .12s both; }
.fu3 { animation: fadeUp .65s cubic-bezier(.22,1,.36,1) .24s both; }
.float-el  { animation: floatY 3.5s ease-in-out infinite; }
.pdot      { animation: pdot 2s infinite; }
.ticker-wrap { animation: ticker 30s linear infinite; }
.ticker-wrap:hover { animation-play-state: paused; }

.card-hover { transition: transform .2s ease, box-shadow .2s ease; }
.card-hover:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,.08); }

nav.scrolled {
  background: rgba(255,255,255,0.96) !important;
  backdrop-filter: blur(16px);
  border-bottom: 1px solid #f0fdf4;
  box-shadow: 0 1px 12px rgba(0,0,0,.04);
}
`;

const STEPS = [
  { n: '01', icon: '📋', title: 'Submit Application',   desc: 'Fill in your hospital details, MoH license, and radiology team info. Takes under 10 minutes.' },
  { n: '02', icon: '🔍', title: 'Review & Verification', desc: 'Our team verifies your Ministry of Health registration and credentials within 48 hours.' },
  { n: '03', icon: '📹', title: 'Google Meet Onboarding', desc: 'A 30-minute call to walk through the platform and confirm your terms of access.' },
  { n: '04', icon: '🚀', title: 'Go Live',              desc: 'Receive admin credentials. Your hospital logo appears. Your radiologists register and start diagnosing.' },
];

const BENEFITS = [
  { icon: '🧠', title: 'AI at Radiologist Level',     desc: 'ResNet-50 trained on 13,000+ chest X-rays. Detects TB and pneumonia with 100% validation accuracy and AUC 1.0.' },
  { icon: '🔥', title: 'Grad-CAM Explanations',       desc: 'Every diagnosis shows a heatmap revealing which region of the X-ray drove the AI decision — building clinical trust.' },
  { icon: '🏥', title: 'Your Brand on Platform',      desc: 'Your hospital logo and name appear throughout the platform. Your radiologists see your identity.' },
  { icon: '👥', title: 'Full Team Management',        desc: 'Control radiologist access from your admin dashboard — approve, reject, or revoke at any time.' },
  { icon: '📊', title: 'Audit Trails & Compliance',   desc: 'Every action is logged with timestamps. Full accountability for clinical governance and compliance.' },
  { icon: '♾️', title: 'Continuously Improving',      desc: 'Upload your own X-ray data to retrain the model. The AI improves with data from your patient population.' },
];

const TICKER = ['Tuberculosis Detection', 'Pneumonia Diagnosis', 'Grad-CAM Heatmaps', 'ResNet-50 Model', 'Clinical Decision Support', 'Rwanda Healthcare AI', 'Secure Patient Records', 'Model Retraining Pipeline'];

export default function HospitalLanding() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <>
      <style>{CSS}</style>

      {/* ── NAV ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'scrolled' : ''}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-emerald-900 rounded-md flex items-center justify-center">
              <div className="w-3.5 h-[1.5px] rounded-full bg-emerald-100" />
            </div>
            <span className="text-sm font-black text-gray-900 uppercase tracking-tight">Ubuzima Connect</span>
            <span className="hidden sm:inline text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-wider">Hospital Portal</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#how"      className="hidden md:block text-[11px] font-bold text-gray-400 hover:text-emerald-700 transition-colors uppercase tracking-widest">How It Works</a>
            <a href="#benefits" className="hidden md:block text-[11px] font-bold text-gray-400 hover:text-emerald-700 transition-colors uppercase tracking-widest">Benefits</a>
            <a href="https://ubuzimaconnect.vercel.app/auth" target="_blank" rel="noreferrer"
              className="hidden md:block text-[11px] font-bold text-gray-300 hover:text-gray-500 transition-colors uppercase tracking-widest">
              Radiologist Login ↗
            </a>
            <button onClick={() => navigate('/apply')}
              className="px-5 py-2.5 bg-emerald-900 text-white text-[11px] font-black rounded-full hover:bg-emerald-800 transition-all uppercase tracking-widest">
              Apply →
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col justify-center overflow-hidden"
        style={{ background: 'linear-gradient(155deg, #0a2415 0%, #1C5438 55%, #2d7a4f 100%)' }}>
        {/* Grid */}
        <div className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 48px,#fff 48px,#fff 49px),repeating-linear-gradient(90deg,transparent,transparent 48px,#fff 48px,#fff 49px)' }} />
        {/* Glow top-right */}
        <div className="absolute -top-32 -right-32 w-[560px] h-[560px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.1) 0%, transparent 65%)' }} />
        {/* Glow bottom-left */}
        <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 65%)' }} />

        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-24 pb-20">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/8 border border-white/15 px-4 py-2 rounded-full mb-8 fu">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pdot" />
            <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest">Now accepting hospital partners · Rwanda 2026</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-[68px] font-black text-white leading-[1.01] tracking-tight max-w-3xl mb-6 fu2"
            style={{ letterSpacing: '-0.025em' }}>
            AI Chest X-Ray<br />
            Diagnostics for<br />
            <span className="text-emerald-400">Your Hospital.</span>
          </h1>

          <p className="text-base text-white/65 leading-relaxed max-w-lg mb-10 fu3">
            Ubuzima Connect brings ResNet-50 AI diagnosis to your facility.
            Detect TB and pneumonia in seconds — giving your radiologists the support they need,
            wherever they are in Rwanda.
          </p>

          <div className="flex gap-3 flex-wrap fu3">
            <button onClick={() => navigate('/apply')}
              className="flex items-center gap-2 px-8 py-4 bg-white text-emerald-900 font-black rounded-full text-sm hover:-translate-y-0.5 transition-all shadow-lg shadow-white/15 uppercase tracking-wide">
              Apply for Access
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
              </svg>
            </button>
            <a href="#how"
              className="flex items-center gap-2 px-8 py-4 bg-white/8 border border-white/15 text-white font-semibold rounded-full text-sm hover:bg-white/14 transition-all">
              See how it works
            </a>
          </div>

          {/* Stats */}
          <div className="flex gap-10 mt-20 pt-10 border-t border-white/10 flex-wrap fu3">
            {[
              { n: '8,551', l: 'TB cases in Rwanda per year' },
              { n: '<30',   l: 'Trained radiologists nationwide' },
              { n: '4s',    l: 'Average AI diagnosis time' },
              { n: '100%',  l: 'Validation accuracy (AUC 1.0)' },
            ].map(s => (
              <div key={s.n}>
                <div className="text-3xl font-black text-white leading-none mb-1">{s.n}</div>
                <div className="text-[11px] text-white/45 font-semibold">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Ticker */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/8 bg-black/10 overflow-hidden h-9 flex items-center">
          <div className="ticker-wrap flex gap-14 whitespace-nowrap px-6">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i} className="text-[9px] font-black uppercase tracking-widest text-white/25">{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="max-w-6xl mx-auto px-6 py-24">
        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-4">Process</p>
        <h2 className="text-4xl font-black text-gray-900 mb-3 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          From application to active<br />in 4 steps.
        </h2>
        <p className="text-sm text-gray-400 mb-16 max-w-md">Most hospitals go live within 5–7 business days after submitting.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map(s => (
            <div key={s.n} className="card-hover bg-white border border-gray-100 rounded-3xl p-7 group">
              <div className="text-5xl font-black text-emerald-100 leading-none mb-3 group-hover:text-emerald-200 transition-colors">
                {s.n}
              </div>
              <div className="text-2xl mb-4">{s.icon}</div>
              <div className="font-bold text-gray-900 text-sm mb-2">{s.title}</div>
              <div className="text-xs text-gray-400 leading-relaxed">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── BENEFITS ── */}
      <section id="benefits" className="py-24" style={{ background: '#0a2415' }}>
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-4">Why Partner With Us</p>
          <h2 className="text-4xl font-black text-white mb-3 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
            Built for Rwanda's<br />healthcare reality.
          </h2>
          <p className="text-sm text-white/35 mb-16 max-w-md">Designed from the ground up for hospitals in resource-constrained settings.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {BENEFITS.map(b => (
              <div key={b.title} className="border border-white/8 rounded-3xl p-7 hover:bg-white/4 transition-colors"
                style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl mb-5"
                  style={{ background: 'rgba(52,211,153,0.1)' }}>
                  {b.icon}
                </div>
                <div className="font-bold text-white text-sm mb-2">{b.title}</div>
                <div className="text-xs text-white/40 leading-relaxed">{b.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-8 float-el">
          <svg className="w-6 h-6 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m2.25-18v18m13.5-18v18m2.25-18v18M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"/>
          </svg>
        </div>
        <h2 className="text-4xl font-black text-gray-900 mb-4 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          Ready to bring AI radiology<br />to your hospital?
        </h2>
        <p className="text-sm text-gray-400 mb-10 max-w-sm mx-auto leading-relaxed">
          Our team reviews every application personally. Most hospitals hear back within 48 hours.
        </p>
        <button onClick={() => navigate('/apply')}
          className="px-10 py-4 bg-emerald-900 text-white font-black rounded-full text-sm hover:-translate-y-0.5 transition-all shadow-lg shadow-emerald-900/20 uppercase tracking-widest">
          Start Your Application →
        </button>
        <p className="text-[10px] text-gray-300 mt-6">
          Questions?{' '}
          <a href="mailto:hospitals@ubuzimaconnect.rw" className="text-emerald-600 font-bold hover:underline">
            hospitals@ubuzimaconnect.rw
          </a>
        </p>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-100 px-6 py-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-emerald-900 rounded-md flex items-center justify-center">
              <div className="w-3 h-[1px] rounded-full bg-emerald-100" />
            </div>
            <span className="text-xs font-black text-gray-900 uppercase tracking-tight">Ubuzima Connect</span>
          </div>
          <p className="text-[10px] text-gray-300 font-medium">© 2026 · AI-powered chest X-ray diagnostics for Rwanda</p>
          <div className="flex items-center gap-6">
            <a href="https://ubuzimaconnect.vercel.app" target="_blank" rel="noreferrer"
              className="text-[10px] font-bold text-gray-400 hover:text-emerald-600 transition-colors uppercase tracking-widest">
              Radiologist Platform ↗
            </a>
            <button onClick={() => navigate('/apply')}
              className="text-[10px] font-bold text-gray-400 hover:text-emerald-600 transition-colors uppercase tracking-widest">
              Apply →
            </button>
            <button onClick={() => navigate('/admin')}
              className="text-[10px] font-bold text-gray-300 hover:text-gray-500 transition-colors uppercase tracking-widest">
              Admin
            </button>
          </div>
        </div>
      </footer>
    </>
  );
}