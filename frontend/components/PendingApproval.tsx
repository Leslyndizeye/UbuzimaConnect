import React from "react";
import { signOut } from "firebase/auth";
import { auth } from "./firebaseConfig";

export default function PendingApproval() {
  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-8 shadow-xl text-center">
        <h1 className="text-2xl font-bold mb-2">Request Submitted</h1>
        <p className="text-gray-500 mb-6">
          Your radiologist access request is pending admin approval.
          You’ll be notified once it’s approved.
        </p>

        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-2xl bg-black text-white font-semibold hover:bg-gray-900 transition"
        >
          Logout
        </button>
      </div>
    </div>
  );
}