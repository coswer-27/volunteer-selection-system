// lib/clubService.js
import { db } from './firebaseConfig';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

/**
 * 學生登記志願 (不限名額，僅限一人一檔)
 */
export async function registerClubTransaction(studentId, clubId) {
  const clubRef = doc(db, 'clubs', clubId);
  const regRef = doc(db, 'registrations', studentId);

  try {
    return await runTransaction(db, async (transaction) => {
      const clubDoc = await transaction.get(clubRef);
      const regDoc = await transaction.get(regRef);

      if (!clubDoc.exists()) throw new Error("找不到該社團資訊");
      if (regDoc.exists()) {
        throw new Error("您已經登記過志願了！每人限登記一個社團。");
      }

      // 取得目前的登記人數 (若欄位不存在則預設為 0)
      const currentApplied = clubDoc.data().applied || 0;

      // 寫入登記紀錄，狀態設為 pending (等待抽籤)
      transaction.set(regRef, {
        studentId: studentId,
        clubId: clubId,
        status: "pending", // pending = 等待抽籤, doc 已錄取, fail 未錄取
        timestamp: serverTimestamp()
      });

      // 更新社團的「已登記人數」
      transaction.update(clubRef, { applied: currentApplied + 1 });

      return { success: true, message: "志願登記成功！請靜待抽籤結果。" };
    });
  } catch (error) {
    return { success: false, message: error.message || "系統繁忙，請稍後再試" };
  }
}

/**
 * 學生取消登記 (退選)
 */
export async function cancelRegistrationTransaction(studentId, clubId) {
  const clubRef = doc(db, 'clubs', clubId);
  const regRef = doc(db, 'registrations', studentId);

  try {
    return await runTransaction(db, async (transaction) => {
      const clubDoc = await transaction.get(clubRef);
      const regDoc = await transaction.get(regRef);

      if (!regDoc.exists()) throw new Error("找不到您的登記紀錄。");
      if (regDoc.data().clubId !== clubId) throw new Error("登記紀錄不符。");

      const currentApplied = clubDoc.data().applied || 0;

      // 扣減登記人數並刪除檔案
      transaction.update(clubRef, { applied: Math.max(0, currentApplied - 1) });
      transaction.delete(regRef);

      return { success: true, message: "已取消志願登記！" };
    });
  } catch (error) {
    return { success: false, message: error.message };
  }
}