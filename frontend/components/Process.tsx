
import React from 'react';

const steps = [
  {
    num: "01",
    title: "Upload & Ingest",
    desc: "A doctor drops a digital chest X-ray into the secure protocol portal."
  },
  {
    num: "02",
    title: "AI Analysis",
    desc: "The ResNet-50 engine scans pixels for patterns of TB and Pneumonia in milliseconds."
  },
  {
    num: "03",
    title: "Clinical Verify",
    desc: "Doctors review Grad-CAM heatmaps and sync results directly to DHIS2."
  }
];

const Process: React.FC = () => {
  return (
    <section id="process" className="py-20 bg-white relative transition-colors duration-500">
      <div className="max-w-6xl mx-auto px-8">
        <div className="text-center mb-16">
          <div className="text-[9px] font-bold text-med-green uppercase tracking-[0.4em] mb-4">The 2026 Workflow</div>
          <h2 className="text-3xl md:text-5xl font-display font-medium tracking-tight text-med-navy">Streamlined Diagnostics.</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-12 lg:gap-16">
          {steps.map((s, i) => (
            <div key={i} className="relative group">
              <div className="text-7xl font-display font-bold text-neutral-100 absolute -top-10 -left-4 select-none group-hover:text-med-green/10 transition-colors">
                {s.num}
              </div>
              <div className="relative z-10 pt-8">
                <h3 className="text-lg font-bold mb-3 text-med-navy tracking-tight uppercase">{s.title}</h3>
                <p className="text-neutral-500 leading-relaxed font-medium text-[13px] md:text-sm">
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Process;
