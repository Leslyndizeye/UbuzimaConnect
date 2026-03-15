// hospital-portal/src/pages/ResetPassword.tsx
// Handles password reset for both super admin and hospital middle admins
// Supabase redirects here after clicking the reset link in email

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseConfig';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [show, setShow]           = useState(false);
  const [showC, setShowC]         = useState(false);
  const [loading, setLoading]     = useState(false);
  const [msg, setMsg]             = useState('');
  const [isError, setIsError]     = useState(false);
  const [ready, setReady]         = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    // Supabase embeds the token in the URL hash when user clicks reset link
    // We need to let Supabase pick it up via onAuthStateChange
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
        setUserEmail(data.session.user.email || '');
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setReady(true);
        setUserEmail(session.user.email || '');
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setMsg('Passwords do not match'); setIsError(true); return; }
    if (password.length < 8)  { setMsg('Password must be at least 8 characters'); setIsError(true); return; }

    setLoading(true); setMsg(''); setIsError(false);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) { setMsg(error.message); setIsError(true); return; }

    setMsg('✅ Password updated successfully! Redirecting to login…');
    setIsError(false);

    setTimeout(async () => {
      await supabase.auth.signOut();
      navigate('/admin');
    }, 2500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-gray-100 p-8">

        {/* Header */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-900 rounded-2xl mb-3">
            <svg className="w-5 h-5 text-emerald-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-gray-900">Set New Password</h2>
          <p className="text-xs text-gray-400 mt-1">Ubuzima Connect · Hospital Portal</p>
          {userEmail && (
            <p className="text-[10px] text-emerald-600 font-bold mt-1">{userEmail}</p>
          )}
        </div>

        {/* Waiting for Supabase session */}
        {!ready && !msg && (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="w-8 h-8 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
            <p className="text-xs text-gray-400">Verifying reset link…</p>
            <p className="text-[10px] text-gray-300 text-center max-w-xs">
              If this takes more than 10 seconds, the link may have expired.
              <button onClick={() => navigate('/admin')} className="block mx-auto mt-2 text-emerald-600 font-bold hover:underline">
                Request a new one →
              </button>
            </p>
          </div>
        )}

        {/* Success message */}
        {msg && !isError && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 font-semibold text-center">
            {msg}
          </div>
        )}

        {/* Reset form */}
        {ready && !msg.startsWith('✅') && (
          <form onSubmit={handleReset} className="space-y-4">
            {/* New password */}
            <div>
              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-0.5">
                New Password
              </label>
              <div className="relative mt-1">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  className="w-full px-3.5 py-2.5 pr-12 rounded-xl border border-gray-100 bg-gray-50 text-gray-900 text-xs font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
                <button type="button" onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-gray-400 hover:text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">
                  {show ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-0.5">
                Confirm Password
              </label>
              <div className="relative mt-1">
                <input
                  type={showC ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  required
                  className="w-full px-3.5 py-2.5 pr-12 rounded-xl border border-gray-100 bg-gray-50 text-gray-900 text-xs font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
                <button type="button" onClick={() => setShowC(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-gray-400 hover:text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">
                  {showC ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Password strength hint */}
            {password.length > 0 && (
              <div className="flex gap-1">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex-1 h-1 rounded-full transition-all"
                    style={{ backgroundColor: password.length >= (i + 1) * 3 ? (password.length >= 12 ? '#059669' : password.length >= 8 ? '#d97706' : '#e5e7eb') : '#e5e7eb' }} />
                ))}
                <span className="text-[9px] text-gray-400 ml-1 whitespace-nowrap">
                  {password.length < 8 ? 'Too short' : password.length < 12 ? 'Good' : 'Strong'}
                </span>
              </div>
            )}

            {/* Error message */}
            {isError && msg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-semibold">
                {msg}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 bg-emerald-900 hover:bg-emerald-800 text-white font-bold rounded-xl transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2 mt-2">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Updating…</>
                : 'Set New Password →'
              }
            </button>
          </form>
        )}

        <button onClick={() => navigate('/admin')}
          className="w-full mt-5 text-[9px] font-bold uppercase tracking-widest text-gray-300 hover:text-gray-500 transition-colors text-center">
          ← Back to Admin Login
        </button>
      </div>
    </div>
  );
}