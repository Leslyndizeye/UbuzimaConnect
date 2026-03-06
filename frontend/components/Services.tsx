
import React from 'react';

const services = [
  {
    title: "Radiology Assist",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <line x1="12" y1="3" x2="12" y2="21"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
      </svg>
    ),
    desc: "Automated analysis of chest imaging, flagging pathologies for immediate clinical prioritization."
  },
  {
    title: "Institutional Sync",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    desc: "Seamlessly integrate diagnostic results with national healthcare records and surveillance systems."
  },
  {
    title: "Clinical Evidence",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="22" y1="12" x2="18" y2="12"/>
        <line x1="6" y1="12" x2="2" y2="12"/>
        <line x1="12" y1="6" x2="12" y2="2"/>
        <line x1="12" y1="22" x2="12" y2="18"/>
      </svg>
    ),
    desc: "Visual evidence layers highlight infection sites, ensuring clinicians make informed decisions."
  },
  {
    title: "Sovereign Training",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
        <path d="M2 12h20"/>
      </svg>
    ),
    desc: "Engines calibrated on regional datasets to eliminate demographic bias and boost accuracy."
  },
  {
    title: "Edge Efficiency",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    ),
    desc: "Ultra-fast inference times deliver diagnostic results in seconds, regardless of network load."
  },
  {
    title: "Privacy Protocol",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    desc: "Advanced encryption ensuring all patient data stays within national sovereign infrastructure."
  }
];

interface ServicesProps {
  onStartClick: () => void;
}

const Services: React.FC<ServicesProps> = ({ onStartClick }) => {
  return (
    <section id="solutions" className="py-32 px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="mb-24 flex flex-col md:flex-row md:items-end justify-between gap-12">
          <div className="max-w-2xl space-y-6">
            <span className="text-[11px] font-bold text-med-emerald uppercase tracking-[0.5em] block">Our Clinical Protocol</span>
            <h2 className="text-5xl md:text-7xl font-display font-medium tracking-tighter text-gray-900 leading-[0.95]">Advanced intelligence for <br /> modern medicine.</h2>
          </div>
          <button 
            onClick={onStartClick}
            className="px-10 py-4 border border-gray-200 text-gray-900 font-bold text-[12px] uppercase tracking-widest rounded-full hover:bg-med-emerald hover:text-white hover:border-med-emerald transition-all"
          >
            Start Free Registration
          </button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-12">
          {services.map((s, i) => (
            <div key={i} className="group p-12 bg-gray-50/50 rounded-[3rem] border border-transparent hover:bg-white hover:border-gray-100 hover:shadow-2xl transition-all duration-700">
              <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-med-emerald mb-10 shadow-sm transition-transform group-hover:scale-110">
                {s.icon}
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4 transition-colors group-hover:text-med-emerald">{s.title}</h3>
              <p className="text-gray-500 text-base leading-relaxed mb-8 font-normal">
                {s.desc}
              </p>
              <div className="w-12 h-px bg-gray-200 group-hover:w-full group-hover:bg-med-emerald transition-all duration-700"></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;
