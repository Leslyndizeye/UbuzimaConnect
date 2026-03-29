// hospital-portal/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HospitalLanding  from './pages/HospitalLanding';
import HospitalApply    from './pages/HospitalApply';
import HospitalAdmin    from './pages/Hospitaladmin';
import ResetPassword    from './pages/ResetPassword';
import LegalPage        from './pages/LegalPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"               element={<HospitalLanding />} />
        <Route path="/apply"          element={<HospitalApply />} />
        <Route path="/terms"          element={<LegalPage />} />
        <Route path="/privacy"        element={<LegalPage />} />
        <Route path="/admin"          element={<HospitalAdmin />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*"               element={<HospitalLanding />} />
      </Routes>
    </BrowserRouter>
  );
}
