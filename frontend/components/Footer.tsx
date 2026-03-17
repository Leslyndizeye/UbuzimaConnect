
import React, { useState } from 'react';

interface FooterProps {
  onEmailSubmit: (email: string) => void;
}

const Footer: React.FC<FooterProps> = ({ onEmailSubmit }) => {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onEmailSubmit(email);
  };

  return (
    <footer className="py-32 px-8 bg-white border-t border-gray-100 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-20 mb-32">
          <div className="lg:col-span-5 space-y-12">
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 rounded-xl bg-med-emerald flex items-center justify-center">
                <div className="w-5 h-1 bg-white rounded-full"></div>
              </div>
              <span className="text-xl font-display font-bold tracking-tight text-gray-900 uppercase">Ubuzima Connect</span>
            </div>
            <p className="text-gray-500 text-lg leading-relaxed max-w-sm">
              Sovereign Clinical Intelligence built for the future of national healthcare. Empowering clinicians with validated AI protocols.
            </p>
          </div>

          <div className="lg:col-span-3 space-y-10">
            <h4 className="text-[11px] font-bold text-gray-900 uppercase tracking-[0.5em]">Protocol</h4>
            <ul className="space-y-6 text-[13px] font-bold text-gray-400 uppercase tracking-widest">
              <li><a href="#" className="hover:text-med-emerald transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-med-emerald transition-colors">Ethics Board</a></li>
              <li><a href="#" className="hover:text-med-emerald transition-colors">Clinical Nodes</a></li>
            </ul>
          </div>

          <div className="lg:col-span-4 space-y-10">
            <h4 className="text-[11px] font-bold text-gray-900 uppercase tracking-[0.5em]">Join the network</h4>
            <form onSubmit={handleSubmit} className="relative group">
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Institutional email..." 
                className="w-full bg-gray-50 border border-gray-100 rounded-[2rem] py-6 px-10 text-sm outline-none focus:border-med-emerald focus:bg-white focus:shadow-2xl transition-all"
              />
              <button 
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-14 h-14 bg-med-emerald rounded-full flex items-center justify-center text-white hover:bg-black transition-all"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            </form>
            <p className="text-[10px] text-gray-300 font-bold uppercase tracking-[0.3em]">
              * Clinical registration is restricted to verified healthcare staff.
            </p>
          </div>
        </div>

        <div className="pt-12 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-10 text-[11px] font-bold text-gray-400 uppercase tracking-[0.5em]">
          <div>© 2026 Ubuzima Connect .</div>
          <div className="flex items-center gap-12">
            <a href="#" className="hover:text-med-emerald transition-colors">Privacy</a>
            <a href="#" className="hover:text-med-emerald transition-colors">Ethics</a>
            <a href="#" className="hover:text-med-emerald transition-colors">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
