// components/AuthPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';
import { supabase } from './supabaseConfig';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

type Mode = 'login' | 'register' | 'forgot' | 'reset';
type Language = 'En' | 'Fr';

const T = {
  En: {
    brand: 'Ubuzima Connect',
    loginTitle: 'Clinical Sign In',
    loginDesc: 'Access the sovereign diagnostic network.',
    registerTitle: 'Request Access',
    registerDesc: 'Join Rwanda\'s clinical AI infrastructure.',
    forgotTitle: 'Reset Access',
    forgotDesc: 'We\'ll send a link to your institutional email.',
    resetTitle: 'Set Your Password',
    resetDesc: 'Your account has been approved. Choose a strong password.',
    signIn: 'Sign In',
    submitApp: 'Submit Application',
    sendReset: 'Send Reset Link',
    setPassword: 'Set Password & Continue',
    signingIn: 'Signing in…',
    submitting: 'Submitting…',
    sending: 'Sending…',
    setting: 'Setting password…',
    forgotLink: 'Reset password?',
    backToLogin: '← Back to Sign In',
    switchToRegister: 'New here? Request Access',
    switchToLogin: 'Already a member? Sign In',
    howItWorks: 'How it works:',
    howItWorksDesc: 'Submit your details. Once an admin approves you, you\'ll receive an email to set your password.',
    noPasswordNote: 'No password needed now — you\'ll set it after approval.',
    insightTitle: 'Clinical Sovereignty',
    insightDesc: 'High-precision diagnostic protocol calibrated for Rwanda\'s infrastructure. Free for all verified clinicians in 2026.',
    rights: '© 2026 Ubuzima Connect',
  },
  Fr: {
    brand: 'Ubuzima Connect',
    loginTitle: 'Connexion Clinique',
    loginDesc: 'Accédez au réseau de diagnostic souverain.',
    registerTitle: 'Demander l\'Accès',
    registerDesc: 'Rejoignez l\'infrastructure IA clinique du Rwanda.',
    forgotTitle: 'Réinitialiser',
    forgotDesc: 'Un lien sera envoyé à votre email institutionnel.',
    resetTitle: 'Définir votre Mot de Passe',
    resetDesc: 'Votre compte a été approuvé. Choisissez un mot de passe.',
    signIn: 'Connexion',
    submitApp: 'Soumettre la Demande',
    sendReset: 'Envoyer le Lien',
    setPassword: 'Définir le Mot de Passe',
    signingIn: 'Connexion…',
    submitting: 'Envoi…',
    sending: 'Envoi…',
    setting: 'Enregistrement…',
    forgotLink: 'Réinitialiser?',
    backToLogin: '← Retour à la connexion',
    switchToRegister: 'Nouveau? Rejoindre',
    switchToLogin: 'Déjà membre? Connexion',
    howItWorks: 'Comment ça marche:',
    howItWorksDesc: 'Soumettez vos détails. Une fois approuvé par l\'admin, vous recevrez un email pour définir votre mot de passe.',
    noPasswordNote: 'Pas de mot de passe maintenant — vous le définirez après approbation.',
    insightTitle: 'Souveraineté Clinique',
    insightDesc: 'Protocole de diagnostic calibré pour le Rwanda. Gratuit pour les cliniciens vérifiés en 2026.',
    rights: '© 2026 Ubuzima Connect | Médical Souverain',
  }
};

function InputField({ label, type = 'text', value, onChange, placeholder, required = true }: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPw = type === 'password';
  return (
    <div className="space-y-1 auth-fade">
      <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-0.5">{label}</label>
      <div className="relative">
        <input
          type={isPw ? (show ? 'text' : 'password') : type}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} required={required}
          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-gray-900 text-xs font-medium outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 transition-all placeholder:text-gray-300 pr-10"
        />
        {isPw && (
          <button type="button" onClick={() => setShow(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-600 transition-colors focus:outline-none">
            {show ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AuthPage({ onAuth }: { onAuth: (user: any) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [lang, setLang] = useState<Language>('En');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetUserName, setResetUserName] = useState('');

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [hospitalId, setHospitalId] = useState<number | ''>('');
  const [hospitals, setHospitals] = useState<{ id: number; name: string; district: string; province: string }[]>([]);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [yearsExp, setYearsExp] = useState('');

  // Forgot
  const [forgotEmail, setForgotEmail] = useState('');

  // Reset password
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');

  const t = T[lang];

  // Fetch approved hospitals for registration dropdown
  useEffect(() => {
    if (mode === 'register' && hospitals.length === 0) {
      fetch(`${API_BASE}/hospitals/public`)
        .then(r => r.ok ? r.json() : [])
        .then(setHospitals)
        .catch(() => {});
    }
  }, [mode]);

  const clear = useCallback(() => { setError(''); setRegistered(false); setForgotSent(false); }, []);
  const switchMode = useCallback((m: Mode) => { clear(); setMode(m); }, [clear]);

  // GSAP animations on mode change
  useEffect(() => {
    gsap.fromTo('.auth-form-container',
      { opacity: 0 },
      { opacity: 1, duration: 0.35, ease: 'power2.out', clearProps: 'opacity' }
    );
    gsap.fromTo('.auth-fade',
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, stagger: 0.04, duration: 0.4, ease: 'power2.out', clearProps: 'transform,opacity' }
    );
  }, [mode, registered, forgotSent]);

  // Detect recovery/invite link
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery') || hash.includes('type=invite')) setMode('reset');
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED' ||
        (event === 'SIGNED_IN' && (hash.includes('type=recovery') || hash.includes('type=invite')))) {
        setMode('reset');
        if (session?.access_token) {
          fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${session.access_token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(u => { if (u?.full_name) setResetUserName(u.full_name); })
            .catch(() => {});
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onAuth(data.user);
    } catch (e: any) { setError(e.message || 'Login failed'); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!fullName.trim()) { setError('Full name is required'); return; }
    if (!licenseNumber.trim()) { setError('License number is required'); return; }
    setLoading(true);
    try {
      if (!hospitalId) { setError('Please select your hospital'); setLoading(false); return; }
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebase_uid: `pending_${regEmail.replace('@', '_').replace('.', '_')}_${Date.now()}`,
          email: regEmail, full_name: fullName,
          hospital_id: hospitalId,
          license_number: licenseNumber, phone_number: phone,
          specialization, years_experience: yearsExp ? parseInt(yearsExp) : null,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Registration failed'); }
      setRegistered(true);
    } catch (e: any) { setError(e.message || 'Registration failed'); }
    finally { setLoading(false); }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (e: any) { setError(e.message || 'Failed to send reset email'); }
    finally { setLoading(false); }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (newPassword !== confirmNew) { setError('Passwords do not match'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setResetSuccess(true);
      window.history.replaceState(null, '', window.location.pathname);
      setTimeout(() => { switchMode('login'); setResetSuccess(false); setNewPassword(''); setConfirmNew(''); }, 3000);
    } catch (e: any) { setError(e.message || 'Failed to set password'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen w-full bg-white flex flex-col lg:flex-row overflow-hidden" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── LEFT: Form Panel ── */}
      <div className="w-full lg:w-[45%] p-5 md:p-8 flex flex-col justify-between z-10 bg-white border-r border-gray-50 min-h-screen">

        {/* Header */}
        <header className="flex justify-between items-center auth-fade">
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => window.location.href = '/'}>
            <div className="w-7 h-7 bg-emerald-900 rounded-md flex items-center justify-center relative overflow-hidden transition-transform group-hover:scale-105">
              <div className="w-4 h-[1.5px] bg-emerald-100 rounded-full"></div>
            </div>
            <span className="text-[13px] font-bold text-gray-900 uppercase tracking-tight">{t.brand}</span>
          </div>
          <div className="flex items-center gap-0.5 bg-gray-50 p-1 rounded-lg">
            {(['En', 'Fr'] as Language[]).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-2.5 py-1.5 text-[9px] font-bold rounded-md transition-all ${lang === l ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </header>

        {/* Form body */}
        <div className="max-w-[340px] mx-auto w-full py-6 auth-form-container">

          {/* Title */}
          {!registered && !forgotSent && (
            <div className="mb-6 auth-fade">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1.5 tracking-tight">
                {mode === 'login' ? t.loginTitle : mode === 'register' ? t.registerTitle : mode === 'forgot' ? t.forgotTitle : t.resetTitle}
              </h1>
              <p className="text-gray-400 text-[9px] font-bold uppercase tracking-[0.15em]">
                {mode === 'login' ? t.loginDesc : mode === 'register' ? t.registerDesc : mode === 'forgot' ? t.forgotDesc : t.resetDesc}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-xl mb-4 text-[9px] font-bold uppercase tracking-widest border auth-fade flex items-center gap-3 bg-red-50 text-red-600 border-red-100">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-red-100 text-xs font-black">!</div>
              <span className="flex-1 leading-relaxed normal-case">{error}</span>
              <button type="button" onClick={() => setError('')} className="shrink-0 text-red-400 hover:text-red-600">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          )}

          {/* ── RESET PASSWORD ── */}
          {mode === 'reset' && (
            resetSuccess ? (
              <div className="text-center py-8 auth-fade">
                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Password Set!</h3>
                <p className="text-xs text-gray-400">Redirecting to sign in…</p>
              </div>
            ) : (
              <form onSubmit={handleSetPassword} className="space-y-4">
                {resetUserName && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-semibold auth-fade">
                    Welcome, {resetUserName.split(' ')[0]}! Your account has been approved.
                  </div>
                )}
                <InputField label="New Password" type="password" value={newPassword} onChange={setNewPassword} placeholder="At least 8 characters" />
                <InputField label="Confirm Password" type="password" value={confirmNew} onChange={setConfirmNew} placeholder="Re-enter password" />
                <button type="submit" disabled={loading}
                  className="w-full py-3 bg-gray-900 text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl hover:bg-black transition-all disabled:opacity-60 auth-fade flex items-center justify-center gap-2">
                  {loading ? <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : t.setPassword}
                </button>
              </form>
            )
          )}

          {/* ── REGISTERED SUCCESS ── */}
          {registered && mode !== 'reset' && (
            <div className="text-center py-6 auth-fade">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Application Submitted!</h2>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 mb-4 text-left">
                <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest mb-1">What happens next:</p>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  1. Admin reviews your credentials<br />
                  2. Once approved, you'll receive an email<br />
                  3. Click the link to set your password<br />
                  4. Sign in and start diagnosing
                </p>
              </div>
              <p className="text-[10px] text-gray-400 mb-4">Usually takes less than 24 hours.</p>
              <button onClick={() => { setRegistered(false); switchMode('login'); }}
                className="w-full py-3 bg-gray-900 text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl hover:bg-black transition-all">
                {t.switchToLogin}
              </button>
            </div>
          )}

          {/* ── FORGOT SENT ── */}
          {forgotSent && !registered && mode !== 'reset' && (
            <div className="text-center py-6 auth-fade">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Check Your Email</h2>
              <p className="text-xs text-gray-500 mb-1">Reset link sent to <strong>{forgotEmail}</strong></p>
              <p className="text-[10px] text-gray-400 mb-6">Check your spam folder if you don't see it.</p>
              <button onClick={() => { setForgotSent(false); switchMode('login'); }}
                className="w-full py-3 bg-gray-900 text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl hover:bg-black transition-all">
                {t.backToLogin}
              </button>
            </div>
          )}

          {/* ── MAIN FORMS ── */}
          {!registered && !forgotSent && mode !== 'reset' && (
            <div className="space-y-4">

              {/* LOGIN */}
              {mode === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <InputField label="Work Email" type="email" value={email} onChange={setEmail} placeholder="clinical@institutional.rw" />
                  <InputField label="Password" type="password" value={password} onChange={setPassword} placeholder="Enter password" />
                  <div className="flex justify-end auth-fade">
                    <button type="button" onClick={() => switchMode('forgot')}
                      className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-widest">{t.forgotLink}</button>
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full py-3 bg-gray-900 text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl hover:bg-black transition-all shadow-lg shadow-gray-200 auth-fade flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60">
                    {loading ? <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : t.signIn}
                  </button>
                  <div className="text-center pt-4 auth-fade">
                    <button type="button" onClick={() => switchMode('register')}
                      className="text-[10px] font-bold text-gray-300 hover:text-gray-900 transition-all uppercase tracking-[0.2em] underline underline-offset-4 decoration-gray-100">
                      {t.switchToRegister}
                    </button>
                  </div>
                </form>
              )}

              {/* REGISTER */}
              {mode === 'register' && (
                <form onSubmit={handleRegister} className="space-y-3">
                  <div className="p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-100 auth-fade">
                    <p className="text-[9px] font-bold text-emerald-800 uppercase tracking-widest mb-0.5">{t.howItWorks}</p>
                    <p className="text-[9px] text-emerald-700 leading-relaxed">{t.howItWorksDesc}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <InputField label="Full Name" value={fullName} onChange={setFullName} placeholder="Dr. Jean Uwimana" />
                    </div>
                    <InputField label="Work Email" type="email" value={regEmail} onChange={setRegEmail} placeholder="doctor@hospital.rw" />
                    <div className="space-y-1 auth-fade">
                      <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-0.5">Hospital / Clinic</label>
                      <select
                        value={hospitalId}
                        onChange={e => setHospitalId(e.target.value ? Number(e.target.value) : '')}
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-gray-900 text-xs font-medium outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 transition-all"
                      >
                        <option value="">Select your hospital…</option>
                        {hospitals.map(h => (
                          <option key={h.id} value={h.id}>{h.name} — {h.district}</option>
                        ))}
                      </select>
                    </div>
                    <InputField label="RBC License ID" value={licenseNumber} onChange={setLicenseNumber} placeholder="4356-6487" />
                    <InputField label="Phone" type="tel" value={phone} onChange={setPhone} placeholder="+250 7XX XXX XXX" required={false} />
                    <InputField label="Specialization" value={specialization} onChange={setSpecialization} placeholder="Radiology" required={false} />
                    <InputField label="Years Experience" type="number" value={yearsExp} onChange={setYearsExp} placeholder="5" required={false} />
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full py-3 bg-gray-900 text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl hover:bg-black transition-all shadow-lg shadow-gray-200 auth-fade mt-2 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60">
                    {loading ? <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : t.submitApp}
                  </button>
                  <p className="text-[9px] text-center text-gray-300 uppercase tracking-widest auth-fade">{t.noPasswordNote}</p>
                  <div className="text-center pt-2 auth-fade">
                    <button type="button" onClick={() => switchMode('login')}
                      className="text-[10px] font-bold text-gray-300 hover:text-gray-900 transition-all uppercase tracking-[0.2em] underline underline-offset-4 decoration-gray-100">
                      {t.switchToLogin}
                    </button>
                  </div>
                </form>
              )}

              {/* FORGOT */}
              {mode === 'forgot' && (
                <form onSubmit={handleForgot} className="space-y-4">
                  <InputField label="Work Email" type="email" value={forgotEmail} onChange={setForgotEmail} placeholder="clinical@institutional.rw" />
                  <button type="submit" disabled={loading}
                    className="w-full py-3 bg-gray-900 text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl hover:bg-black transition-all auth-fade flex items-center justify-center gap-2 disabled:opacity-60">
                    {loading ? <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : t.sendReset}
                  </button>
                  <button type="button" onClick={() => switchMode('login')}
                    className="w-full text-[10px] font-bold text-gray-300 hover:text-gray-900 transition-all uppercase tracking-[0.2em] auth-fade">
                    {t.backToLogin}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        <footer className="text-[8px] font-bold text-gray-300 uppercase tracking-[0.4em] auth-fade text-center lg:text-left">
          {t.rights}
        </footer>
      </div>

      {/* ── RIGHT: Visual Panel ── */}
      <div className="hidden lg:flex w-[55%] relative p-8 bg-gray-50 items-center justify-center overflow-hidden">
        <div className="w-full h-full rounded-[3rem] overflow-hidden relative shadow-xl border border-white bg-white">
          <img
            src="https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&q=80&w=2000"
            className="w-full h-full object-cover grayscale opacity-[0.08]"
            alt="Clinical Background"
            crossOrigin="anonymous"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-8 shadow-inner border border-emerald-100">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 tracking-tighter leading-tight uppercase">
              {t.insightTitle}
            </h2>
            <p className="text-gray-400 text-sm leading-relaxed font-normal max-w-sm mx-auto">
              {t.insightDesc}
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}