'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../../../lib/firebaseConfig';
import { saveClubAction } from '../../actions'; 

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
  const [imageFile, setImageFile] = useState(''); // 現在用來儲存逗號分隔的多張照片
  const [clubLink, setClubLink] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push('/admin'); 
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
        setClubLink(data.clubLink || '');
        setHashtags(data.hashtags || '');
        
        // 🔥 修復 1：讀取社團分類
        setNewCategory(data.category || ''); 
        
        // 🔥 修復 2：支援多張圖片讀取 (如果資料庫有 images 陣列，就用逗號串接起來顯示在輸入框)
        if (data.images && Array.isArray(data.images)) {
          setImageFile(data.images.join(', '));
        } else {
          setImageFile(data.imageFile || '');
        }
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
    
    // 呼叫更新 Action
    const result = await saveClubAction(clubId, name, Number(capacity), description, imageFile, clubLink, hashtags, newCategory);
    
    setMessage(result.message);
    setIsSubmitting(false);
    
    if (result.success) {
      setTimeout(() => router.push('/admin'), 1500); 
    }
  };

  if (isLoading) return <div className="p-10 text-center font-bold text-gray-500">載入資料中...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 mt-6">
      <div className="flex items-center gap-4 mb-8 border-b pb-4">
        <button onClick={() => router.push('/admin')} className="text-gray-400 hover:text-indigo-600 font-bold text-2xl transition-colors">&larr;</button>
        <h1 className="text-3xl font-black text-gray-800">編輯社團 <span className="text-indigo-600">{name}</span></h1>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-xl font-bold shadow-sm ${message.includes('成功') ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-yellow-100 text-yellow-800 border border-yellow-200'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleUpdate} className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 space-y-6">
        
        {/* 第一排：名稱與名額 */}
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-[2]">
            <label className="block text-sm font-bold text-gray-700 mb-1">社團名稱 <span className="text-red-500">*</span></label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-bold text-gray-700 mb-1">社團分類</label>
            <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="如: 學術性" className="w-full border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-bold text-gray-700 mb-1">總名額 <span className="text-red-500">*</span></label>
            <input required type="number" min="1" value={capacity} onChange={e => setCapacity(e.target.value)} className="w-full border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
          </div>
        </div>

        {/* 第二排：圖片、連結、標籤 */}
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-[2]">
            <label className="block text-sm font-bold text-gray-700 mb-1">本機圖片檔名 (多張請用逗號分隔)</label>
            <input type="text" value={imageFile} onChange={e => setImageFile(e.target.value)} placeholder="a.jpg, b.jpg, c.png" className="w-full border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
          </div>
          <div className="flex-[2]">
            <label className="block text-sm font-bold text-gray-700 mb-1">粉專連結 (URL)</label>
            <input type="url" value={clubLink} onChange={e => setClubLink(e.target.value)} placeholder="https://instagram.com/..." className="w-full border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
          </div>
          <div className="flex-[2]">
            <label className="block text-sm font-bold text-gray-700 mb-1">Hashtags 標籤 (逗號分隔)</label>
            <input type="text" value={hashtags} onChange={e => setHashtags(e.target.value)} className="w-full border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="音樂,表演,迎新" />
          </div>
        </div>
        
        {/* 第三排：簡介 */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">社團簡介</label>
          <textarea rows={6} value={description} onChange={e => setDescription(e.target.value)} className="w-full border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-y transition-all leading-relaxed" placeholder="輸入一段吸引人的社團簡介..."></textarea>
        </div>

        {/* 按鈕列 */}
        <div className="pt-6 border-t border-gray-100 flex justify-end gap-4">
          <button type="button" onClick={() => router.push('/admin')} className="px-6 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors">取消</button>
          <button type="submit" disabled={isSubmitting} className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed">
            {isSubmitting ? '儲存中...' : '儲存修改'}
          </button>
        </div>
      </form>
    </div>
  );
}