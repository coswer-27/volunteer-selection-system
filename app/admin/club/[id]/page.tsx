// app/admin/club/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../../../lib/firebaseConfig';
import { saveClubAction } from '../../actions'; // 引入原本寫好的更新邏輯

export default function AdminClubEditPage() {
  const params = useParams();
  const router = useRouter();
  const clubId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState('');
  const [clubLink, setClubLink] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push('/admin'); // 沒登入就踢回後台首頁
      } else {
        fetchClubData();
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchClubData = async () => {
    try {
      const docRef = doc(db, 'clubs', clubId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setName(data.name || '');
        setCapacity(data.capacity?.toString() || '');
        setDescription(data.description || '');
        setImageFile(data.imageFile || '');
        setClubLink(data.clubLink || '');
      } else {
        setMessage("找不到該社團資料");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('正在更新社團資料...');
    const result = await saveClubAction(clubId, name, Number(capacity), description, imageFile, clubLink);
    setMessage(result.message);
    setIsSubmitting(false);
    
    if (result.success) {
      setTimeout(() => router.push('/admin'), 1500); // 成功後自動跳轉回表格
    }
  };

  if (isLoading) return <div className="p-10 text-center">載入資料中...</div>;

  return (
    <div className="max-w-3xl mx-auto p-8 mt-10">
      <div className="flex items-center gap-4 mb-8 border-b pb-4">
        <button onClick={() => router.push('/admin')} className="text-gray-500 hover:text-indigo-600 font-bold text-xl">←</button>
        <h1 className="text-3xl font-bold text-gray-800">編輯社團 - {name}</h1>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded font-medium ${message.includes('成功') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleUpdate} className="bg-white p-8 rounded-xl shadow border space-y-6">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">社團名稱 *</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="w-full md:w-32">
            <label className="block text-sm font-medium text-gray-700 mb-1">總名額 *</label>
            <input required type="number" min="1" value={capacity} onChange={e => setCapacity(e.target.value)} className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">本機圖片檔名 (如: dance.png)</label>
            <input type="text" value={imageFile} onChange={e => setImageFile(e.target.value)} placeholder="留白則使用 default.jpg" className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">粉專連結 (URL)</label>
            <input type="url" value={clubLink} onChange={e => setClubLink(e.target.value)} className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">社團簡介</label>
          <textarea rows={6} value={description} onChange={e => setDescription(e.target.value)} className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-y" placeholder="輸入一段吸引人的社團簡介..."></textarea>
        </div>

        <div className="pt-4 border-t flex justify-end gap-4">
          <button type="button" onClick={() => router.push('/admin')} className="px-6 py-2.5 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300">取消</button>
          <button type="submit" disabled={isSubmitting} className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md">
            {isSubmitting ? '儲存中...' : '修改'}
          </button>
        </div>
      </form>
    </div>
  );
}