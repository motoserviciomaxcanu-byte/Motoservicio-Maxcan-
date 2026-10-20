import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBF1tvAzMZuXAQCAM229F_3xAC28DHrwRk",
  authDomain: "motoservicio-maxcanu.firebaseapp.com",
  projectId: "motoservicio-maxcanu",
  storageBucket: "motoservicio-maxcanu.firebasestorage.app",
  messagingSenderId: "652847943907",
  appId: "1:652847943907:web:f3a7366856bba30b8435d6",
  measurementId: "G-07C1JM8V9S"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Base de datos Firestore exportada correctamente
export const db = getFirestore(app);
