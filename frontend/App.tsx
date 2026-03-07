import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Services from './components/Services';
import Features from './components/Features';
import Process from './components/Process';
import CTA from './components/CTA';
import FAQ from './components/FAQ';
import Footer from './components/Footer';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import { supabase } from './components/supabaseConfig';

// Admin check uses is_admin from database only
const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

type AppState = 'loading' | 'landing' | 'auth' | 'pending' | 'approved' | 'admin' | 'reset-password';

const Spinner = () => (
  <div className="min-h-screen bg-white flex items-center justify-center">
    <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
  </div>
);

function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  // Wait for Supabase to process the recovery token from the URL
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true);
      }
    });
    // Also check if session already exists (token already processed)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setMsg('Passwords do not match'); return; }
    if (password.length < 6) { setMsg('Password must be at least 6 characters'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setMsg(error.message); setLoading(false); return; }
    setMsg('✅ Password updated successfully!');
    setTimeout(async () => {
      await supabase.auth.signOut();
      window.location.href = '/';
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-900 rounded-2xl mb-3">
            <svg className="w-6 h-6 text-emerald-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-gray-900">Set New Password</h2>
          <p className="text-xs text-gray-400 mt-1">Choose a strong password for your account</p>
        </div>

        {!ready && (
          <div className="flex flex-col items-center py-6 space-y-3">
            <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-xs text-gray-400">Verifying reset link…</p>
          </div>
        )}

        {ready && (
          <>
            {msg && (
              <div className={`mb-4 p-3 rounded-xl text-xs font-semibold ${msg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                {msg}
              </div>
            )}
            {!msg.startsWith('✅') && (
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">New Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 text-sm">
                  {loading ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PendingPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-12 max-w-md text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-black text-gray-900 mb-2">Application Submitted</h2>
        <p className="text-gray-500 text-sm mb-2">Your registration has been received and is under review.</p>
        <p className="text-gray-400 text-xs mb-8 leading-relaxed">
          You will be able to access the diagnostic tools once an administrator approves your account.<br />
          <span className="font-semibold text-gray-500">This usually takes less than 24 hours.</span>
        </p>
        <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/'; }}
          className="text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors">
          Sign Out
        </button>
      </div>
    </div>
  );
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('loading');

  const resolveState = async (user: any, event?: string) => {
    // PASSWORD_RECOVERY event → always show reset form
    if (event === 'PASSWORD_RECOVERY') { setAppState('reset-password'); return; }

    // Check URL for recovery token (when page loads from email link)
    const url = window.location.href;
    if (url.includes('type=recovery') || url.includes('access_token') && url.includes('recovery')) {
      setAppState('reset-password'); return;
    }

    if (!user) { setAppState('landing'); return; }

    const email = user.email?.toLowerCase() ?? '';

    // Strict admin check — only this exact email
    // Admin check done after fetching profile below

    // For radiologists — verify with backend
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setAppState('landing'); return; }

      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) { setAppState('pending'); return; }

      const profile = await res.json();
      if (profile.is_admin) { setAppState('admin'); return; }
      setAppState(profile.status === 'approved' ? 'approved' : 'pending');
    } catch {
      setAppState('pending');
    }
  };

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      await resolveState(session?.user ?? null, event);
    });
    supabase.auth.getSession().then(({ data }) => {
      resolveState(data.session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (appState === 'loading') return <Spinner />;
  if (appState === 'reset-password') return <ResetPasswordPage />;
  if (appState === 'admin') return <AdminDashboard />;
  if (appState === 'approved') return <Dashboard />;
  if (appState === 'pending') return <PendingPage />;
  if (appState === 'auth') return <AuthPage onAuth={(u) => resolveState(u)} />;

  return (
    <div className="relative min-h-screen w-full bg-white">
      <Navbar onAuthClick={() => setAppState('auth')} />
      <main className="max-w-[1600px] mx-auto">
        <Hero onStartClick={() => setAppState('auth')} />
        <Services onStartClick={() => setAppState('auth')} />
        <Features onStartClick={() => setAppState('auth')} />
        <Process />
        <FAQ />
        <CTA onStartClick={() => setAppState('auth')} />
      </main>
      <Footer onEmailSubmit={() => setAppState('auth')} />
    </div>
  );
};

export default App;