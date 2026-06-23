import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB7NpjyVcoI411BvzLfIOk7pbIZycP1A94",
  authDomain: "quran-bbede.firebaseapp.com",
  projectId: "quran-bbede",
  storageBucket: "quran-bbede.firebasestorage.app",
  messagingSenderId: "535328698919",
  appId: "1:535328698919:web:37459414a86f64daf29402",
  measurementId: "G-ZSRFHM58QW",
  // Realtime Database URL - will be updated after database creation
  databaseURL: "https://quran-bbede-default-rtdb.firebaseio.com"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
