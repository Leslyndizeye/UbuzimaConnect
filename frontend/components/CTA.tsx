
import React from 'react';

interface CTAProps {
  onStartClick: () => void;
}

const CTA: React.FC<CTAProps> = ({ onStartClick }) => {
  return (
    <section className="py-32 px-8 bg-white relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 medical-grid opacity-20 pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-med-emerald/5 blur-[150px] rounded-full pointer-events-none"></div>
      
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <div className="inline-block mb-12">
          <div className="flex items-center gap-4 text-med-emerald">
            <div className="w-12 h-px bg-med-emerald/20"></div>
            <span className="text-[11px] font-bold uppercase tracking-[0.5em]">2026 Surveillance Roadmap</span>
            <div className="w-12 h-px bg-med-emerald/20"></div>
          </div>
        </div>
        
        <h2 className="text-5xl md:text-8xl font-display font-medium tracking-tighter text-gray-900 mb-10 leading-[0.95]">
          A new era for <br />
          <span className="text-med-emerald italic">clinical nodes.</span>
        </h2>
        
        <p className="text-lg md:text-xl text-gray-500 mb-12 max-w-xl mx-auto leading-relaxed">
          The sovereign protocol for the future of Rwandan diagnostics. Registration is currently free for all verified institutions.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <button 
            onClick={onStartClick}
            className="px-12 py-5 bg-med-emerald text-white font-bold uppercase tracking-widest text-[11px] rounded-full hover:bg-black hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-med-emerald/20"
          >
            Create Free Account
          </button>
          <div className="text-left hidden md:block border-l border-gray-100 pl-8">
            <div className="text-gray-900 font-bold text-[11px] tracking-tight uppercase">National Deployment </div>
            <div className="text-gray-400 text-[9px] font-medium uppercase tracking-widest mt-1">Live in 30 Districts</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
