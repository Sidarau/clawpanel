import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyBtqeIl7QrIt_u46ho2U41xJnWZGptSMsE",
    authDomain: "clawpanel-50d0f.firebaseapp.com",
    projectId: "clawpanel-50d0f",
    storageBucket: "clawpanel-50d0f.firebasestorage.app",
    messagingSenderId: "640687877222",
    appId: "1:640687877222:web:0049f152d02d84980991a7",
    measurementId: "G-4FV0KKZEKP"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Add scopes
// googleProvider.addScope('email');
// googleProvider.addScope('profile');

export { app, auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged };
export { GoogleAuthProvider };
export default auth;
