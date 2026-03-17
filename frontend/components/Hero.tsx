
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface HeroProps {
  onStartClick: () => void;
}

const Hero: React.FC<HeroProps> = ({ onStartClick, isVisible = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!isVisible || hasAnimated.current) return;
    hasAnimated.current = true;

    const tl = gsap.timeline({ delay: 0.3 });
    
    tl.to(".hero-fade", {
      opacity: 1, y: 0, duration: 1, stagger: 0.1, ease: "power4.out"
    });
    
    tl.to(".hero-card-left", {
      opacity: 1,
      x: 0,
      duration: 1.4,
      ease: "power3.out"
    }, "-=0.8");

    tl.to(".hero-card-right", {
      opacity: 1,
      x: 0,
      duration: 1.4,
      ease: "power3.out"
    }, "-=1.4");

    tl.to(".integration-icon", {
      scale: 1,
      opacity: 1,
      stagger: 0.1,
      duration: 0.6,
      ease: "back.out(1.7)"
    }, "-=0.5");
  }, []);

  return (
    <section ref={containerRef} className="relative min-h-screen flex flex-col items-center justify-center pt-20 pb-12 bg-[#fafafa] overflow-hidden">
      {/* Background Dot Grid */}
      <div className="absolute inset-0 medical-grid pointer-events-none"></div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 flex flex-col items-center text-center">
        
        {/* Top Badge (Subtle, no box) */}
        <div className=" hero-fade mt-4 mb-8 flex items-center gap-2">
          
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-500">Welcome To Ubuzima Connect </span>
        </div>

        {/* Headline */}
        <h1 className="hero-fade text-5xl md:text-7xl lg:text-[5.5rem] font-display font-medium tracking-tight text-gray-900 leading-[1.05] mb-8">
          AI-Powered Clinical <br /> 
          <span className="text-gray-900/60">Diagnostics Protocol</span>
        </h1>

        {/* Sub-headline */}
        <p className="hero-fade text-base md:text-lg text-gray-500 max-w-2xl mx-auto font-normal leading-relaxed mb-12">
          Ubuzima Connect revolutionizes clinical workflows with AI insights from trusted locally calibrated sources, empowering smart triage and diagnostic accuracy.
        </p>

        {/* CTAs */}
        <div className="hero-fade flex items-center justify-center gap-8 mb-8">
          <button 
            onClick={onStartClick}
            className="px-8 py-3.5 bg-med-emerald text-white font-medium text-[13px] rounded-full hover:bg-black transition-all shadow-lg flex items-center gap-3 group"
          >
            Start for free <span className="opacity-70 group-hover:translate-x-0.5 transition-transform">→</span>
          </button>
          <button 
            onClick={onStartClick}
            className="text-[13px] font-medium text-gray-700 hover:text-black transition-colors"
          >
            Explore Protocol
          </button>
        </div>

        {/* Integration Bar */}
        <div className="hero-fade flex flex-col items-center gap-6">
          {/* <span className="text-[10px] font-medium uppercase tracking-widest text-gray-400">Integrated with:</span> */}
          <div className="mb-12 flex items-center gap-6">
            <IntegrationIcon icon="https://www.vectorlogo.zone/logos/pytorch/pytorch-icon.svg" />
            <IntegrationIcon icon="https://www.vectorlogo.zone/logos/google_cloud/google_cloud-icon.svg" />
            <IntegrationIcon icon="https://www.vectorlogo.zone/logos/firebase/firebase-icon.svg" />
            <IntegrationIcon icon="https://www.vectorlogo.zone/logos/mongodb/mongodb-icon.svg" />
            
          </div>
        </div>
      </div>

      {/* Floating Cards (Absolute Positioned) */}
      
      {/* Left Card */}
      {/* <div className="hero-card-left absolute left-10 xl:left-32 top-1/2 -translate-y-12 hidden lg:block w-72">
        <div className="p-4 rounded-[2.5rem] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-gray-100 animate-float">
          <div className="rounded-[2rem] overflow-hidden mb-5 aspect-[4/5] bg-gradient-to-b from-gray-100 to-gray-200">
            <img 
              src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&q=80&w=400" 
              className="w-full h-full object-cover grayscale mix-blend-multiply opacity-80" 
              alt="Healthcare Infrastructure" 
            />
          </div>
          <div className="text-[11px] font-semibold text-gray-800 tracking-tight text-center">
            Sovereign Node <span className="text-gray-400 font-normal ml-1">Joined us!</span>
          </div>
        </div>
      </div> */}

      {/* Right Card */}
      {/* <div className="hero-card-right absolute right-10 xl:right-32 top-1/2 -translate-y-24 hidden lg:block w-72">
        <div className="p-4 rounded-[2.5rem] bg-emerald-900/90 shadow-[0_20px_50px_rgba(6,78,59,0.1)] border border-emerald-800/30 animate-float" style={{animationDelay: '1.5s'}}>
          <div className="rounded-[2rem] overflow-hidden mb-5 aspect-[4/5] bg-emerald-800/20 relative">
            <img 
              src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&q=80&w=400" 
              className="w-full h-full object-cover grayscale opacity-40 mix-blend-overlay" 
              alt="Medical Analysis" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-emerald-900 to-transparent opacity-60"></div>
          </div>
          <div className="text-[11px] font-semibold text-emerald-50 tracking-tight text-center">
            Clinical Insights <span className="text-emerald-300/60 font-normal ml-1">Protocol v4</span>
          </div>
        </div>
      </div> */}

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30">
        <div className="w-5 h-8 border-2 border-gray-800 rounded-full flex justify-center pt-2">
          <div className="w-1 h-1 bg-gray-800 rounded-full animate-bounce"></div>
        </div>
        <span className="text-[9px] font-medium uppercase tracking-widest text-gray-800">Scroll Down ↓</span>
      </div>
    </section>
  );
};

const IntegrationIcon = ({ icon }: { icon: string }) => (
  <div className="integration-icon w-12 h-12 glass-card rounded-2xl flex items-center justify-center p-3 shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer">
    <img src={icon} className="w-full h-full object-contain grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all" alt="Integration" />
  </div>
);

export default Hero;
