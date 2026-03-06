
import React, { useState, useEffect } from 'react';

interface NavbarProps {
  onAuthClick: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onAuthClick }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 py-6 px-12 flex items-center justify-between ${scrolled ? 'bg-white/80 backdrop-blur-md shadow-sm' : 'bg-transparent'}`}>
      <div 
        className="flex items-center gap-3 cursor-pointer group" 
        onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}
      >
        <div className="w-7 h-7 bg-emerald-900 rounded-md flex items-center justify-center relative overflow-hidden transition-transform group-hover:scale-105">
           <div className="w-4 h-[1.5px] bg-emerald-100 rounded-full"></div>
        </div>
        <span className="text-[13px] font-display font-bold tracking-tight text-gray-900 uppercase">Ubuzima Connect</span>
      </div>

      <div className="hidden lg:flex items-center gap-10 text-[11px] font-medium text-gray-500 uppercase tracking-widest">
        <a href="#solutions" onClick={(e) => handleLinkClick(e, 'solutions')} className="hover:text-black transition-colors">Solutions</a>
        <a href="#why-choose-us" onClick={(e) => handleLinkClick(e, 'why-choose-us')} className="hover:text-black transition-colors">Why Choose us</a>
        <a href="#process" onClick={(e) => handleLinkClick(e, 'process')} className="hover:text-black transition-colors">Process</a>
        <a href="#faq" onClick={(e) => handleLinkClick(e, 'Ethics')} className="hover:text-black transition-colors">Ethics</a>
        <a href="#faq" className="hover:text-black transition-colors">About Us</a>
      </div>

      <button 
        onClick={onAuthClick}
        className="px-6 py-2.5 bg-med-emerald text-white text-[11px] font-medium rounded-full hover:bg-black transition-all shadow-md group"
      >
        Start for free <span className="ml-1 opacity-70 group-hover:translate-x-0.5 transition-transform">→</span>
      </button>
    </nav>
  );
};

export default Navbar;
