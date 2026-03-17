import { useState, useEffect } from 'react';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

interface HospitalBranding {
  id: number;
  name: string;
  logo_base64: string | null;
  district: string;
  province: string;
}

export function useHospitalBranding(hospitalId: number | null | undefined) {
  const [branding, setBranding] = useState<HospitalBranding | null>(null);

  useEffect(() => {
    if (!hospitalId) return;
    fetch(`${API_BASE}/hospitals/${hospitalId}/branding`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setBranding(data); })
      .catch(() => {});
  }, [hospitalId]);

  return branding;
}