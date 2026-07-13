'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebaseConfig';
import { registerClubTransaction, cancelRegistrationTransaction } from '../../../lib/clubService';

interface StudentProfile { studentId: string; name: string; className: string; }

export default function ClubDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clubId = params.id as string;

  const [club, setClub] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sysMessage, setSysMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginForm, setLoginForm] = useState({ studentId: '', name: '', className: '' });
  const [myRegisteredClubId, setMyRegisteredClubId] = useState<string | null>(null);

  // 🔥 照片輪播的狀態 (記錄目前顯示第幾張圖)
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const fetchClubData = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'clubs', clubId));
      if (docSnap.exists()) setClub({ id: docSnap.id, ...docSnap.data() });
      else setSysMessage("❌ 找不到該社團資料");
    } catch (error) { console.error(error); } 
    finally { setIsLoading(false); }
  };

  const checkStudentStatus = async (sId: string) => {
    try {
      const regDoc = await getDoc(doc(db, 'registrations', sId));
      setMyRegisteredClubId(regDoc.exists() ? regDoc.data().clubId : null);
    } catch (error) { console.error(error); }
  };

  useEffect(() => {
    fetchClubData();
    const saved = localStorage.getItem('studentProfile');
    if (saved) {
      const profile = JSON.parse(saved);
      setStudentProfile(profile); checkStudentStatus(profile.studentId);
    }
  }, [clubId]);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formattedId = loginForm.studentId.trim().toUpperCase();
    const profile = { ...loginForm, studentId: formattedId };
    try {
      await setDoc(doc(db, 'students', formattedId), profile, { merge: true });
      localStorage.setItem('studentProfile', JSON.stringify(profile));
      setStudentProfile(profile); setShowLoginModal(false);
      await checkStudentStatus(formattedId);
    } catch (error: any) { setSysMessage(`登入失敗：${error.message}`); } 
    finally { setIsSubmitting(false); }
  };

  const handleRegister = async () => {
    if (!studentProfile) return setShowLoginModal(true);
    setIsSubmitting(true);
    const result = await registerClubTransaction(studentProfile.studentId, clubId);
    setSysMessage(result.message);
    if (result.success) { setMyRegisteredClubId(clubId); await fetchClubData(); }
    setIsSubmitting(false);
    window.scrollTo({ top: 0, behavior: 'smooth' }); // 操作後滾動到頂部看訊息
  };

  const handleCancelRegister = async () => {
    if (!studentProfile || !window.confirm(`確定要退選「${club.name}」嗎？`)) return;
    setIsSubmitting(true);
    const result = await cancelRegistrationTransaction(studentProfile.studentId, clubId);
    setSysMessage(result.message);
    if (result.success) { setMyRegisteredClubId(null); await fetchClubData(); }
    setIsSubmitting(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">載入中...</div>;
  if (!club) return <div className="min-h-screen flex flex-col items-center justify-center font-bold text-red-500"><h1>社團不存在</h1></div>;

  const appliedCount = club.applied || 0;
  const isMyClub = myRegisteredClubId === club.id;

  // 確保將檔名轉換為 public 靜態目錄的絕對路徑
  const resolveLocalImage = (filename: string | undefined | null) => {
    if (filename && filename.trim() !== '') {
      return `/clubs/${filename.trim()}`;
    }
    return '/clubs/default.jpg';
  };

  // 🔥 輪播圖陣列邏輯：有 images 陣列就用，沒有就拿單張 imageFile 塞進陣列
  const gallery = Array.isArray(club.images) && club.images.length > 0 
    ? club.images.map(resolveLocalImage) 
    : [resolveLocalImage(club.imageFile)];

  const nextImage = () => setCurrentImageIndex((prev) => (prev + 1) % gallery.length);
  const prevImage = () => setCurrentImageIndex((prev) => (prev - 1 + gallery.length) % gallery.length);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* 頂部導覽列 (保留你原本的邏輯) */}
      <nav className="bg-white shadow-sm p-4 flex justify-between items-center sticky top-0 z-40">
        <button onClick={() => router.push('/')} className="text-indigo-600 font-bold hover:text-indigo-800 transition-colors">
          ← 返回首頁
        </button>
        {studentProfile ? (
          <div className="text-sm font-bold text-gray-700 bg-gray-100 px-4 py-2 rounded-full">
            {studentProfile.className} {studentProfile.name}
          </div>
        ) : (
          <button onClick={() => setShowLoginModal(true)} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full transition-colors shadow-sm">
            學生登入
          </button>
        )}
      </nav>

      {/* 系統訊息提示 */}
      {sysMessage && (
        <div className="max-w-6xl mx-auto mt-6 px-4">
          <div className={`p-4 rounded-xl font-bold shadow-sm ${sysMessage.includes('成功') ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-yellow-100 text-yellow-800 border border-yellow-200'}`}>
            {sysMessage}
            <button onClick={() => setSysMessage('')} className="float-right hover:opacity-70">&times;</button>
          </div>
        </div>
      )}

      {/* 主要內容區 */}
      <main className="max-w-6xl mx-auto px-4 mt-6">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col md:flex-row">
          
          {/* ============================== */}
          {/* 左側：照片輪播區 (Carousel)      */}
          {/* ============================== */}
          <div className="w-full md:w-1/2 relative bg-gray-900 group h-80 md:h-auto min-h-[400px]">
            <img 
              src={gallery[currentImageIndex]} 
              alt={club.name} 
              className="w-full h-full object-cover transition-opacity duration-500"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.src.endsWith('/default.jpg')) target.src = '/clubs/default.jpg';
              }}
            />
            
            {/* 你已登記的徽章提示 */}
            {isMyClub && (
              <div className="absolute top-4 left-4 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg z-20 font-bold animate-pulse">
                ✔️ 你已登記此社團
              </div>
            )}
            
            {/* 左右切換箭頭與下方圓點 */}
            {gallery.length > 1 && (
              <>
                <button onClick={prevImage} className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10">
                  &larr;
                </button>
                <button onClick={nextImage} className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10">
                  &rarr;
                </button>
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-10">
                  {gallery.map((_:string, idx:number) => (
                    <div key={idx} className={`h-2.5 w-2.5 rounded-full shadow-md transition-all ${idx === currentImageIndex ? 'bg-white scale-125' : 'bg-white/50 hover:bg-white/80'}`} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ============================== */}
          {/* 右側：社團詳細資訊區             */}
          {/* ============================== */}
          <div className="w-full md:w-1/2 p-8 md:p-10 flex flex-col">
            
            {/* 1. 分類與 Hashtags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {club.category && (
                <span className="px-3 py-1 bg-rose-100 text-rose-700 text-sm font-black rounded-lg">
                  ★ {club.category}
                </span>
              )}
              {club.hashtags && club.hashtags.split(/[,，、]+/).filter(Boolean).map((tag: string, i: number) => (
                <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-600 text-sm font-bold rounded-lg border border-indigo-100">
                  #{tag.trim()}
                </span>
              ))}
            </div>

            {/* 2. 標題與簡介 */}
            <h1 className="text-4xl font-black text-gray-900 mb-6">{club.name}</h1>
            <p className="text-lg text-gray-600 leading-relaxed mb-8 flex-1 whitespace-pre-wrap">
              {club.description || "歡迎加入我們！"}
            </p>

            {/* 3. 粉專連結 (如果有的話) */}
            {club.clubLink && (
              <a 
                href={club.clubLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex justify-center items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold py-3 px-6 rounded-xl transition-colors mb-8 w-fit border border-blue-200"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                前往社團粉專
              </a>
            )}

            {/* 4. 數據看板 */}
            <div className="bg-gray-50 rounded-xl p-5 mb-8 border border-gray-200 grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 font-medium mb-1">總名額</p>
                <p className="text-2xl font-bold text-gray-800">{club.capacity} <span className="text-base font-normal">人</span></p>
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium mb-1">已登記</p>
                <p className="text-2xl font-bold text-indigo-600">{appliedCount} <span className="text-base font-normal">人</span></p>
              </div>
            </div>

            {/* 5. 報名與退選操作區塊 (保留你原本的邏輯) */}
            <div className="border-t border-gray-100 pt-8 mt-auto">
              {isMyClub ? (
                <button 
                  onClick={handleCancelRegister} 
                  disabled={isSubmitting} 
                  className="w-full py-4 rounded-xl text-lg font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border-2 border-rose-200 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? '處理中...' : '取消登記 (退選)'}
                </button>
              ) : (
                <button 
                  onClick={handleRegister} 
                  disabled={isSubmitting || myRegisteredClubId !== null} 
                  className={`w-full py-4 rounded-xl text-lg font-bold text-white transition-all shadow-md ${
                    myRegisteredClubId !== null 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-gray-900 hover:bg-indigo-600 hover:shadow-lg transform hover:-translate-y-1'
                  }`}
                >
                  {isSubmitting ? '處理中...' : myRegisteredClubId !== null ? '您已選填其他社團' : '我要登記此社團！'}
                </button>
              )}
            </div>

          </div>
        </div>
      </main>

      {/* 登入彈跳視窗 (保留你原本的邏輯) */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="bg-indigo-600 p-6 text-center text-white">
              <h3 className="text-2xl font-bold mb-1">學生登入</h3>
              <p className="text-indigo-200 text-sm">請輸入學號與姓名</p>
            </div>
            <form onSubmit={handleStudentLogin} className="p-6 space-y-4">
              <input required value={loginForm.className} onChange={e => setLoginForm({...loginForm, className: e.target.value})} placeholder="班級 (例如: 資工三A)" className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              <input required value={loginForm.name} onChange={e => setLoginForm({...loginForm, name: e.target.value})} placeholder="真實姓名" className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              <input required value={loginForm.studentId} onChange={e => setLoginForm({...loginForm, studentId: e.target.value})} placeholder="學號" className="w-full border border-gray-300 rounded-lg p-3 uppercase outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowLoginModal(false)} className="flex-1 bg-gray-100 text-gray-700 font-bold rounded-lg p-3 hover:bg-gray-200 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-indigo-600 text-white font-bold rounded-lg p-3 shadow-md hover:bg-indigo-700 transition-colors disabled:bg-indigo-400">
                  {isSubmitting ? '登入中...' : '確認登入'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}