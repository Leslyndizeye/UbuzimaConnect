// components/AuthPage.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseConfig';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

async function registerWithBackend(token: string, profile: any) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(profile),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Registration failed');
  }
  return res.json();
}

function EyeBtn({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors focus:outline-none">
      {show ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
      )}
    </button>
  );
}

function Field({ label, type = 'text', value, onChange, placeholder, required = true }: any) {
  const [show, setShow] = useState(false);
  const isPw = type === 'password';
  return (
    <div className="space-y-1">
      <label className="block text-xs font-bold uppercase tracking-widest text-gray-400">{label}</label>
      <div className="relative">
        <input
          type={isPw ? (show ? 'text' : 'password') : type}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} required={required}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all pr-10"
        />
        {isPw && <EyeBtn show={show} onToggle={() => setShow(s => !s)} />}
      </div>
    </div>
  );
}

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export default function AuthPage({ onAuth }: { onAuth: (user: any) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetUserName, setResetUserName] = useState('');

  // Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register — NO password fields, admin approves first
  const [fullName, setFullName] = useState('');
  const [hospital, setHospital] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [yearsExp, setYearsExp] = useState('');
  const [regEmail, setRegEmail] = useState('');

  // Forgot
  const [forgotEmail, setForgotEmail] = useState('');

  // Reset (set password from email link)
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');

  // Detect invite / recovery link — show password form immediately
  useEffect(() => {
    const hash = window.location.hash;
    const isPasswordSetup = hash.includes('type=recovery') || hash.includes('type=invite');

    if (isPasswordSetup) {
      setMode('reset');
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // All these events mean "user arrived from email link, needs to set password"
      if (
        event === 'PASSWORD_RECOVERY' ||
        event === 'USER_UPDATED' ||
        (event === 'SIGNED_IN' && isPasswordSetup)
      ) {
        setMode('reset');
        // Fetch their name to personalize the welcome screen
        if (session?.access_token) {
          fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
            .then(r => r.ok ? r.json() : null)
            .then(u => { if (u?.full_name) setResetUserName(u.full_name); })
            .catch(() => {});
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const clear = () => { setError(''); setRegistered(false); setForgotSent(false); };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onAuth(data.user);
    } catch (e: any) { setError(e.message || 'Login failed'); }
    finally { setLoading(false); }
  };

  // Registration: no password — just collect info and save to backend as pending
  // Admin approves → user receives email to set their password
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!licenseNumber.trim()) { setError('License number is required'); return; }
    if (!fullName.trim()) { setError('Full name is required'); return; }
    setLoading(true);
    try {
      // Register in backend only — no Supabase Auth account yet
      // Supabase Auth account is created when admin approves and sends invite email
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebase_uid: `pending_${regEmail.replace('@', '_').replace('.', '_')}_${Date.now()}`,
          email: regEmail,
          full_name: fullName,
          hospital,
          license_number: licenseNumber,
          phone_number: phone,
          specialization,
          years_experience: yearsExp ? parseInt(yearsExp) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Registration failed');
      }
      setRegistered(true);
    } catch (e: any) { setError(e.message || 'Registration failed'); }
    finally { setLoading(false); }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: window.location.origin + window.location.pathname,
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
      setTimeout(() => {
        setMode('login');
        setResetSuccess(false);
        setNewPassword('');
        setConfirmNew('');
        clear();
      }, 3000);
    } catch (e: any) { setError(e.message || 'Failed to set password'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-900 rounded-2xl mb-4 shadow-lg">
            <svg className="w-7 h-7 text-emerald-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Ubuzima Connect</h1>
          <p className="text-sm text-gray-400 mt-1">AI-powered chest X-ray diagnostics</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">

          {/* ── SET PASSWORD (from approval email link) ── */}
          {mode === 'reset' && (
            <div className="p-8">
              {resetSuccess ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-black text-gray-900 mb-2">Password Set!</h3>
                  <p className="text-sm text-gray-400 mb-1">Your account is ready.</p>
                  <p className="text-xs text-gray-400">Redirecting to sign in…</p>
                </div>
              ) : (
                <form onSubmit={handleSetPassword} className="space-y-5">
                  {/* Personalized header */}
                  <div className="text-center pb-2">
                    <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-black text-gray-900">
                      {resetUserName ? `Welcome, ${resetUserName.split(' ')[0]}!` : 'Welcome to Ubuzima Connect!'}
                    </h3>
                    <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">
                      Your account has been approved.<br />
                      Please set a password to access the diagnostic tools.
                    </p>
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-semibold">{error}</div>
                  )}

                  <Field label="Set Your Password" type="password" value={newPassword} onChange={setNewPassword} placeholder="At least 8 characters" />
                  <Field label="Confirm Password" type="password" value={confirmNew} onChange={setConfirmNew} placeholder="Re-enter your password" />

                  <button type="submit" disabled={loading}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 text-sm">
                    {loading ? 'Setting password…' : 'Set Password & Continue'}
                  </button>

                  <p className="text-[10px] text-center text-gray-400">
                    You only need to do this once. Use this password to sign in from now on.
                  </p>
                </form>
              )}
            </div>
          )}

          {/* ── REGISTRATION SUCCESS ── */}
          {registered && mode !== 'reset' && (
            <div className="p-10 text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-black text-gray-900 mb-3">Application Submitted!</h2>
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 mb-6 text-left space-y-2">
                <p className="text-sm font-bold text-emerald-800">What happens next:</p>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  1. An administrator reviews your credentials<br />
                  2. Once approved, you'll receive an email from Ubuzima Connect<br />
                  3. Click the link in that email to set your password<br />
                  4. You can then sign in and start diagnosing
                </p>
              </div>
              <p className="text-gray-400 text-xs mb-6">
                <strong className="text-gray-600">This usually takes less than 24 hours.</strong><br />
                Check your spam folder if you don't see the email.
              </p>
              <button onClick={() => { setRegistered(false); setMode('login'); clear(); }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm">
                Back to Sign In
              </button>
            </div>
          )}

          {/* ── FORGOT SENT ── */}
          {forgotSent && !registered && mode !== 'reset' && (
            <div className="p-10 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-black text-gray-900 mb-2">Check Your Email</h2>
              <p className="text-gray-500 text-sm mb-2">Password reset link sent to <strong className="text-gray-800">{forgotEmail}</strong>.</p>
              <p className="text-gray-400 text-xs mb-8 leading-relaxed">
                Click the link in the email to set a new password.<br />
                Check your spam folder if you don't see it.
              </p>
              <button onClick={() => { setForgotSent(false); setMode('login'); clear(); }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm">
                Back to Sign In
              </button>
            </div>
          )}

          {/* ── MAIN FORMS ── */}
          {!registered && !forgotSent && mode !== 'reset' && (
            <>
              {mode !== 'forgot' && (
                <div className="flex border-b border-gray-100">
                  {(['login', 'register'] as const).map(m => (
                    <button key={m} onClick={() => { setMode(m); clear(); }}
                      className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all ${mode === m ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/50' : 'text-gray-400 hover:text-gray-600'}`}>
                      {m === 'login' ? 'Sign In' : 'Request Access'}
                    </button>
                  ))}
                </div>
              )}

              <div className="p-8">
                {error && (
                  <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-semibold">{error}</div>
                )}

                {/* LOGIN */}
                {mode === 'login' && (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="doctor@hospital.rw" />
                    <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
                    <button type="submit" disabled={loading}
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 text-sm">
                      {loading ? 'Signing in…' : 'Sign In'}
                    </button>
                    <button type="button" onClick={() => { setMode('forgot'); clear(); }}
                      className="w-full text-center text-xs text-gray-400 hover:text-emerald-600 transition-colors mt-1">
                      Forgot password?
                    </button>
                  </form>
                )}

                {/* REGISTER — no password, just details */}
                {mode === 'register' && (
                  <form onSubmit={handleRegister} className="space-y-3">
                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-xs leading-relaxed mb-2">
                      <strong>How it works:</strong> Submit your details below. Once an administrator approves your application, you'll receive an email with a link to set your password and access the system.
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Field label="Full Name" value={fullName} onChange={setFullName} placeholder="Dr. Jean Uwimana" />
                      </div>
                      <Field label="Email" type="email" value={regEmail} onChange={setRegEmail} placeholder="doctor@hospital.rw" />
                      <Field label="Hospital / Clinic" value={hospital} onChange={setHospital} placeholder="CHUK" />
                      <Field label="License Number" value={licenseNumber} onChange={setLicenseNumber} placeholder="MC/2026/001" />
                      <Field label="Phone" type="tel" value={phone} onChange={setPhone} placeholder="+250 7XX XXX XXX" required={false} />
                      <Field label="Specialization" value={specialization} onChange={setSpecialization} placeholder="Radiology" required={false} />
                      <Field label="Years Experience" type="number" value={yearsExp} onChange={setYearsExp} placeholder="5" required={false} />
                    </div>
                    <button type="submit" disabled={loading}
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 text-sm mt-2">
                      {loading ? 'Submitting…' : 'Submit Application'}
                    </button>
                    <p className="text-[10px] text-center text-gray-400">
                      No password needed now — you'll set it after approval.
                    </p>
                  </form>
                )}

                {/* FORGOT PASSWORD */}
                {mode === 'forgot' && (
                  <form onSubmit={handleForgot} className="space-y-4">
                    <div className="mb-2">
                      <h3 className="text-lg font-black text-gray-900">Reset Password</h3>
                      <p className="text-xs text-gray-400 mt-1">Enter your email and we'll send a reset link.</p>
                    </div>
                    <Field label="Email" type="email" value={forgotEmail} onChange={setForgotEmail} placeholder="doctor@hospital.rw" />
                    <button type="submit" disabled={loading}
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 text-sm">
                      {loading ? 'Sending…' : 'Send Reset Link'}
                    </button>
                    <button type="button" onClick={() => { setMode('login'); clear(); }}
                      className="w-full text-center text-xs text-gray-400 hover:text-emerald-600 transition-colors">
                      ← Back to Sign In
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}