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
  };

  const handleCancelRegister = async () => {
    if (!studentProfile || !window.confirm(`確定要退選「${club.name}」嗎？`)) return;
    setIsSubmitting(true);
    const result = await cancelRegistrationTransaction(studentProfile.studentId, clubId);
    setSysMessage(result.message);
    if (result.success) { setMyRegisteredClubId(null); await fetchClubData(); }
    setIsSubmitting(false);
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">載入中...</div>;
  if (!club) return <div className="min-h-screen flex flex-col items-center justify-center"><h1>社團不存在</h1></div>;

  const appliedCount = club.applied || 0;
  const isMyClub = myRegisteredClubId === club.id;
  const resolveImage = (url: string | undefined | null) => (url && url.trim() !== '') ? url.trim() : '/clubs/default.jpg';

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <nav className="bg-white shadow-sm p-4 flex justify-between items-center sticky top-0 z-40">
        <button onClick={() => router.push('/')} className="text-indigo-600 font-bold">← 返回首頁</button>
        {studentProfile ? <div className="text-sm">{studentProfile.className} {studentProfile.name}</div> : <button onClick={() => setShowLoginModal(true)} className="px-4 py-1.5 bg-indigo-600 text-white rounded-full">登入</button>}
      </nav>
      {sysMessage && <div className="max-w-4xl mx-auto mt-4 px-4"><div className="p-4 bg-yellow-100">{sysMessage}</div></div>}

      <main className="max-w-4xl mx-auto px-4 mt-8">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="h-64 md:h-96 w-full relative bg-gray-200">
            <img src={resolveImage(club.imageUrl)} alt={club.name} className="w-full h-full object-cover" onError={e => (e.target as HTMLImageElement).src = '/clubs/default.jpg'} />
            {isMyClub && <div className="absolute top-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-full">✔️ 你已登記此社團</div>}
          </div>
          <div className="p-8">
            <h1 className="text-4xl font-black text-gray-800 mb-6">{club.name}</h1>
            <p className="text-lg text-gray-600 mb-8 whitespace-pre-wrap">{club.description || "歡迎加入我們！"}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="bg-gray-50 p-4 rounded-xl border"><p className="text-sm text-gray-500">總名額</p><p className="text-2xl font-bold">{club.capacity} 人</p></div>
              <div className="bg-gray-50 p-4 rounded-xl border"><p className="text-sm text-gray-500">目前登記人數</p><p className="text-2xl font-bold">{appliedCount} 人</p></div>
            </div>
            <div className="border-t pt-8">
              {isMyClub ? <button onClick={handleCancelRegister} disabled={isSubmitting} className="w-full py-4 rounded-xl text-lg text-indigo-700 bg-indigo-50 border-2">取消登記 (退選)</button>
              : <button onClick={handleRegister} disabled={isSubmitting || myRegisteredClubId !== null} className={`w-full py-4 rounded-xl text-lg font-bold text-white ${myRegisteredClubId !== null ? 'bg-gray-400' : 'bg-gray-800 hover:bg-black'}`}>{myRegisteredClubId !== null ? '您已選填其他社團' : '我要登記此社團！'}</button>}
            </div>
          </div>
        </div>
      </main>

      {showLoginModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6"><h3 className="text-2xl font-bold mb-4">登入</h3>
            <form onSubmit={handleStudentLogin} className="space-y-4">
              <input required value={loginForm.className} onChange={e => setLoginForm({...loginForm, className: e.target.value})} placeholder="班級" className="w-full border p-2" />
              <input required value={loginForm.name} onChange={e => setLoginForm({...loginForm, name: e.target.value})} placeholder="姓名" className="w-full border p-2" />
              <input required value={loginForm.studentId} onChange={e => setLoginForm({...loginForm, studentId: e.target.value})} placeholder="學號" className="w-full border p-2" />
              <div className="flex gap-2"><button type="button" onClick={() => setShowLoginModal(false)} className="flex-1 bg-gray-200 p-2">取消</button><button type="submit" className="flex-1 bg-indigo-600 text-white p-2">登入</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}