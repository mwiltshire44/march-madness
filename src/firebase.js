// ============================================================
// PASTE YOUR FIREBASE CONFIG HERE
// Replace everything inside the firebaseConfig object below
// with the keys you copied from the Firebase console.
// ============================================================

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAcZ-jJEStq50SbROQ3fVBvmYV1TX9jrH4",
  authDomain: "micah-death.firebaseapp.com",
  projectId: "micah-death",
  storageBucket: "micah-death.firebasestorage.app",
  messagingSenderId: "862028244896",
  appId: "1:862028244896:web:fab4a6d43776664b71e6c5"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
