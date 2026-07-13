// app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';
import { registerClubTransaction, cancelRegistrationTransaction } from '../lib/clubService';
import { verifyStudentLogin } from '../app/actions/auth';

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
  const [isLoading, setIsLoading] = useState(true);
  
  // 學生登入狀態管理
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginForm, setLoginForm] = useState({ studentId: '', name: '', className: '' });
  
  // 記錄該學生的報名狀況
  const [myRegisteredClubId, setMyRegisteredClubId] = useState<string | null>(null);

  // 🔥 新增：倒數計時狀態，預設與後端 revalidate 一致設定為 60 秒
  const [countdown, setCountdown] = useState(60);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('所有社團');
  const [sortBy, setSortBy] = useState('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const categories = ['所有社團', ...Array.from(new Set(clubs.map(c => c.category).filter(Boolean)))];

  // 1. 先過濾分類
  const filteredClubs = selectedCategory === '所有社團' 
    ? clubs 
    : clubs.filter(c => c.category === selectedCategory);

  // 2. 再依照 sortBy 與 sortOrder 進行排序
  const sortedClubs = [...filteredClubs].sort((a, b) => {
    
    const regA = a.registered || 0; 
    const regB = b.registered || 0;
    const capA = a.capacity || 1;
    const capB = b.capacity || 1;

    let comparison = 0; // 用來暫存「升冪(小到大)」狀態下的比較結果

    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name, 'zh-TW');
        break;
      
      case 'popularity':
        // 基礎邏輯：A - B (升冪，人數少排前面)
        comparison = regA - regB;
        break;
      
      case 'category':
        const catA = a.category || '';
        const catB = b.category || '';
        comparison = catA.localeCompare(catB, 'zh-TW');
        break;
      
      case 'probability':
        const probA = regA === 0 ? 1 : Math.min(1, capA / regA);
        const probB = regB === 0 ? 1 : Math.min(1, capB / regB);
        
        if (probA === probB) {
          const remainingA = Math.max(0, capA - regA);
          const remainingB = Math.max(0, capB - regB);
          // 如果機率一樣，用剩餘名額來比
          comparison = remainingA - remainingB;
        } else {
          comparison = probA - probB;
        }
        break;
      
      default:
        return 0;
    }

    // 🔥 核心反轉邏輯：如果是降冪(desc)，就把比較結果加個負號反轉！
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // 1. 初始化與讀取資料
  const fetchClubs = async () => {
    try {
      // 改為向我們剛剛做的快取 API 發出請求
      const response = await fetch('/api/clubs');
      const data = await response.json();
      
      if (data.success) {
        setClubs(data.clubs);
        setCountdown(60);
      } else {
        console.error("讀取失敗:", data.error);
      }
    } catch (error) {
      console.error("API 連線失敗:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 初始載入
  useEffect(() => {
    fetchClubs();
  }, []);

  // 🔥 新增：處理每秒倒數的計時器
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // 👈 當秒數歸零時，自動在背景呼叫 API 重新整理數據
          fetchClubs(); 
          return 60; // 暫時回到 60，等待 fetchClubs 成功後再次被精準重設
        }
        return prev - 1;
      });
    }, 1000);

    // 元件卸載時清除計時器，防止記憶體洩漏 (Memory Leak)
    return () => clearInterval(timer);
  }, []);
  
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        {/* 旋轉的載入動畫 */}
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mb-4"></div>
        <h2 className="text-xl font-bold text-gray-700">載入社團資料中...</h2>
        <p className="text-gray-500 mt-2">請稍候，正在為您準備最新資訊</p>
      </div>
    );
  }

  // 2. 登入與登出邏輯
  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formattedId = loginForm.studentId.trim().toUpperCase();
    const formattedName = loginForm.name.trim();
    const formattedClass = loginForm.className.trim();

    try {
      // 🔥 1. 呼叫 Server Action 進行後端 CSV 嚴格驗證
      const verifyResult = await verifyStudentLogin(formattedId, formattedName, formattedClass);

      if (!verifyResult.success) {
        // 驗證失敗：擋下登入，顯示錯誤訊息，且絕對不寫入 Firebase
        setSysMessage(`登入失敗：${verifyResult.message}`);
        setIsSubmitting(false);
        return; 
      }

      // 🔥 2. 驗證成功：放行，並寫入 Firebase 記錄
      const profile = { studentId: formattedId, name: formattedName, className: formattedClass };
      
      await setDoc(doc(db, 'students', formattedId), profile, { merge: true });
      localStorage.setItem('studentProfile', JSON.stringify(profile));
      setStudentProfile(profile); 
      setShowLoginModal(false);
      
      await checkStudentStatus(formattedId);
      setSysMessage(`歡迎回來，${formattedClass} ${formattedName}！`);

    } catch (error: any) { 
      setSysMessage(`系統錯誤：${error.message}`); 
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

  // 1. 定義這段解析函數 (可以放在元件內部的開頭)
  const resolveLocalImage = (filename: string | undefined) => {
    if (filename && filename.trim() !== '') {
      return `/clubs/${filename.trim()}`;
    }
    return '/clubs/default.jpg'; // 如果沒填，就抓 public/clubs/default.jpg
  };

  // 4. 計算熱度排行榜 (取登記人數最高的前 3 名)
  const trendingClubs = [...clubs]
    .sort((a, b) => (b.applied || 0) - (a.applied || 0))
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <nav className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-black text-indigo-700 tracking-tight">新生營 社團志願系統</h1>
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
                新生登入
              </button>
            )}
          </div>
        </div>
      </nav>

{/* 🍔 漢堡選單按鈕 (放在首頁明顯的地方，例如標題旁邊或頂部) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 font-bold rounded-lg shadow-sm border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          分類篩選
        </button>

        {/* 右側：排序工具群組 */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* 修正：加上 whitespace-nowrap 確保這四個字不會被擠到斷行 */}
          <span className="text-sm font-medium text-gray-500 whitespace-nowrap">排序方式：</span>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="flex-1 sm:flex-none border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer"
          >
            <option value="default">預設排序</option>
            <option value="name">名稱 (筆畫/拼音)</option>
            <option value="popularity">🔥 熱度 (登記人數)</option>
            <option value="probability">🎯 中籤機率</option>
            <option value="category">📁 依社團分類</option>
          </select>

          {/* 🔥 新增：升降冪切換按鈕 */}
          <button
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="p-2.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-indigo-600 transition-colors shadow-sm flex items-center justify-center flex-shrink-0"
            title={sortOrder === 'asc' ? "目前為升冪 (點擊切換降冪)" : "目前為降冪 (點擊切換升冪)"}
          >
            {sortOrder === 'asc' ? (
              // 升冪 Icon (由小到大)
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
            ) : (
              // 降冪 Icon (由大到小)
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ⬛ 側邊欄的黑色半透明遮罩 (點擊旁邊可關閉) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 📂 左側滑出抽屜 (Drawer) */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-indigo-50/50">
          <button onClick={() => setIsSidebarOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-3 overflow-y-auto flex-1">
          <div className="space-y-1">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => {
                  setSelectedCategory(category);
                  setIsSidebarOpen(false); // 點擊後自動收合抽屜
                }}
                className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-all ${
                  selectedCategory === category 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 系統訊息提示 */}
      {sysMessage && (
        <div className="max-w-7xl mx-auto mt-6 px-4">
          <div className={`p-4 rounded-lg font-medium shadow-sm flex items-center justify-between ${sysMessage.includes('成功') || sysMessage.includes('歡迎') ? 'bg-green-100 text-green-800 border-l-4 border-green-500' : 'bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500'}`}>
            {sysMessage}
            <button onClick={() => setSysMessage('')} className="text-xl leading-none opacity-50 hover:opacity-100">&times;</button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 mt-8">
        
        {/* 🔥 熱度排行榜區塊 */}
        {clubs.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-6">
              <h2 className="text-2xl font-bold text-gray-800">熱門社團排行</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {trendingClubs.map((club, index) => (
                <div 
                  key={`trend-${club.id}`} 
                  onClick={() => window.location.href = `/club/${club.id}`}
                  className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-1 shadow-lg transform transition hover:-translate-y-2 cursor-pointer hover:shadow-xl"
                >
                  <div className="bg-white h-full w-full rounded-xl p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-500">
                          #{index + 1}
                        </span>
                        <span className="bg-orange-100 text-orange-600 text-xs font-bold px-2 py-1 rounded-full">
                          {club.applied || 0} 人登記
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-gray-800 mb-2 tracking-tight break-all line-clamp-1" title={club.name}>
                        {club.name}
                      </h3>
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
            <h2 className="text-2xl font-bold text-gray-800">所有社團</h2>
          </div>
          
          {clubs.length === 0 ? (
            <div className="text-center py-20 text-gray-500">系統中目前沒有社團資料...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {sortedClubs.map((club) => {
                const isMyClub = myRegisteredClubId === club.id;
                const appliedCount = club.applied || 0;
                let rateText = "100%";
                if (appliedCount > club.capacity) {
                  rateText = `${((club.capacity / appliedCount) * 100).toFixed(1)}%`;
                }
                
                // 若資料庫沒有圖片與介紹，給予高質感的預設值
                const imageUrl = club.imageUrl || `https://picsum.photos/seed/${club.id}/400/250`;
                const description = club.description;

                return (
                  <div key={club.id} className={`flex flex-col bg-white rounded-2xl overflow-hidden transition-all duration-300 ${isMyClub ? 'ring-4 ring-indigo-500 shadow-xl scale-[1.02]' : 'shadow-sm hover:shadow-xl border border-gray-100'}`}>
                    
                    {/* 照片區塊 */}
                    <div className="h-40 w-full relative bg-gray-200">
                      <img 
                        src={resolveLocalImage(club.imageFile)} 
                        alt={club.name} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // 終極防禦：如果檔名打錯找不到圖片，立刻切換回預設圖，絕對不破圖
                          const target = e.target as HTMLImageElement;
                          if (!target.src.endsWith('/default.jpg')) {
                            target.src = '/clubs/default.jpg';
                          }
                        }}
                      />
                      {isMyClub && (
                        <div className="absolute top-3 right-3 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md animate-pulse">
                          ✅ 已登記志願
                        </div>
                      )}
                    </div>

                    {/* 內容區塊 */}
                    <div className="p-6 flex-1 flex flex-col">
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
                      {/* Hashtag 標籤區塊 */}
                      <div className="flex flex-wrap gap-1.5 mb-4 flex-1 items-start content-start">
                        
                        {/* 🌟 專屬大分類標籤 (使用玫瑰紅色系與星星 icon 區別) */}
                        {club.category && (
                          <span className="px-2.5 py-1 bg-rose-50 text-rose-600 text-xs font-bold rounded-md border border-rose-100">
                            ★ {club.category}
                          </span>
                        )}

                        {/* 原本的普通 Hashtags */}
                        {club.hashtags && club.hashtags.split(/[,，、]+/).filter(Boolean).map((tag: string, i: number) => (
                          <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-md border border-indigo-100">
                            #{tag.trim()}
                          </span>
                        ))}
                      </div>
                      
                      <div className="bg-gray-50 rounded-lg p-3 mb-5 text-sm text-gray-700 space-y-1.5 border">
                        <div className="flex justify-between"><span>總名額：</span><span className="font-medium">{club.capacity} 人</span></div>
                        <div className="flex justify-between"><span>已登記：</span><span className="font-medium">{appliedCount} 人</span></div>
                        <div className="flex justify-between">
                          <span>中選機率：</span>
                          <span className={`font-bold ${appliedCount > club.capacity ? "text-red-500" : "text-green-600"}`}>{rateText}</span>
                        </div>
                      </div>
                      
                      {/* 操作按鈕改為進入詳細頁面 */}
                        <button 
                          onClick={() => window.location.href = `/club/${club.id}`} 
                          className="w-full mt-4 py-2.5 rounded-xl font-bold bg-gray-100 hover:bg-indigo-600 hover:text-white text-gray-700 transition-all shadow-sm"
                        >
                          點我看詳細
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
              <h3 className="text-2xl font-bold text-white">新生登入</h3>
              <p className="text-indigo-200 text-sm mt-1">請輸入正確資料以進行志願選填</p>
            </div>
            <form onSubmit={handleStudentLogin} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">班級 (Class)</label>
                <input required type="text" value={loginForm.className} onChange={e => setLoginForm({...loginForm, className: e.target.value})} placeholder="請輸入您的班級" className="w-full border-gray-300 border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">姓名 (Name)</label>
                <input required type="text" value={loginForm.name} onChange={e => setLoginForm({...loginForm, name: e.target.value})} placeholder="請輸入您註冊的中文姓名" className="w-full border-gray-300 border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">學號 (Student ID)</label>
                <input required type="text" value={loginForm.studentId} onChange={e => setLoginForm({...loginForm, studentId: e.target.value})} placeholder="請輸入您的九碼學號" className="w-full border-gray-300 border px-4 py-2.5 rounded-xl uppercase focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
              </div>
              
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowLoginModal(false)} className="flex-1 px-4 py-2.5 border-2 border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md transition-colors">
                  {isSubmitting ? '處理中...' : '登入'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 🔥 新增：首頁最底部的更新倒數計時與免責說明 */}
      <footer className="mt-16 border-t border-gray-200 bg-white shadow-inner rounded-t-2xl pt-8 pb-10 px-4">
        <div className="max-w-md mx-auto text-center">
          {/* 免責說明 */}
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <p>提示：當前登記人數與中籤率非絕對即時資料。</p>
          </div>
          
          {/* 倒數計時顯示 */}
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-indigo-600 font-semibold bg-indigo-50/60 px-4 py-1.5 rounded-full border border-indigo-100">
            <span>🔄 系統將在</span>
            <span className="w-6 text-center font-black text-sm text-indigo-700 bg-white rounded shadow-sm border border-indigo-200 py-0.5">
              {countdown}
            </span>
            <span>秒後自動同步最新數據</span>
          </div>
        </div>
      </footer>
    </div>
  );
}