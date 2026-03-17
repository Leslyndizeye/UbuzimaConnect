import React, { useEffect, useState } from "react";
import { confirmPasswordReset } from "firebase/auth";
import { auth } from "./firebaseConfig";

function getParam(name: string) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

const SetPassword: React.FC = () => {
  const oobCode = getParam("oobCode"); // Firebase sends this
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!oobCode) {
      setError("Invalid or missing reset code. Please request a new email.");
    }
  }, [oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!oobCode) return;

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      await confirmPasswordReset(auth, oobCode, password);
      setDone(true);
    } catch (err: any) {
      setError(err?.message || "Failed to set password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="w-full max-w-md p-8 rounded-2xl border border-gray-100 shadow-sm text-center">
          <h1 className="text-2xl font-bold mb-2">Password set </h1>
          <p className="text-gray-500 mb-6">You can now sign in with your email and new password.</p>
          <button
            className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold"
            onClick={() => (window.location.href = "/")}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-md p-8 rounded-2xl border border-gray-100 shadow-sm">
        <h1 className="text-2xl font-bold mb-2">Set your password</h1>
        <p className="text-gray-500 mb-6">
          Create a password for your Ubuzima Connect account.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700">Password</label>
            <div className="mt-1 relative">
              <input
                type={show ? "text" : "password"}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/30"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700">Confirm Password</label>
            <input
              type={show ? "text" : "password"}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/30"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
            />
          </div>

          <button
            type="button"
            className="text-sm font-semibold text-emerald-600"
            onClick={() => setShow(!show)}
          >
            {show ? "Hide password" : "Show password"}
          </button>

          <button
            disabled={loading || !oobCode}
            className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold disabled:opacity-50"
          >
            {loading ? "Saving..." : "Set Password"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetPassword;