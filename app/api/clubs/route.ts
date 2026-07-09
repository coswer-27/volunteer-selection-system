// app/api/clubs/route.ts
import { NextResponse } from 'next/server';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebaseConfig'; // 確認路徑是否正確

// 🔥 核心防禦：設定這支 API 每 60 秒才會重新跟 Firebase 拿一次資料
export const revalidate = 60; 

export async function GET() {
  try {
    const querySnapshot = await getDocs(collection(db, 'clubs'));
    const clubs: any[] = [];
    querySnapshot.forEach((doc) => {
      clubs.push({ id: doc.id, ...doc.data() });
    });

    // 回傳資料給前端，並加上快取標頭 (Cache-Control)
    return NextResponse.json({ success: true, clubs }, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=30'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}