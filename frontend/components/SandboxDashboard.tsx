import React from "react";
import { signOut } from "firebase/auth";
import { auth } from "./firebaseConfig";

export default function SandboxDashboard() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Sandbox Mode</h2>
      <p>You are signed in as a test user. Radiologist tools require admin approval.</p>
      <button onClick={() => signOut(auth)}>Logout</button>
    </div>
  );
}