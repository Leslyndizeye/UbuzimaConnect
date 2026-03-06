
import React, { useEffect, useState } from 'react';

interface IntroSequenceProps {
  onFinish: () => void;
}

const IntroSequence: React.FC<IntroSequenceProps> = ({ onFinish }) => {
  const [phase, setPhase] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  
  const words = ["PRECISION", "DIAGNOSIS", "UBUZIMA CONNECT"];

  useEffect(() => {
    const timer1 = setTimeout(() => setPhase(1), 900);
    const timer2 = setTimeout(() => setPhase(2), 1800);
    const timer3 = setTimeout(() => {
      setIsExiting(true);
    }, 3200);
    const timer4 = setTimeout(() => onFinish(), 4400);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [onFinish]);

  return (
    <div className={`fixed inset-0 z-[1000] bg-white flex items-center justify-center overflow-hidden transition-all duration-[1.5s] ease-in-out ${isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'}`}>
      <div className={`absolute inset-0 bg-med-navy transition-transform duration-[2s] ease-[cubic-bezier(0.85,0,0.15,1)] ${isExiting ? '-translate-y-full' : 'translate-y-0'}`}></div>
      
      <div className="relative z-10 flex flex-col items-center">
        {words.map((word, i) => (
          <div key={i} className="h-16 md:h-24 overflow-hidden">
            <h1 className={`text-4xl md:text-8xl font-display font-bold text-white transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)] flex items-center
              ${phase === i ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}
            `}>
              {word}
              {i === 2 && <span className="ml-4 w-3 h-3 md:w-6 md:h-6 rounded-full bg-med-green"></span>}
            </h1>
          </div>
        ))}
      </div>

      <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-4 transition-all duration-1000 ${isExiting ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
        <div className="w-12 h-[1px] bg-white/20"></div>
        <span className="text-[9px] font-bold text-white/40 tracking-[0.4em] uppercase">Sovereign Medical Network</span>
        <div className="w-12 h-[1px] bg-white/20"></div>
      </div>
    </div>
  );
};

export default IntroSequence;
