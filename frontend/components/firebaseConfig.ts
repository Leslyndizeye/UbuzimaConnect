
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDi4RTTaLj-MR-QZLlTd2ijtdFY13vqshs",
  authDomain: "ubuzima-connect.firebaseapp.com",
  projectId: "ubuzima-connect",
  storageBucket: "ubuzima-connect.firebasestorage.app",
  messagingSenderId: "609895714106",
  appId: "1:609895714106:web:1a582026a3fdf82b479403",
  measurementId: "G-0EESD2TELK"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserSessionPersistence)
  .catch((error) => console.error("Persistence error:", error));

const googleProvider = new GoogleAuthProvider();

export { auth, googleProvider, db };
