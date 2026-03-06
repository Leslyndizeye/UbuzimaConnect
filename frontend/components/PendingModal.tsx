'use client';
import React from 'react';

interface Props {
  onLogout: () => void;
}

const PendingModal: React.FC<Props> = ({ onLogout }) => {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 w-[400px] shadow-2xl text-center">
        <h2 className="text-xl font-bold mb-3">Access Pending</h2>
        <p className="text-gray-500 mb-6">
          Your radiologist access request has been submitted.
          It is waiting for admin approval.
        </p>
        <button
          onClick={onLogout}
          className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-900 transition"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default PendingModal;