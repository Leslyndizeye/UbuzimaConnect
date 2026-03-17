
import React from 'react';

interface FeaturesProps {
  onStartClick: () => void;
}

const Features: React.FC<FeaturesProps> = ({ onStartClick }) => {
  return (
    <section id="why-choose-us" className="py-32 px-8 bg-white border-y border-gray-100">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-24 items-center">
          <div className="space-y-12">
            <div className="space-y-8">
              <span className="text-[11px] font-bold text-med-emerald uppercase tracking-[0.5em] block">Why Ubuzima Connect</span>
              <h2 className="text-5xl md:text-7xl font-display font-medium tracking-tighter text-gray-900 leading-[0.95]">
                Precision that <br /> <span className="text-gray-900/40 italic">amplifies experts.</span>
              </h2>
              <p className="text-xl text-gray-500 leading-relaxed max-w-lg">
                We've built a protocol that doesn't replace specialists, but provides the high-fidelity intelligence needed to scale their reach.
              </p>
            </div>

            <div className="grid gap-10">
              <FeatureItem 
                title="Sovereign Hub"
                desc="Designed specifically for the infrastructure of the national healthcare referral system."
              />
              <FeatureItem 
                title="Verified Ethics"
                desc="Validated clinical and security protocols that exceed national data protection standards."
              />
              <FeatureItem 
                title="Explainable UI"
                desc="AI insights are backed by visual heatmaps for total clinician confidence."
              />
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-10 bg-med-emerald/5 blur-[120px] rounded-full pointer-events-none"></div>
            <div className="relative bg-white p-14 rounded-[4rem] shadow-2xl space-y-12 border border-gray-50">
              <div className="space-y-6">
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 rounded-full bg-med-emerald flex items-center justify-center text-white">
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <h3 className="text-3xl font-bold text-gray-900">National Hub</h3>
                </div>
                <p className="text-gray-500 text-lg leading-relaxed font-normal">
                  Natively synchronized with national epidemiological systems for real-time surveillance across every district.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-10">
                <div className="bg-gray-50 p-8 rounded-[2.5rem] border border-gray-100">
                  <div className="text-5xl font-display font-bold text-med-emerald">98.2%</div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">Hub Accuracy</div>
                </div>
                <div className="bg-gray-50 p-8 rounded-[2.5rem] border border-gray-100">
                  <div className="text-5xl font-display font-bold text-med-emerald">0.4s</div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">Inference Speed</div>
                </div>
              </div>

              <button 
                onClick={onStartClick}
                className="w-full py-6 bg-med-emerald text-white font-bold uppercase tracking-widest text-[12px] rounded-3xl shadow-2xl shadow-med-emerald/20 hover:bg-black transition-all flex items-center justify-center gap-4"
              >
                Join the network
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14m-7-7l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const FeatureItem = ({ title, desc }: { title: string, desc: string }) => (
  <div className="flex gap-8 group">
    <div className="mt-2 w-3 h-3 rounded-full bg-med-emerald shrink-0 shadow-lg shadow-med-emerald/40 transition-transform group-hover:scale-125"></div>
    <div>
      <h4 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-med-emerald transition-colors">{title}</h4>
      <p className="text-base text-gray-500 leading-relaxed font-normal">{desc}</p>
    </div>
  </div>
);

export default Features;
