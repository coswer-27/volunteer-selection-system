// app/admin/actions.ts
'use server';

import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, collection, getDocs, doc, writeBatch, addDoc, updateDoc, deleteDoc, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo-project.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo-bucket",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abcdef"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

if (process.env.NODE_ENV === 'development') {
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    console.log("🎯 [開發環境] 系統已鏈結至本地模擬器！");
  } catch (error) {
    console.log("模擬器已連線，略過重複設定。");
  }
}

// 替換 1：更新 saveClubAction
export async function saveClubAction(
  clubId: string | null, 
  name: string, 
  capacity: number, 
  description: string, 
  imageFile: string,
  clubLink: string,
  hashtags: string,
  category: string
) {
  try {
    const data = {
      name: name.trim(),
      capacity: Number(capacity),
      description: description.trim(),
      imageFile: imageFile.trim(),
      clubLink: clubLink.trim(),
      hashtags: hashtags.trim(),
      category: category.trim()
    };

    if (clubId) {
      await updateDoc(doc(db, 'clubs', clubId), data);
      return { success: true, message: "✅ 社團資料修改成功！" };
    } else {
      await addDoc(collection(db, 'clubs'), { ...data, applied: 0, enrolled: 0 });
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

/**
 * 🔥 後端：批次匯入社團資料 (支援以「名稱」為基準的 Upsert 更新/新增)
 */
export async function importClubsBulkAction(parsedData: any[]) {
  try {
    // 1. 抓取目前資料庫中所有的社團，建立「名稱 -> ID」的對照表
    const existingClubsSnapshot = await getDocs(collection(db, 'clubs'));
    const existingClubsMap = new Map<string, string>();
    existingClubsSnapshot.forEach(doc => {
      existingClubsMap.set(doc.data().name, doc.id);
    });

    const CHUNK_SIZE = 400; 
    const clubsRef = collection(db, 'clubs');
    let updateCount = 0;
    let insertCount = 0;
    
    for (let i = 0; i < parsedData.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = parsedData.slice(i, i + CHUNK_SIZE);
      
      chunk.forEach(club => {
        const clubName = String(club['名稱']).trim();
        if (!clubName) return; 
        
        const clubDataToSave = {
          name: clubName,
          capacity: Number(club['名額']) || 0,
          imageFile: club['圖片檔名'] ? String(club['圖片檔名']).trim() : '',
          clubLink: club['社團連結'] ? String(club['社團連結']).trim() : '',
          description: club['社團介紹'] ? String(club['社團介紹']).trim() : '',
          hashtags: club['Hashtags'] ? String(club['Hashtags']).trim() : '',
          category: club['社團分類'] ? String(club['社團分類']).trim() : ''
        };

        // 2. 比對對照表：判斷是更新還是新增
        const existingId = existingClubsMap.get(clubName);
        if (existingId) {
          // 存在 -> 更新 (不覆蓋原本的 applied 和 enrolled 人數)
          batch.update(doc(db, 'clubs', existingId), clubDataToSave);
          updateCount++;
        } else {
          // 不存在 -> 新增
          const newDocRef = doc(clubsRef);
          batch.set(newDocRef, {
            ...clubDataToSave,
            applied: 0,
            enrolled: 0
          });
          insertCount++;
        }
      });
      await batch.commit();
    }
    return { success: true, message: `✅ CSV 處理完成！更新了 ${updateCount} 筆，新增了 ${insertCount} 筆。` };
  } catch (error: any) {
    return { success: false, message: `❌ 匯入失敗: ${error.message}` };
  }
}

/**
 * 🔥 後端：單純清除所有「學生選填紀錄」(包含自動將社團人數歸零)
 */
export async function clearAllRegistrationsAction() {
  try {
    const batch = writeBatch(db);
    
    // 1. 刪除 registrations 集合內的所有資料
    const regSnapshot = await getDocs(collection(db, 'registrations'));
    regSnapshot.docs.forEach((d) => batch.delete(d.ref));

    // 2. 為了資料一致性，將所有 clubs 的 applied 與 enrolled 歸零
    const clubSnapshot = await getDocs(collection(db, 'clubs'));
    clubSnapshot.docs.forEach((c) => {
      batch.update(c.ref, { applied: 0, enrolled: 0 });
    });

    await batch.commit();
    return { success: true, message: "✅ 已成功清空所有學生的選填紀錄，並將社團登記人數歸零！" };
  } catch (error: any) {
    return { success: false, message: `清除紀錄失敗: ${error.message}` };
  }
}

/**
 * 🔥 後端：清除所有「社團資料」(會連帶刪除所有依附的報名紀錄，避免產生幽靈資料)
 */
export async function clearAllClubsAction() {
  try {
    const batch = writeBatch(db);
    
    // 1. 刪除 clubs 集合內的所有資料
    const clubSnapshot = await getDocs(collection(db, 'clubs'));
    clubSnapshot.docs.forEach((d) => batch.delete(d.ref));

    // 2. 社團都沒了，選填紀錄留著也沒用，一併級聯刪除 (Cascading Delete)
    const regSnapshot = await getDocs(collection(db, 'registrations'));
    regSnapshot.docs.forEach((d) => batch.delete(d.ref));

    await batch.commit();
    return { success: true, message: "✅ 已成功刪除所有社團資料與相關的選填紀錄！" };
  } catch (error: any) {
    return { success: false, message: `清除社團失敗: ${error.message}` };
  }
}