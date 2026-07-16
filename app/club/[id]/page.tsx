'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebaseConfig';
import { registerClubTransaction, cancelRegistrationTransaction } from '../../../lib/clubService';
import { verifyStudentLogin } from '../../../app/actions/auth';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [gallery, setGallery] = useState<string[]>([]);


  const detectAdditionalImages = async (filename: string) => {
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex === -1) return;

    const baseName = filename.substring(0, dotIndex);
    const ext = filename.substring(dotIndex); 
    const validImages = [`/clubs/${filename}`];
    
    for (let i = 1; i <= 5; i++) {
      const testUrl = `/clubs/${baseName}_${i}${ext}`;
      try {
        const res = await fetch(testUrl, { method: 'HEAD' });
        if (res.ok) validImages.push(testUrl);
        else break;
      } catch (error) { break; }
    }
    setGallery(validImages);
  };

  const fetchClubData = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'clubs', clubId));
      if (docSnap.exists()) {
        const clubData: any = { id: docSnap.id, ...docSnap.data() };
        setClub(clubData);
        
        const baseImg = clubData.imageFile?.trim();
        if (baseImg) {
          setGallery([`/clubs/${baseImg}`]);
          detectAdditionalImages(baseImg);
        } else {
          setGallery(['/clubs/default.jpg']);
        }
      } else {
        setSysMessage("找不到該社團資料");
      }
    } catch (error) { 
      console.error(error); 
    } finally { 
      setIsLoading(false); 
    }
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
    const formattedName = loginForm.name.trim();
    const formattedClass = loginForm.className.trim();

    try {
      const verifyResult = await verifyStudentLogin(formattedId, formattedName, formattedClass);

      if (!verifyResult.success) {
        setSysMessage(`登入失敗：${verifyResult.message}`);
        setIsSubmitting(false);
        return; 
      }

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

  const handleRegister = async () => {
    if (!studentProfile) return setShowLoginModal(true);
    setIsSubmitting(true);
    const result = await registerClubTransaction(studentProfile.studentId, clubId);
    setSysMessage(result.message);
    if (result.success) { setMyRegisteredClubId(clubId); await fetchClubData(); }
    setIsSubmitting(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = () => {
    localStorage.removeItem("studentProfile");
    setStudentProfile(null);
    setMyRegisteredClubId(null);
    setSysMessage("已成功登出。");
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

  const nextImage = () => setCurrentImageIndex((prev) => (prev + 1) % gallery.length);
  const prevImage = () => setCurrentImageIndex((prev) => (prev - 1 + gallery.length) % gallery.length);
// 🔥 處理拖拽結束的手勢判定邏輯
  const handleDragEnd = (_: any, info: any) => {
    const swipeThreshold = 50; // 拖動超過 50px 就觸發翻頁
    if (info.offset.x < -swipeThreshold) {
      nextImage(); // 向左滑，看下一張
    } else if (info.offset.x > swipeThreshold) {
      prevImage(); // 向右滑，看上一張
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <nav className="bg-white shadow-sm sticky top-0 z-40">
        {/* Navbar */}
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-black tracking-tight text-[#ff3d00]">
            新生營 社團志願系統
          </h1>

          {studentProfile ? (
            <div className="flex items-center gap-4">
              <div className="hidden text-right text-sm text-black md:block">
                <p className="font-bold">{studentProfile.name}</p>
                <p>{studentProfile.className} - {studentProfile.studentId}</p>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-full bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
              >
                登出
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="rounded-full bg-indigo-600 px-6 py-2 font-medium text-white shadow-md transition-transform hover:scale-105 hover:bg-indigo-700"
            >
              新生登入
            </button>
          )}
        </div>
      </nav>

      {sysMessage && (
        <div className="max-w-3xl mx-auto mt-6 px-4">
          <div className={`p-4 rounded-xl font-bold shadow-sm ${sysMessage.includes('成功') ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-yellow-100 text-yellow-800 border border-yellow-200'}`}>
            {sysMessage}
            <button onClick={() => setSysMessage('')} className="float-right hover:opacity-70">&times;</button>
          </div>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 mt-6">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col">
          <div className="w-full relative bg-gray-900 group h-[260px] sm:h-[400px]">
            <AnimatePresence initial={false} mode="wait">
              <motion.img
                key={currentImageIndex}
                src={gallery[currentImageIndex]}
                alt={club.name}
                drag={gallery.length > 1 ? "x" : false} // 只有多張圖時才允許橫向拖動
                dragConstraints={{ left: 0, right: 0 }} // 限制拖動範圍，放手時會彈回
                dragElastic={0.7}                      // 邊界彈性滑順度
                onDragEnd={handleDragEnd}               // 綁定結束手勢判定
                initial={{ opacity: 0.3 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.3 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full object-cover cursor-grab active:cursor-grabbing"
                style={{ x: 0 }}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (!target.src.endsWith('/default.jpg')) target.src = '/clubs/default.jpg';
                }}
              />
              {club.category && (
                <span className="absolute top-3 left-3 px-2.5 py-1 bg-rose-600 text-white text-xs font-black rounded-lg shadow-md">
                  ★ {club.category}
                </span>
              )}
            </AnimatePresence>
    
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
                  {gallery.map((_: string, idx: number) => (
                    <div key={idx} className={`h-2.5 w-2.5 rounded-full shadow-md transition-all ${idx === currentImageIndex ? 'bg-white scale-125' : 'bg-white/50 hover:bg-white/80'}`} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ============================== */}
          {/* 下方：社團詳細資訊區             */}
          {/* ============================== */}
          <div className="p-6 sm:p-10 flex flex-col">
            
            {/* 1. 分類與 Hashtags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {club.hashtags && club.hashtags.split(/[,，、]+/).filter(Boolean).map((tag: string, i: number) => (
                <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-600 text-sm font-bold rounded-lg border border-indigo-100">
                  #{tag.trim()}
                </span>
              ))}
            </div>

            {/* 2. 標題與簡介 */}
            <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mb-6">{club.name}</h1>
            <p className="text-lg text-gray-600 leading-relaxed mb-8 whitespace-pre-wrap">
              {club.description || "歡迎加入我們！"}
            </p>

            {/* 3. 🔥 修正：粉專連結改為 Instagram 風格 */}
            {club.clubLink && (
              <a 
                href={club.clubLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex justify-center items-center gap-2 bg-gradient-to-r from-purple-50 via-pink-50 to-orange-50 text-pink-700 hover:from-purple-100 hover:to-orange-100 font-bold py-3 px-6 rounded-xl transition-all mb-8 w-fit border border-pink-200/60 shadow-sm"
              >
                {/* Instagram SVG Icon */}
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                前往社團 Instagram
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

            {/* 5. 報名與退選操作區塊 */}
            <div className="border-t border-gray-100 pt-8 mt-4">
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

      {/* 登入彈跳視窗 */}
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
                <input required type="text" value={loginForm.className} onChange={(e) => setLoginForm({ ...loginForm, className: e.target.value })} placeholder="請輸入您的班級" className="w-full border-gray-300 border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">姓名 (Name)</label>
                <input required type="text" value={loginForm.name} onChange={(e) => setLoginForm({ ...loginForm, name: e.target.value })} placeholder="請輸入您註冊的中文姓名" className="w-full border-gray-300 border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">學號 (Student ID)</label>
                <input required type="text" value={loginForm.studentId} onChange={(e) => setLoginForm({ ...loginForm, studentId: e.target.value })} placeholder="請輸入您的九碼學號" className="w-full border-gray-300 border px-4 py-2.5 rounded-xl uppercase focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowLoginModal(false)} className="flex-1 px-4 py-2.5 border-2 border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors">取消</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md transition-colors">{isSubmitting ? "處理中..." : "登入"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}