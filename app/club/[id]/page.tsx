// app/club/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebaseConfig';
import { registerClubTransaction, cancelRegistrationTransaction } from '../../../lib/clubService';

interface StudentProfile {
  studentId: string;
  name: string;
  className: string;
}

export default function ClubDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clubId = params.id as string;

  const [club, setClub] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sysMessage, setSysMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 學生狀態
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginForm, setLoginForm] = useState({ studentId: '', name: '', className: '' });
  const [myRegisteredClubId, setMyRegisteredClubId] = useState<string | null>(null);

  // 1. 抓取該社團資料
  const fetchClubData = async () => {
    try {
      const docRef = doc(db, 'clubs', clubId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setClub({ id: docSnap.id, ...docSnap.data() });
      } else {
        setSysMessage("❌ 找不到該社團資料");
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
      if (regDoc.exists()) {
        setMyRegisteredClubId(regDoc.data().clubId);
      } else {
        setMyRegisteredClubId(null);
      }
    } catch (error: any) {
      console.error("狀態查詢失敗:", error);
    }
  };

  useEffect(() => {
    fetchClubData();
    const savedProfile = localStorage.getItem('studentProfile');
    if (savedProfile) {
      const profile = JSON.parse(savedProfile);
      setStudentProfile(profile);
      checkStudentStatus(profile.studentId);
    }
  }, [clubId]);

  // 2. 登入邏輯
  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.studentId || !loginForm.name || !loginForm.className) return;
    setIsSubmitting(true);
    const formattedId = loginForm.studentId.trim().toUpperCase();
    const profile = { ...loginForm, studentId: formattedId };

    try {
      await setDoc(doc(db, 'students', formattedId), profile, { merge: true });
      localStorage.setItem('studentProfile', JSON.stringify(profile));
      setStudentProfile(profile);
      setShowLoginModal(false);
      setSysMessage(`歡迎，${profile.name}！`);
      await checkStudentStatus(formattedId);
    } catch (error: any) {
      setSysMessage(`登入失敗：${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. 報名與退選
  const handleRegister = async () => {
    if (!studentProfile) {
      setShowLoginModal(true);
      return;
    }
    setIsSubmitting(true);
    const result = await registerClubTransaction(studentProfile.studentId, clubId);
    setSysMessage(result.message);
    if (result.success) {
      setMyRegisteredClubId(clubId);
      await fetchClubData(); // 更新人數
    }
    setIsSubmitting(false);
  };

  const handleCancelRegister = async () => {
    if (!studentProfile || !window.confirm(`確定要退選「${club.name}」嗎？`)) return;
    setIsSubmitting(true);
    const result = await cancelRegistrationTransaction(studentProfile.studentId, clubId);
    setSysMessage(result.message);
    if (result.success) {
      setMyRegisteredClubId(null);
      await fetchClubData(); // 更新人數
    }
    setIsSubmitting(false);
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-xl text-gray-500">載入社團資料中...</div>;
  if (!club) return <div className="min-h-screen flex flex-col items-center justify-center"><h1 className="text-2xl mb-4">社團不存在</h1><button onClick={() => router.push('/')} className="text-indigo-600 underline">返回首頁</button></div>;

  const appliedCount = club.applied || 0;
  const isMyClub = myRegisteredClubId === club.id;
  const imageUrl = club.imageUrl || `https://picsum.photos/seed/${club.id}/1200/400`;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <nav className="bg-white shadow-sm p-4 flex justify-between items-center sticky top-0 z-40">
        <button onClick={() => router.push('/')} className="text-indigo-600 font-bold hover:underline flex items-center gap-1">
          ← 返回首頁
        </button>
        {studentProfile ? (
          <div className="text-sm font-medium text-gray-700">{studentProfile.className} {studentProfile.name}</div>
        ) : (
          <button onClick={() => setShowLoginModal(true)} className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-bold rounded-full">新生登入</button>
        )}
      </nav>

      {sysMessage && (
        <div className="max-w-4xl mx-auto mt-4 px-4">
          <div className={`p-4 rounded-lg font-medium shadow-sm flex items-center justify-between ${sysMessage.includes('成功') || sysMessage.includes('歡迎') ? 'bg-green-100 text-green-800 border-l-4 border-green-500' : 'bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500'}`}>
            {sysMessage}
            <button onClick={() => setSysMessage('')} className="text-xl opacity-50">&times;</button>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 mt-8">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="h-64 md:h-96 w-full relative bg-gray-200">
            <img src={imageUrl} alt={club.name} className="w-full h-full object-cover" />
            {isMyClub && <div className="absolute top-4 right-4 bg-indigo-600 text-white font-bold px-4 py-2 rounded-full shadow-lg text-lg animate-pulse">你已登記此社團</div>}
          </div>
          
          <div className="p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h1 className="text-4xl font-black text-gray-800">{club.name}</h1>
              {club.clubLink && (
                <a href={club.clubLink} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2">
                  🔗 前往社團專頁
                </a>
              )}
            </div>

            <p className="text-lg text-gray-600 mb-8 whitespace-pre-wrap leading-relaxed">
              {club.description}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-gray-50 p-4 rounded-xl border">
                <p className="text-sm text-gray-500 mb-1">總名額</p>
                <p className="text-2xl font-bold text-gray-800">{club.capacity} 人</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border">
                <p className="text-sm text-gray-500 mb-1">目前登記人數</p>
                <p className="text-2xl font-bold text-gray-800">{appliedCount} 人</p>
              </div>
              <div className={`p-4 rounded-xl border ${appliedCount > club.capacity ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                <p className={`text-sm mb-1 ${appliedCount > club.capacity ? 'text-red-500' : 'text-green-600'}`}>目前中選機率</p>
                <p className={`text-2xl font-bold ${appliedCount > club.capacity ? 'text-red-600' : 'text-green-700'}`}>
                  {appliedCount > club.capacity ? `${((club.capacity / appliedCount) * 100).toFixed(1)}%` : '100%'}
                </p>
              </div>
            </div>

            <div className="border-t pt-8">
              {isMyClub ? (
                <button onClick={handleCancelRegister} disabled={isSubmitting} className="w-full py-4 rounded-xl text-lg text-indigo-700 font-bold bg-indigo-50 border-2 border-indigo-200 hover:bg-indigo-100 transition-colors">
                  取消登記
                </button>
              ) : (
                <button onClick={handleRegister} disabled={isSubmitting || myRegisteredClubId !== null} className={`w-full py-4 rounded-xl text-lg font-bold transition-all shadow-sm ${myRegisteredClubId !== null ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-800 hover:bg-black text-white hover:shadow-lg transform hover:-translate-y-1'}`}>
                  {myRegisteredClubId !== null ? '您已選填其他社團，請先退選' : '我要登記此社團！'}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 登入 Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-indigo-600 p-6 text-center">
              <h3 className="text-2xl font-bold text-white">新生登入</h3>
            </div>
            <form onSubmit={handleStudentLogin} className="p-6 space-y-4">
              <input required type="text" value={loginForm.className} onChange={e => setLoginForm({...loginForm, className: e.target.value})} placeholder="班級 " className="w-full border px-4 py-2.5 rounded-xl" />
              <input required type="text" value={loginForm.name} onChange={e => setLoginForm({...loginForm, name: e.target.value})} placeholder="姓名" className="w-full border px-4 py-2.5 rounded-xl" />
              <input required type="text" value={loginForm.studentId} onChange={e => setLoginForm({...loginForm, studentId: e.target.value})} placeholder="學號" className="w-full border px-4 py-2.5 rounded-xl uppercase" />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowLoginModal(false)} className="flex-1 px-4 py-2.5 bg-gray-100 font-bold rounded-xl hover:bg-gray-200">取消</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700">登入並報名</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}