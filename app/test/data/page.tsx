// app/test-data/page.tsx
'use client';

import { useState } from 'react';
import { collection, getDocs, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebaseConfig';

export default function MockDataPage() {
  const [status, setStatus] = useState("等待執行...");
  const [isLoading, setIsLoading] = useState(false);

  const generateMockData = async () => {
    setIsLoading(true);
    setStatus("正在產生假資料，請稍候...");

    try {
      // 1. 取得目前所有的社團
      const clubSnapshot = await getDocs(collection(db, 'clubs'));
      const clubs = clubSnapshot.docs.map(d => ({ id: d.id, ...d.data() as any }));

      if (clubs.length === 0) {
        throw new Error("找不到社團資料，請先匯入社團！");
      }

      const batch = writeBatch(db);
      
      // 用來在本地端累加每個社團的報名人數，最後再批次更新
      const clubAppliedCounts: Record<string, number> = {};
      clubs.forEach(c => {
        clubAppliedCounts[c.id] = c.applied || 0; 
      });

      // 2. 產生 10000 筆隨機學生登記紀錄
      const MOCK_COUNT = 10000;
      for (let i = 1; i <= MOCK_COUNT; i++) {
        // 產生假學號，例如 B114001 ~ B114200
        const studentId = `B114${String(i).padStart(5, '0')}`;
        
        // 隨機選一個社團
        const randomClub = clubs[Math.floor(Math.random() * clubs.length)];
        
        // 增加該社團的登記計數
        clubAppliedCounts[randomClub.id] += 1;

        // 準備寫入 registrations 集合
        const regRef = doc(db, 'registrations', studentId);
        batch.set(regRef, {
          studentId: studentId,
          clubId: randomClub.id,
          status: "pending", // 統一設為等待抽籤
          timestamp: serverTimestamp()
        });
      }

      // 3. 準備更新每個社團的 applied 總人數
      Object.keys(clubAppliedCounts).forEach(clubId => {
        const clubRef = doc(db, 'clubs', clubId);
        batch.update(clubRef, { applied: clubAppliedCounts[clubId] });
      });

      // 4. 送出批次寫入
      await batch.commit();
      
      setStatus(`✅ 成功匯入 ${MOCK_COUNT} 筆隨機登記紀錄！請回管理員後台執行抽籤。`);

    } catch (error: any) {
      console.error(error);
      setStatus(`❌ 發生錯誤：${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8 mt-10 border rounded-lg shadow-sm bg-white">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">測試資料生成工具</h1>
      <p className="text-gray-600 mb-6">
        點擊下方按鈕，系統將自動產生 <strong>10000 名</strong> 學生的隨機志願登記紀錄，並更新各社團的報名人數。這能幫助你快速測試後台的「隨機抽籤」演算法是否正常運作。
      </p>

      <button
        onClick={generateMockData}
        disabled={isLoading}
        className={`px-6 py-2 rounded text-white font-medium transition-colors
          ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}
        `}
      >
        {isLoading ? '生成中...' : '產生 10000 筆隨機登記資料'}
      </button>

      <div className="mt-6 p-4 bg-gray-100 rounded font-mono text-sm text-gray-700">
        狀態：{status}
      </div>
    </div>
  );
}