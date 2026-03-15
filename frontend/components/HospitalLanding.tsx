// frontend/components/HospitalLanding.tsx
// Public landing page at / (replaces or sits alongside existing landing)
// Shows hospital partnership info + links to /hospital/apply

import { useNavigate } from 'react-router-dom';

export default function HospitalLanding() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#f5f0e8] font-sans">

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5 bg-[#f5f0e8]/90 backdrop-blur border-b border-green-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="font-bold text-[#0d3320] text-lg tracking-tight">Ubuzima Connect</span>
        </div>
        <div className="flex items-center gap-8">
          <a href="#how" className="text-sm text-green-800 hover:text-green-600 transition-colors">How it works</a>
          <a href="#benefits" className="text-sm text-green-800 hover:text-green-600 transition-colors">Benefits</a>
          <button
            onClick={() => navigate('/hospital/apply')}
            className="text-sm bg-[#0d3320] text-white px-5 py-2.5 rounded-full font-semibold hover:bg-green-800 transition-colors"
          >
            Apply for Access →
          </button>
          <button
            onClick={() => navigate('/login')}
            className="text-sm text-green-800 hover:text-green-600 transition-colors"
          >
            Radiologist Login
          </button>
          <button
            onClick={() => navigate('/hospital/admin')}
            className="text-sm text-green-500 hover:text-green-400 transition-colors"
          >
            Admin
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex flex-col justify-center px-16 pt-24 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d3320] via-[#1a5c38] to-[#2d8a57]" />
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 40px,#fff 40px,#fff 41px),repeating-linear-gradient(90deg,transparent,transparent 40px,#fff 40px,#fff 41px)'}}
        />
        {/* Gold glow */}
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full"
          style={{background:'radial-gradient(circle, rgba(201,168,76,0.18) 0%, transparent 70%)'}}
        />

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-yellow-300 px-4 py-2 rounded-full text-xs font-semibold tracking-widest uppercase mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse" />
            Now accepting hospital partners across Rwanda
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-6" style={{fontFamily:'Georgia, serif'}}>
            AI Radiology for <em className="text-yellow-300 not-italic">Every</em> Hospital in Rwanda
          </h1>
          <p className="text-lg text-white/80 leading-relaxed mb-10 max-w-xl">
            Ubuzima Connect brings AI-powered chest X-ray diagnosis to your facility.
            Detect TB and pneumonia in seconds — giving your radiologists the support they need.
          </p>
          <div className="flex gap-4 flex-wrap">
            <button
              onClick={() => navigate('/hospital/apply')}
              className="flex items-center gap-2 bg-yellow-500 text-[#0d3320] px-8 py-4 rounded-full font-bold text-base hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-500/30 hover:-translate-y-0.5"
            >
              Apply for Access →
            </button>
            <a href="#how"
              className="flex items-center gap-2 bg-white/10 border border-white/30 text-white px-8 py-4 rounded-full font-medium text-base hover:bg-white/18 transition-all"
            >
              See how it works
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="relative z-10 flex gap-12 mt-16 pt-10 border-t border-white/15 flex-wrap">
          {[
            { num: '8,551', label: 'TB cases in Rwanda per year' },
            { num: '<30',   label: 'Trained radiologists nationwide' },
            { num: '4s',    label: 'Average AI diagnosis time' },
            { num: '100%',  label: 'Validation accuracy (AUC 1.0)' },
          ].map(s => (
            <div key={s.num}>
              <div className="text-3xl font-bold text-white" style={{fontFamily:'Georgia, serif'}}>{s.num}</div>
              <div className="text-sm text-white/55 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="px-16 py-24">
        <div className="text-xs font-bold tracking-widest uppercase text-green-600 mb-4">Process</div>
        <h2 className="text-4xl font-bold text-[#0d3320] mb-4" style={{fontFamily:'Georgia, serif'}}>
          From application to active in 4 steps
        </h2>
        <p className="text-green-800 text-base mb-16 max-w-lg">Most hospitals go live within 5–7 business days after application.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { n:'01', icon:'📋', title:'Submit Application', desc:'Fill in your hospital details, upload your MoH license and logo. Takes under 10 minutes.' },
            { n:'02', icon:'🔍', title:'Application Review', desc:'Our team verifies your credentials. You\'ll receive a confirmation email within 48 hours.' },
            { n:'03', icon:'📹', title:'Google Meet Call', desc:'A 30-minute onboarding call to confirm terms and ensure your team is ready for deployment.' },
            { n:'04', icon:'🚀', title:'Go Live', desc:'Receive admin credentials. Your hospital logo appears on the platform. Your radiologists can register immediately.' },
          ].map(s => (
            <div key={s.n} className="bg-white border border-green-100 rounded-2xl p-8 hover:-translate-y-1 transition-transform hover:shadow-lg">
              <div className="text-5xl font-bold text-green-200 leading-none mb-3" style={{fontFamily:'Georgia, serif'}}>{s.n}</div>
              <div className="text-3xl mb-4">{s.icon}</div>
              <div className="font-bold text-[#0d3320] mb-2">{s.title}</div>
              <div className="text-sm text-green-700 leading-relaxed">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* BENEFITS */}
      <section id="benefits" className="bg-[#0d3320] px-16 py-24">
        <div className="text-xs font-bold tracking-widest uppercase text-yellow-300 mb-4">Why partner with us</div>
        <h2 className="text-4xl font-bold text-white mb-4" style={{fontFamily:'Georgia, serif'}}>
          Built for Rwanda's healthcare reality
        </h2>
        <p className="text-white/60 text-base mb-16 max-w-lg">Designed from the ground up for hospitals in resource-constrained settings.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon:'🧠', title:'AI at Radiologist Level', desc:'ResNet-50 trained on 13,000+ X-rays. Detects TB and pneumonia with 100% validation accuracy and AUC 1.0.' },
            { icon:'🔥', title:'Grad-CAM Visual Explanations', desc:'Every diagnosis shows a heatmap revealing which region of the X-ray drove the AI decision — building clinical trust.' },
            { icon:'🏥', title:'Your Brand, Your System', desc:'Your hospital logo and name appear throughout the platform. Radiologists see your identity, powered by Ubuzima Connect.' },
            { icon:'👥', title:'Full Team Management', desc:'You control radiologist access from your admin dashboard — approve, reject, or revoke at any time.' },
            { icon:'📊', title:'Audit Trails & Compliance', desc:'Every action is logged with timestamps. Full accountability for regulatory compliance and clinical governance.' },
            { icon:'♾️', title:'Continuously Improving', desc:'Upload your X-ray data to retrain the model. The AI improves with data from your own patient population.' },
          ].map(b => (
            <div key={b.title} className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/9 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-yellow-500/15 flex items-center justify-center text-2xl mb-5">{b.icon}</div>
              <div className="font-bold text-white mb-2">{b.title}</div>
              <div className="text-sm text-white/55 leading-relaxed">{b.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-16 py-24 text-center">
        <h2 className="text-4xl font-bold text-[#0d3320] mb-4" style={{fontFamily:'Georgia, serif'}}>
          Ready to bring AI radiology to your hospital?
        </h2>
        <p className="text-green-700 mb-8 max-w-md mx-auto">
          Submit your partnership application today. Our team reviews every application personally.
        </p>
        <button
          onClick={() => navigate('/hospital/apply')}
          className="bg-[#0d3320] text-white px-10 py-4 rounded-full font-bold text-lg hover:bg-green-800 transition-all hover:-translate-y-0.5 shadow-lg"
        >
          Start Your Application →
        </button>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0d3320] px-16 py-12 flex justify-between items-center flex-wrap gap-6">
        <div className="font-bold text-white text-lg" style={{fontFamily:'Georgia, serif'}}>Ubuzima Connect</div>
        <p className="text-white/40 text-sm">AI-powered chest X-ray diagnostics for Rwanda</p>
        <a href="mailto:hello@ubuzimaconnect.rw" className="text-yellow-300 text-sm">hello@ubuzimaconnect.rw</a>
      </footer>
    </div>
  );
}