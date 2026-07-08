// app/setup/page.tsx
'use client';

import { useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebaseConfig'; // 確保路徑正確

// 替換 app/setup/page.tsx 上方的 INITIAL_CLUBS 陣列

const INITIAL_CLUBS = [
  { id: "club_01", name: "慈幼社", capacity: 10, enrolled: 0 },
  { id: "club_02", name: "電子競技社", capacity: 10, enrolled: 0 },
  { id: "club_03", name: "雀兒輕音社", capacity: 10, enrolled: 0 },
  { id: "club_04", name: "國際英語演講社", capacity: 10, enrolled: 0 },
  { id: "club_05", name: "弓道社", capacity: 10, enrolled: 0 },
  { id: "club_06", name: "鐵格嘻研社", capacity: 10, enrolled: 0 },
  { id: "club_07", name: "集美好攝團", capacity: 10, enrolled: 0 },
  { id: "club_08", name: "熱舞社", capacity: 10, enrolled: 0 },
  { id: "club_09", name: "采音吉他社", capacity: 10, enrolled: 0 },
  { id: "club_10", name: "生存遊戲社", capacity: 10, enrolled: 0 },
  { id: "club_11", name: "北科大管弦樂社", capacity: 10, enrolled: 0 },
  { id: "club_12", name: "學生會", capacity: 10, enrolled: 0 },
  { id: "club_13", name: "爛柯圍棋社", capacity: 10, enrolled: 0 },
  { id: "club_14", name: "ACGM研究社", capacity: 10, enrolled: 0 },
  { id: "club_15", name: "瓶蓋棒球社", capacity: 10, enrolled: 0 },
  { id: "club_16", name: "正言社", capacity: 10, enrolled: 0 },
  { id: "club_17", name: "親善大使團", capacity: 10, enrolled: 0 },
  { id: "club_18", name: "NTUT iPower 社", capacity: 10, enrolled: 0 },
  { id: "club_19", name: "火舞藝術研究社", capacity: 10, enrolled: 0 },
  { id: "club_20", name: "桌球社", capacity: 10, enrolled: 0 },
  { id: "club_21", name: "玉虹國樂社", capacity: 10, enrolled: 0 },
  { id: "club_22", name: "北科程式設計研究社", capacity: 10, enrolled: 0 },
  { id: "club_23", name: "福智青年社", capacity: 10, enrolled: 0 },
  { id: "club_24", name: "阿卡北拉社", capacity: 10, enrolled: 0 },
  { id: "club_25", name: "潘羿萌", capacity: 10, enrolled: 0 },
  { id: "club_26", name: "崇德青年社", capacity: 10, enrolled: 0 },
  { id: "club_27", name: "山孩國際志工社", capacity: 10, enrolled: 0 },
  { id: "club_28", name: "韓國文化研究社", capacity: 10, enrolled: 0 },
  { id: "club_29", name: "賦展鋼琴社", capacity: 10, enrolled: 0 },
  { id: "club_10", name: "禪心領袖社", capacity: 10, enrolled: 0 },
  { id: "club_31", name: "綜合格鬥社", capacity: 10, enrolled: 0 },
  { id: "club_32", name: "Aliyan 原住民文化研究社", capacity: 10, enrolled: 0 },
  { id: "club_33", name: "霓享塔羅社", capacity: 10, enrolled: 0 },
  { id: "club_34", name: "北科自由車社", capacity: 10, enrolled: 0 }
];

export default function SetupPage() {
  const [status, setStatus] = useState("等待執行...");
  const [isLoading, setIsLoading] = useState(false);

  const handleSeedData = async () => {
    setIsLoading(true);
    setStatus("正在批次寫入資料庫...");

    try {
      // 建立一個批次處理物件 (最多一次可寫入 500 筆)
      const batch = writeBatch(db);

      INITIAL_CLUBS.forEach((club) => {
        // 指定寫入路徑與 Document ID
        const clubRef = doc(db, 'clubs', club.id);
        batch.set(clubRef, {
          name: club.name,
          capacity: club.capacity,
          enrolled: club.enrolled
        });
      });

      // 執行批次寫入
      await batch.commit();
      setStatus("✅ 資料初始化成功！請前往 Firebase 後台確認。");
    } catch (error: any) {
      console.error(error);
      setStatus(`❌ 寫入失敗：${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8 mt-10 border rounded-lg shadow-sm bg-white">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">系統資料初始化工具</h1>
      <p className="text-gray-600 mb-6">
        點擊下方按鈕，將預設的社團清單批次寫入 Firestore 資料庫。<br/>
        <span className="text-red-500 text-sm">注意：執行前請確認已在 Firebase Rules 暫時開啟 `allow create: if true;` 權限。</span>
      </p>

      <button
        onClick={handleSeedData}
        disabled={isLoading}
        className={`px-6 py-2 rounded text-white font-medium
          ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}
        `}
      >
        {isLoading ? '寫入中...' : '開始寫入社團資料'}
      </button>

      <div className="mt-6 p-4 bg-gray-100 rounded font-mono text-sm text-gray-700">
        狀態：{status}
      </div>
    </div>
  );
}