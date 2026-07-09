// app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';
import { registerClubTransaction, cancelRegistrationTransaction } from '../lib/clubService';

// 定義學生資料型別
interface StudentProfile {
  studentId: string;
  name: string;
  className: string;
}

export default function Home() {
  const [clubs, setClubs] = useState<any[]>([]);
  const [sysMessage, setSysMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 學生登入狀態管理
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginForm, setLoginForm] = useState({ studentId: '', name: '', className: '' });
  
  // 記錄該學生的報名狀況
  const [myRegisteredClubId, setMyRegisteredClubId] = useState<string | null>(null);

  // 1. 初始化與讀取資料
  const fetchClubs = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'clubs'));
      const clubData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClubs(clubData);
    } catch (error) {
      console.error(error);
    }
  };

  const checkStudentStatus = async (sId: string) => {
    try {
      const regDoc = await getDoc(doc(db, 'registrations', sId));
      if (regDoc.exists()) {
        setMyRegisteredClubId(regDoc.data().clubId);
      } else {
        setMyRegisteredClubId(null);
      }
    } catch (error: any) {
      console.error("狀態查詢失敗:", error);
    }
  };

  // 網頁載入時，檢查是否有登入紀錄
  useEffect(() => {
    fetchClubs();
    const savedProfile = localStorage.getItem('studentProfile');
    if (savedProfile) {
      const profile = JSON.parse(savedProfile);
      setStudentProfile(profile);
      checkStudentStatus(profile.studentId);
    }
  }, []);

  // 2. 登入與登出邏輯
  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.studentId || !loginForm.name || !loginForm.className) return;

    setIsSubmitting(true);
    const formattedId = loginForm.studentId.trim().toUpperCase();
    const profile = { ...loginForm, studentId: formattedId };

    try {
      // 將學生基本資料寫入 Firestore，方便管理員未來匯出名單
      await setDoc(doc(db, 'students', formattedId), profile, { merge: true });
      
      // 存在本地端，保持登入狀態
      localStorage.setItem('studentProfile', JSON.stringify(profile));
      setStudentProfile(profile);
      setShowLoginModal(false);
      setSysMessage(`歡迎回來，${profile.className} ${profile.name}！`);
      
      await checkStudentStatus(formattedId);
    } catch (error: any) {
      setSysMessage(`登入失敗：${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('studentProfile');
    setStudentProfile(null);
    setMyRegisteredClubId(null);
    setSysMessage('已成功登出。');
  };

  // 3. 報名與退選邏輯
  const handleRegister = async (clubId: string) => {
    if (!studentProfile) {
      setShowLoginModal(true);
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSysMessage('正在提交志願...');
    const result = await registerClubTransaction(studentProfile.studentId, clubId);
    
    setSysMessage(result.message);
    if (result.success) {
      setMyRegisteredClubId(clubId);
      await fetchClubs();
    }
    setIsSubmitting(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelRegister = async (clubId: string, clubName: string) => {
    if (!studentProfile || !window.confirm(`確定要取消登記「${clubName}」嗎？`)) return;
    
    setIsSubmitting(true);
    const result = await cancelRegistrationTransaction(studentProfile.studentId, clubId);
    
    setSysMessage(result.message);
    if (result.success) {
      setMyRegisteredClubId(null);
      await fetchClubs();
    }
    setIsSubmitting(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 4. 計算熱度排行榜 (取登記人數最高的前 3 名)
  const trendingClubs = [...clubs]
    .sort((a, b) => (b.applied || 0) - (a.applied || 0))
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* 頂部導覽列 */}
      <nav className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-black text-indigo-700 tracking-tight">Rêverie 志願選填系統</h1>
          <div>
            {studentProfile ? (
              <div className="flex items-center gap-4">
                <div className="hidden md:block text-sm text-gray-600 text-right">
                  <p className="font-bold text-gray-800">{studentProfile.name}</p>
                  <p>{studentProfile.className} ({studentProfile.studentId})</p>
                </div>
                <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-colors">
                  登出
                </button>
              </div>
            ) : (
              <button onClick={() => setShowLoginModal(true)} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-full shadow-md transition-all transform hover:scale-105">
                學生登入
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* 系統訊息提示 */}
      {sysMessage && (
        <div className="max-w-6xl mx-auto mt-6 px-4">
          <div className={`p-4 rounded-lg font-medium shadow-sm flex items-center justify-between ${sysMessage.includes('成功') || sysMessage.includes('歡迎') ? 'bg-green-100 text-green-800 border-l-4 border-green-500' : 'bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500'}`}>
            {sysMessage}
            <button onClick={() => setSysMessage('')} className="text-xl leading-none opacity-50 hover:opacity-100">&times;</button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 mt-8">
        
        {/* 🔥 熱度排行榜區塊 */}
        {clubs.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-6">
              <span className="text-3xl">🔥</span>
              <h2 className="text-2xl font-bold text-gray-800">熱門社團排行</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {trendingClubs.map((club, index) => (
                <div key={`trend-${club.id}`} className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-1 shadow-lg transform transition hover:-translate-y-1">
                  <div className="bg-white h-full w-full rounded-xl p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-500">
                          #{index + 1}
                        </span>
                        <span className="bg-orange-100 text-orange-600 text-xs font-bold px-2 py-1 rounded-full">
                          {club.applied || 0} 人搶填
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-gray-800">{club.name}</h3>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 📚 所有社團網格區塊 */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <span className="text-3xl">📚</span>
            <h2 className="text-2xl font-bold text-gray-800">所有社團</h2>
          </div>
          
          {clubs.length === 0 ? (
            <div className="text-center py-20 text-gray-500">系統中目前沒有社團資料...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {clubs.map((club) => {
                const isMyClub = myRegisteredClubId === club.id;
                const appliedCount = club.applied || 0;
                let rateText = "100%";
                if (appliedCount > club.capacity) {
                  rateText = `${((club.capacity / appliedCount) * 100).toFixed(1)}%`;
                }
                
                // 若資料庫沒有圖片與介紹，給予高質感的預設值
                const imageUrl = club.imageUrl || `https://picsum.photos/seed/${club.id}/400/250`;
                const description = club.description || "歡迎加入我們！這裡充滿了熱情與活力，快來跟我們一起創造難忘的大學回憶吧！";

                return (
                  <div key={club.id} className={`flex flex-col bg-white rounded-2xl overflow-hidden transition-all duration-300 ${isMyClub ? 'ring-4 ring-indigo-500 shadow-xl scale-[1.02]' : 'shadow-sm hover:shadow-xl border border-gray-100'}`}>
                    
                    {/* 照片區塊 */}
                    <div className="h-40 w-full relative bg-gray-200">
                      <img src={imageUrl} alt={club.name} className="w-full h-full object-cover" />
                      {isMyClub && (
                        <div className="absolute top-3 right-3 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md animate-pulse">
                          ✔️ 已登記志願
                        </div>
                      )}
                    </div>

                    {/* 內容區塊 */}
                    <div className="p-5 flex-1 flex flex-col">
                      <h2 className="text-xl font-bold text-gray-800 mb-2 truncate">
                        {club.clubLink ? (
                          <a 
                            href={club.clubLink} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="hover:text-indigo-600 hover:underline flex items-center gap-1 transition-colors"
                            title="點擊前往社團專頁"
                          >
                            {club.name}
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-indigo-400">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </a>
                        ) : (
                          club.name
                        )}
                      </h2>
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2 flex-1">{description}</p>
                      
                      <div className="bg-gray-50 rounded-lg p-3 mb-5 text-sm text-gray-700 space-y-1.5 border">
                        <div className="flex justify-between"><span>總名額：</span><span className="font-medium">{club.capacity} 員</span></div>
                        <div className="flex justify-between"><span>已登記：</span><span className="font-medium">{appliedCount} 人</span></div>
                        <div className="flex justify-between">
                          <span>中籤機率：</span>
                          <span className={`font-bold ${appliedCount > club.capacity ? "text-red-500" : "text-green-600"}`}>{rateText}</span>
                        </div>
                      </div>
                      
                      {/* 操作按鈕改為進入詳細頁面 */}
                        <button 
                          onClick={() => window.location.href = `/club/${club.id}`} 
                          className="w-full mt-4 py-2.5 rounded-xl font-bold bg-gray-100 hover:bg-indigo-600 hover:text-white text-gray-700 transition-all shadow-sm"
                        >
                          查看社團詳情 & 報名
                        </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* 🎓 學生登入彈出視窗 (Modal) */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all">
            <div className="bg-indigo-600 p-6 text-center">
              <h3 className="text-2xl font-bold text-white">學生登入</h3>
              <p className="text-indigo-200 text-sm mt-1">請輸入正確資料以進行志願選填</p>
            </div>
            <form onSubmit={handleStudentLogin} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">班級 (Class)</label>
                <input required type="text" value={loginForm.className} onChange={e => setLoginForm({...loginForm, className: e.target.value})} placeholder="例如：資工三甲" className="w-full border-gray-300 border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">姓名 (Name)</label>
                <input required type="text" value={loginForm.name} onChange={e => setLoginForm({...loginForm, name: e.target.value})} placeholder="請輸入真實姓名" className="w-full border-gray-300 border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">學號 (Student ID)</label>
                <input required type="text" value={loginForm.studentId} onChange={e => setLoginForm({...loginForm, studentId: e.target.value})} placeholder="例如：B114001" className="w-full border-gray-300 border px-4 py-2.5 rounded-xl uppercase focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
              </div>
              
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowLoginModal(false)} className="flex-1 px-4 py-2.5 border-2 border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md transition-colors">
                  {isSubmitting ? '處理中...' : '確認登入'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}