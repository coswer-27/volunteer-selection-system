// app/admin/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../../lib/firebaseConfig';
// 引入包含社團 CRUD 的 Server Actions
import { runRandomDrawOnServer, saveClubAction, deleteClubAction, importClubsBulkAction, clearAllRegistrationsAction, clearAllClubsAction } from './actions';
import Papa from 'papaparse';
import { useRef } from 'react';

export default function AdminPage() {
  // 身分驗證狀態
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null); // 👈 加入這行控制隱藏的檔案上傳

  // 社團列表與控制狀態
  const [clubs, setClubs] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  // 🔥 核心補回：新增與修改社團所需的表單狀態
  const [newClubName, setNewClubName] = useState('');
  const [newCapacity, setNewCapacity] = useState('');
  const [newDescription, setNewDescription] = useState(''); // 新增：介紹
  const [newImageFile, setNewImageFile] = useState('');
  const [newClubLink, setNewClubLink] = useState(''); // 👈 新增這行
  const [newHashtags, setNewHashtags] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');

  // 名單檢視狀態
  const [selectedClubForList, setSelectedClubForList] = useState<any>(null);
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);

  // 監聽登入狀態
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 抓取社團清單
  const fetchClubs = async () => {
    if (!auth.currentUser) return;
    try {
      const querySnapshot = await getDocs(collection(db, 'clubs'));
      setClubs(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) { 
      console.error(error); 
    }
  };

  useEffect(() => { 
    fetchClubs(); 
  }, [user]);

  // 處理管理員登入
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setIsLoggingIn(true); 
    setAuthError('');
    try { 
      await signInWithEmailAndPassword(auth, email, password); 
    } catch { 
      setAuthError('帳號或密碼錯誤！'); 
    } finally { 
      setIsLoggingIn(false); 
    }
  };

  const handleSaveClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClubName.trim() || !newCapacity) {
      setMessage("⚠️ 請填寫完整的社團名稱與總名額！");
      return;
    }
    setIsSubmitting(true);
    setMessage("正在同步更新社團資料...");

    const result = await saveClubAction(editingId, newClubName, Number(newCapacity), newDescription, newImageFile, newClubLink, newHashtags, newCategory);
    
    setMessage(result.message);
    if (result.success) {
      setTransitToCreate();
      await fetchClubs(); 
    }
    setIsSubmitting(false);
  };

  const setTransitToEdit = (club: any) => {
    setEditingId(club.id);
    setNewClubName(club.name);
    setNewCapacity(club.capacity.toString());
    setNewDescription(club.description || ''); // 帶入介紹
    setNewImageFile(club.imageUrl || '');       // 帶入圖片
    setNewClubLink(club.clubLink || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setTransitToCreate = () => {
    setEditingId(null);
    setNewClubName('');
    setNewCapacity('');
    setNewDescription(''); // 清空介紹
    setNewImageFile('');    // 清空圖片
    setNewClubLink('');
    setNewHashtags('');
  };

  // 🔥 處理單一社團刪除
  const handleDeleteClub = async (clubId: string, clubName: string) => {
    if (!window.confirm(`⚠️ 確定要永久刪除「${clubName}」社團嗎？此動作無法復原！`)) return;

    setIsSubmitting(true);
    setMessage(`正在刪除社團 ${clubName}...`);

    const result = await deleteClubAction(clubId);
    
    setMessage(result.message);
    if (result.success) {
      await fetchClubs();
    }
    setIsSubmitting(false);
  };

  // 呼叫後端 Action：執行隨機抽籤
  const handleRunRandomDraw = async () => {
    if (!window.confirm("確定要現在執行全校社團隨機抽籤嗎？此動作將會依據名額隨機分發所有已登記學生！")) return;
    
    setIsSubmitting(true);
    setMessage("正在進行全校隨機分發抽籤與運算...");
    const result = await runRandomDrawOnServer();
    setMessage(result.message);
    if (result.success) {
      await fetchClubs(); 
    }
    setIsSubmitting(false);
  };

  // 清除「所有選填紀錄」
  const handleClearRegistrations = async () => {
    if (!window.confirm("⚠️ 確定要清除「所有學生的志願選填紀錄」嗎？\n(社團資料將會保留，但登記人數會歸零)")) return;
    
    setIsSubmitting(true);
    setMessage("正在清除選填紀錄與重置人數...");
    const result = await clearAllRegistrationsAction();
    setMessage(result.message);
    if (result.success) await fetchClubs(); 
    setIsSubmitting(false);
  };

  // 清除「所有社團資料」
  const handleClearClubs = async () => {
    if (!window.confirm("⚠️ 警告：確定要刪除「所有社團」嗎？\n這將會連帶清空所有學生的選填紀錄！此動作無法復原！")) return;
    if (!window.confirm("最後確認：真的要清空所有社團資料嗎？")) return;

    setIsSubmitting(true);
    setMessage("正在清除所有社團資料...");
    const result = await clearAllClubsAction();
    setMessage(result.message);
    if (result.success) await fetchClubs(); 
    setIsSubmitting(false);
  };

  // 檢視社團名單 (權重分層排序)
  const handleViewList = async (club: any) => {
    setSelectedClubForList(club); 
    setIsLoadingList(true); 
    setStudentsList([]);

    try {
      const q = query(collection(db, 'registrations'), where('clubId', '==', club.id));
      const querySnapshot = await getDocs(q);
      let list = querySnapshot.docs.map(doc => doc.data());

      const statusWeight: Record<string, number> = { 'accepted': 1, 'pending': 2, 'failed': 3 };

      list.sort((a, b) => {
        const weightA = statusWeight[a.status] || 99;
        const weightB = statusWeight[b.status] || 99;
        if (weightA === weightB) {
          return (a.studentId || '').localeCompare(b.studentId || '');
        }
        return weightA - weightB;
      });

      setStudentsList(list);
    } catch (error: any) { 
      alert(error.message); 
    } finally { 
      setIsLoadingList(false); 
    }
  };

  // 🔥 匯出 CSV 模板 (帶入現有資料)
  const handleExportCSV = () => {
    const exportData = clubs.length > 0 ? clubs.map(club => ({
      '名稱': club.name || '',
      '名額': club.capacity || '',
      '圖片檔名': club.imageFile || '',
      'Hashtags': club.hashtags || '',
      '社團連結': club.clubLink || '',
      '社團介紹': club.description || '',
      '社團分類': club.category || ''
    })) : [{ '名稱': '', '名額': '', '圖片檔名': '', 'Hashtags': '', '社團連結': '', '社團介紹': '' ,'社團分類': '',}];

    const csv = Papa.unparse(exportData);
    // \uFEFF 是 BOM (Byte Order Mark)，讓 Excel 打開 CSV 時不會中文亂碼
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '社團資料模板.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 🔥 讀取並解析上傳的 CSV 檔案
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSubmitting(true);
    setMessage("正在解析 CSV 檔案...");

    Papa.parse(file, {
      header: true,        // 把第一行當作 Key
      skipEmptyLines: true, // 略過空白行
      complete: async (results) => {
        setMessage("正在將資料批次寫入資料庫...");
        const res = await importClubsBulkAction(results.data);
        setMessage(res.message);
        if (res.success) {
          await fetchClubs(); // 重新整理畫面
        }
        setIsSubmitting(false);
        if (fileInputRef.current) fileInputRef.current.value = ''; // 清空 input 讓下次還能傳同一個檔
      },
      error: (error) => {
        setMessage(`❌ 解析 CSV 失敗: ${error.message}`);
        setIsSubmitting(false);
      }
    });
  };

  if (isAuthLoading) return <div className="p-8 text-center">正在驗證身分...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-lg shadow-md w-full max-w-md border space-y-4">
          <h1 className="text-2xl font-bold text-center text-gray-800">管理員後台登入</h1>
          <div>
            <label className="block text-sm font-medium mb-1">電子郵件</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">密碼</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          {authError && <p className="text-red-500 text-sm">{authError}</p>}
          <button type="submit" disabled={isLoggingIn} className="w-full py-2 bg-blue-600 text-white font-medium rounded">
            {isLoggingIn ? '登入中...' : '登入'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-8 mt-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-4 border-b gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Console</h1>
        <div className="flex flex-wrap gap-3">
          {/* 隱藏的檔案上傳元件 */}
          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
          
          <button onClick={handleExportCSV} disabled={isSubmitting} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium shadow transition-colors disabled:bg-gray-400">
            Export
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={isSubmitting} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium shadow transition-colors disabled:bg-gray-400">
            Import
          </button>
          <button onClick={handleRunRandomDraw} disabled={isSubmitting} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium shadow transition-colors disabled:bg-gray-400">
            Random
          </button>
          <button onClick={handleClearRegistrations} disabled={isSubmitting} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded font-medium shadow transition-colors disabled:bg-gray-400">
            Clear
          </button>
          <button onClick={handleClearClubs} disabled={isSubmitting} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium shadow transition-colors disabled:bg-gray-400">
            Delete
          </button>
          <button onClick={() => signOut(auth)} className="px-4 py-2 text-sm text-gray-600 border rounded hover:bg-gray-50">
            LogOut
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded font-medium ${message.includes('成功') || message.includes('完成') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
          {message}
        </div>
      )}

      {/* 🔥 核心補回：新增與修改社團的動態輸入表單 */}
      <div className="bg-gray-50 p-6 rounded-lg border mb-8 shadow-sm">
        <h3 className="text-lg font-bold mb-4 text-gray-800">
          {editingId ? '📝 編輯社團內容' : '新增社團項目'}
        </h3>
        <form onSubmit={handleSaveClub} className="flex flex-col gap-4">
          {/* 第一排：名稱與名額 */}
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-600 mb-1">社團名稱 *</label>
              <input type="text" required value={newClubName} onChange={(e) => setNewClubName(e.target.value)} placeholder="例如：吉他社" className="w-full border p-2 rounded bg-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="w-full md:w-40">
              <label className="block text-sm font-medium text-gray-600 mb-1">總名額 *</label>
              <input type="number" required min="1" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} placeholder="30" className="w-full border p-2 rounded bg-white focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          
          {/* 第二排：圖片與連結 */}
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-600 mb-1">圖片檔名</label>
              <input type="text" value={newImageFile} onChange={(e) => setNewImageFile(e.target.value)} placeholder="留白則使用預設圖" className="w-full border p-2 rounded bg-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-600 mb-1">粉專連結 </label>
              <input type="url" value={newClubLink} onChange={(e) => setNewClubLink(e.target.value)} placeholder="https://instagram.com/..." className="w-full border p-2 rounded bg-white focus:outline-none focus:border-indigo-500" />
            </div>
            {/* 新增這排 Hashtags 輸入框 */}
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-600 mb-1">Hashtags (請用逗號分隔)</label>
              <input type="text" value={newHashtags} onChange={(e) => setNewHashtags(e.target.value)} placeholder="#" className="w-full border p-2 rounded bg-white focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          
          {/* 第三排：介紹 */}
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-600 mb-1">社團簡介</label>
            <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={2} placeholder="輸入一段吸引人的社團簡介..." className="w-full border p-2 rounded bg-white focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-600 mb-1">社團大分類 (例如：學術性、康樂性)</label>
            <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="學術性" className="w-full border p-2 rounded bg-white focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="flex gap-2 justify-end mt-2">
            {editingId && (
              <button type="button" onClick={setTransitToCreate} className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium rounded transition-colors">
                取消編輯
              </button>
            )}
            <button type="submit" disabled={isSubmitting} className="px-8 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded shadow transition-colors">
              {editingId ? '更新儲存' : '新增'}
            </button>
          </div>
        </form>
      </div>

      <h2 className="text-xl font-semibold mb-4 text-gray-800">現有社團與登記概況 ({clubs.length})</h2>
      <div className="bg-white rounded-lg shadow border overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr className="bg-gray-100 border-b text-gray-600 text-sm">
              <th className="p-4 font-medium">社團名稱</th>
              <th className="p-4 font-medium">總名額</th>
              <th className="p-4 font-medium">已登記人數 (中籤率)</th>
              <th className="p-4 font-medium">錄取</th>
              <th className="p-4 font-medium">操作管理</th>
            </tr>
          </thead>
          <tbody>
            {clubs.map(club => {
              const applied = club.applied || 0;
              const rate = applied > club.capacity ? `${((club.capacity / applied) * 100).toFixed(0)}%` : '100%';
              return (
                <tr key={club.id} className="border-b hover:bg-gray-50 text-gray-800">
                  <td className="p-4 font-medium">{club.name}</td>
                  <td className="p-4">{club.capacity}</td>
                  <td className="p-4">
                    <span className="font-semibold text-gray-700">{applied} 人</span> 
                    <span className={`ml-2 text-xs font-medium ${applied > club.capacity ? 'text-red-500' : 'text-green-600'}`}>({rate})</span>
                  </td>
                  <td className="p-4 text-purple-600 font-bold">{club.enrolled || 0} 人</td>
                  <td className="p-4 text-right flex justify-end gap-2">
                    <button onClick={() => handleViewList(club)} className="px-3 py-1.5 text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors">
                      名單
                    </button>
                    <button 
                        onClick={() => window.location.href = `/admin/club/${club.id}`} 
                        className="px-3 py-1.5 text-sm text-gray-700 bg-gray-50 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                      >
                      編輯
                    </button>
                    <button onClick={() => handleDeleteClub(club.id, club.name)} className="px-3 py-1.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors">
                      刪除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 名單檢視彈窗 (Modal) */}
      {selectedClubForList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
              <h3 className="text-xl font-bold text-gray-800">{selectedClubForList.name} - 登記名單</h3>
              <button onClick={() => setSelectedClubForList(null)} className="text-gray-500 hover:text-gray-800 text-2xl font-bold leading-none">&times;</button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 bg-white">
              {isLoadingList ? (
                <p className="text-center py-8 text-gray-500 animate-pulse">載入排序名單中...</p>
              ) : studentsList.length === 0 ? (
                <p className="text-center py-8 text-gray-500">目前尚無人登記此社團</p>
              ) : (
                <ul className="divide-y border rounded bg-white shadow-sm">
                  {studentsList.map((student, index) => (
                    <li key={index} className={`p-3 flex justify-between items-center transition-colors hover:bg-gray-50
                      ${student.status === 'accepted' ? 'border-l-4 border-l-green-500' : ''}
                      ${student.status === 'failed' ? 'border-l-4 border-l-red-400 opacity-70' : ''}
                    `}>
                      <span className="font-mono text-gray-700 font-medium">{student.studentId}</span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full shadow-sm
                        ${student.status === 'accepted' ? 'bg-green-100 text-green-700 border border-green-200' : 
                          student.status === 'failed' ? 'bg-red-50 text-red-600 border border-red-100' : 
                          'bg-yellow-100 text-yellow-700 border border-yellow-200'}
                      `}>
                        {student.status === 'accepted' ? '✔️ 已錄取' : 
                         student.status === 'failed' ? '❌ 未錄取' : '⏳ 等待抽籤'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-4 border-t flex justify-between items-center bg-gray-50 rounded-b-lg">
              <span className="text-sm text-gray-500 font-medium">總計: {studentsList.length} 人</span>
              <button onClick={() => setSelectedClubForList(null)} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded transition-colors">
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}