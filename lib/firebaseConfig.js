// lib/firebaseConfig.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true, 
  useFetchStreams: false // 禁用實驗性 Fetch Streams，確保相容性
});

export const auth = getAuth(app);

try {
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  console.log("🎯 系統已成功鏈結至本地模擬器！");
} catch (error) {
  console.log("模擬器已連線，略過重複設定。");
}