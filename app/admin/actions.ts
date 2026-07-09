// app/admin/actions.ts
'use server';

import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, collection, getDocs, doc, writeBatch, addDoc, updateDoc, deleteDoc, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

if (process.env.NODE_ENV === 'development') {
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  } catch (e) {}
}

/**
 * 🔥 後端儲存或更新社團資料 (Server Action) - 支援圖片、介紹與外部連結
 */
export async function saveClubAction(
  clubId: string | null, 
  name: string, 
  capacity: number, 
  description: string, 
  imageUrl: string,
  clubLink: string // 👈 新增這個參數
) {
  try {
    if (clubId) {
      const clubRef = doc(db, 'clubs', clubId);
      await updateDoc(clubRef, {
        name: name.trim(),
        capacity: Number(capacity),
        description: description.trim(),
        imageUrl: imageUrl.trim(),
        clubLink: clubLink.trim() // 👈 存入資料庫
      });
      return { success: true, message: "✅ 社團資料修改成功！" };
    } else {
      const clubsRef = collection(db, 'clubs');
      await addDoc(clubsRef, {
        name: name.trim(),
        capacity: Number(capacity),
        description: description.trim(),
        imageUrl: imageUrl.trim(),
        clubLink: clubLink.trim(), // 👈 存入資料庫
        applied: 0,
        enrolled: 0
      });
      return { success: true, message: "✅ 成功建立新社團！" };
    }
  } catch (error: any) {
    return { success: false, message: `❌ 儲存失敗: ${error.message}` };
  }
}

/**
 * 🔥 新增：後端刪除單一社團 (Server Action)
 */
export async function deleteClubAction(clubId: string) {
  try {
    const clubRef = doc(db, 'clubs', clubId);
    await deleteDoc(clubRef);
    return { success: true, message: "✅ 社團已成功從系統中移除。" };
  } catch (error: any) {
    return { success: false, message: `❌ 刪除失敗: ${error.message}` };
  }
}

/**
 * 後端一鍵執行全校隨機抽籤 (Server Action)
 */
export async function runRandomDrawOnServer() {
  try {
    const regSnapshot = await getDocs(collection(db, 'registrations'));
    const allRegs = regSnapshot.docs.map(d => ({ id: d.id, ...d.data() as any }));
    
    const clubSnapshot = await getDocs(collection(db, 'clubs'));
    const allClubs = clubSnapshot.docs.map(d => ({ id: d.id, ...d.data() as any }));

    const updateQueue: { ref: any, data: any }[] = [];

    allClubs.forEach((club) => {
      const applicants = allRegs.filter(r => r.clubId === club.id);
      const capacity = club.capacity || 0;
      let enrolledCount = 0;

      if (applicants.length <= capacity) {
        applicants.forEach((applicant) => {
          updateQueue.push({ ref: doc(db, 'registrations', applicant.id), data: { status: "accepted" } });
          enrolledCount++;
        });
      } else {
        for (let i = applicants.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [applicants[i], applicants[j]] = [applicants[j], applicants[i]];
        }
        applicants.forEach((applicant, index) => {
          updateQueue.push({
            ref: doc(db, 'registrations', applicant.id),
            data: { status: index < capacity ? "accepted" : "failed" }
          });
          if (index < capacity) enrolledCount++;
        });
      }

      updateQueue.push({ ref: doc(db, 'clubs', club.id), data: { enrolled: enrolledCount } });
    });

    const CHUNK_SIZE = 400;
    for (let i = 0; i < updateQueue.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = updateQueue.slice(i, i + CHUNK_SIZE);
      chunk.forEach(op => batch.update(op.ref, op.data));
      await batch.commit();
    }

    return { success: true, message: `🎉 伺服器端隨機抽籤完成！已精準處理 ${updateQueue.length} 筆變更。` };
  } catch (error: any) {
    return { success: false, message: `後端抽籤失敗: ${error.message}` };
  }
}

/**
 * 後端一鍵清除所有測試資料
 */
export async function clearAllTestData() {
  try {
    const collections = ['registrations', 'clubs'];
    
    for (const colName of collections) {
      const snapshot = await getDocs(collection(db, colName));
      const batch = writeBatch(db);
      
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
    }

    return { success: true, message: "✅ 資料庫已成功重置，所有測試資料已移除。" };
  } catch (error: any) {
    return { success: false, message: `清除失敗: ${error.message}` };
  }
}