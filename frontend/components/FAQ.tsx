
import React from 'react';

const compliances = [
  {
    title: "Data Sovereignty",
    desc: "Fully compliant with Law No. 058/2021. All clinical imagery remains within the national sovereign server infrastructure."
  },
  {
    title: "Clinical Triage Protocol",
    desc: "Designed for immediate prioritization. AI acts as a high-speed assistant, flagging critical cases for expert radiologist validation."
  },
  {
    title: "Equipment Integration",
    desc: "Hardware-agnostic protocol. Optimized for digital imaging output across all primary and secondary healthcare tiers."
  },
  {
    title: "Regional Calibration",
    desc: "System nodes are specifically tuned to the local clinical environment to eliminate demographic distribution bias."
  }
];

const FAQ: React.FC = () => {
  return (
    <section id="faq" className="py-20 px-8 bg-white border-t border-black/5 transition-colors duration-500">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-[9px] font-bold text-med-green uppercase tracking-[0.4em] mb-4">Regulatory Framework</div>
          <h2 className="text-3xl md:text-5xl font-display font-medium text-med-navy tracking-tight">System Compliance</h2>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
          {compliances.map((c, i) => (
            <div key={i} className="p-8 rounded-[2rem] bg-med-slate border border-black/5 hover:border-med-green/30 transition-all duration-500 group">
              <h3 className="text-base font-bold mb-3 text-med-navy group-hover:text-med-green transition-colors uppercase tracking-tight">
                {c.title}
              </h3>
              <p className="text-neutral-500 text-xs md:text-sm leading-relaxed font-medium">
                {c.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
