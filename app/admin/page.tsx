'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../../lib/firebaseConfig';
import { runRandomDrawOnServer, saveClubAction, deleteClubAction, importClubsBulkAction, clearAllRegistrationsAction, clearAllClubsAction } from './actions';
import Papa from 'papaparse';

export default function AdminPage() {
  // 身分驗證狀態
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 社團列表與控制狀態
  const [clubs, setClubs] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  // 新增與修改社團所需的表單狀態
  const [newClubName, setNewClubName] = useState('');
  const [newCapacity, setNewCapacity] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newImageFile, setNewImageFile] = useState('');
  const [newClubLink, setNewClubLink] = useState('');
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
    setNewCapacity(club.capacity?.toString() || '');
    setNewDescription(club.description || '');
    setNewImageFile(club.imageFile || ''); // 注意此處為 imageFile
    setNewClubLink(club.clubLink || '');
    setNewHashtags(club.hashtags || '');
    setNewCategory(club.category || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setTransitToCreate = () => {
    setEditingId(null);
    setNewClubName('');
    setNewCapacity('');
    setNewDescription('');
    setNewImageFile('');
    setNewClubLink('');
    setNewHashtags('');
    setNewCategory('');
  };

  const handleDeleteClub = async (clubId: string, clubName: string) => {
    if (!window.confirm(`⚠️ 確定要永久刪除「${clubName}」社團嗎？此動作無法復原！`)) return;
    setIsSubmitting(true);
    setMessage(`正在刪除社團 ${clubName}...`);
    const result = await deleteClubAction(clubId);
    setMessage(result.message);
    if (result.success) await fetchClubs();
    setIsSubmitting(false);
  };

  const handleRunRandomDraw = async () => {
    if (!window.confirm("確定要現在執行全校社團隨機抽籤嗎？此動作將會依據名額隨機分發所有已登記學生！")) return;
    setIsSubmitting(true);
    setMessage("正在進行全校隨機分發抽籤與運算...");
    const result = await runRandomDrawOnServer();
    setMessage(result.message);
    if (result.success) await fetchClubs(); 
    setIsSubmitting(false);
  };

  const handleClearRegistrations = async () => {
    if (!window.confirm("⚠️ 確定要清除「所有學生的志願選填紀錄」嗎？\n(社團資料將會保留，但登記人數會歸零)")) return;
    setIsSubmitting(true);
    setMessage("正在清除選填紀錄與重置人數...");
    const result = await clearAllRegistrationsAction();
    setMessage(result.message);
    if (result.success) await fetchClubs(); 
    setIsSubmitting(false);
  };

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
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '社團資料模板.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSubmitting(true);
    setMessage("正在解析 CSV 檔案...");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        setMessage("正在將資料批次寫入資料庫...");
        const res = await importClubsBulkAction(results.data);
        setMessage(res.message);
        if (res.success) await fetchClubs();
        setIsSubmitting(false);
        if (fileInputRef.current) fileInputRef.current.value = ''; 
      },
      error: (error) => {
        setMessage(`❌ 解析 CSV 失敗: ${error.message}`);
        setIsSubmitting(false);
      }
    });
  };

  if (isAuthLoading) return <div className="p-8 text-center font-bold text-gray-500">正在驗證身分...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-black text-gray-800">管理員後台登入</h1>
            <p className="text-sm text-gray-500 mt-2">請輸入您的管理員帳號與密碼</p>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">電子郵件</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-300 p-3 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">密碼</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-gray-300 p-3 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all" />
          </div>
          {authError && <p className="text-red-500 text-sm font-bold bg-red-50 p-3 rounded-lg">{authError}</p>}
          <button type="submit" disabled={isLoggingIn} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all">
            {isLoggingIn ? '驗證中...' : '登入系統'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* 頂部導覽列 */}
      <nav className="bg-white shadow-sm sticky top-0 z-40 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-black text-indigo-700 tracking-tight">後台管理 Console</h1>
          <div className="flex items-center gap-4">
            <button onClick={() => window.location.href = '/'} className="text-sm font-bold text-gray-500 hover:text-indigo-600 transition-colors">
              前往前台首頁 &rarr;
            </button>
            <button onClick={() => signOut(auth)} className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 rounded-full hover:bg-red-100 transition-colors">
              登出
            </button>
          </div>
        </div>
      </nav>

      {/* 主要內容區 */}
      <main className="max-w-6xl mx-auto px-4 mt-8">
        
        {/* 控制面板按鈕群 */}
        <div className="flex flex-wrap gap-3 mb-8 bg-white p-5 rounded-2xl shadow-sm border border-gray-100 items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800 mr-4">系統操作</h2>
          <div className="flex flex-wrap gap-2">
            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
            <button onClick={handleExportCSV} disabled={isSubmitting} className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-bold transition-colors disabled:opacity-50">
              📥 匯出 CSV
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={isSubmitting} className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-bold transition-colors disabled:opacity-50">
              📤 匯入 CSV
            </button>
            <button onClick={handleRunRandomDraw} disabled={isSubmitting} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold shadow-sm transition-colors disabled:opacity-50 ml-2">
              🎲 執行隨機分發
            </button>
            <button onClick={handleClearRegistrations} disabled={isSubmitting} className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-lg font-bold transition-colors disabled:opacity-50 ml-2">
              清除選填紀錄
            </button>
            <button onClick={handleClearClubs} disabled={isSubmitting} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg font-bold transition-colors disabled:opacity-50">
              刪除所有社團
            </button>
          </div>
        </div>

        {/* 系統訊息 */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl font-bold shadow-sm ${message.includes('成功') || message.includes('完成') ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-yellow-100 text-yellow-800 border border-yellow-200'}`}>
            {message}
            <button onClick={() => setMessage('')} className="float-right hover:opacity-70">&times;</button>
          </div>
        )}

        {/* 新增與修改社團的動態輸入表單 */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 mb-8 transition-all">
          <h3 className="text-xl font-black mb-6 text-gray-800 flex items-center gap-2">
            {editingId ? '📝 編輯社團內容' : '✨ 新增社團項目'}
          </h3>
          <form onSubmit={handleSaveClub} className="flex flex-col gap-5">
            <div className="flex flex-col md:flex-row gap-5 items-start">
              <div className="flex-[2] w-full">
                <label className="block text-sm font-bold text-gray-700 mb-1">社團名稱 <span className="text-red-500">*</span></label>
                <input type="text" required value={newClubName} onChange={(e) => setNewClubName(e.target.value)} placeholder="例如：吉他社" className="w-full border border-gray-300 p-3 rounded-xl bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
              </div>
              <div className="flex-1 w-full">
                <label className="block text-sm font-bold text-gray-700 mb-1">社團分類</label>
                <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="例如：學術性" className="w-full border border-gray-300 p-3 rounded-xl bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
              </div>
              <div className="flex-1 w-full">
                <label className="block text-sm font-bold text-gray-700 mb-1">總名額 <span className="text-red-500">*</span></label>
                <input type="number" required min="1" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} placeholder="30" className="w-full border border-gray-300 p-3 rounded-xl bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
              </div>
            </div>
            
            <div className="flex flex-col md:flex-row gap-5 items-start">
              <div className="flex-1 w-full">
                <label className="block text-sm font-bold text-gray-700 mb-1">圖片檔名</label>
                <input type="text" value={newImageFile} onChange={(e) => setNewImageFile(e.target.value)} placeholder="a.jpg, b.jpg (逗號分隔多張)" className="w-full border border-gray-300 p-3 rounded-xl bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
              </div>
              <div className="flex-1 w-full">
                <label className="block text-sm font-bold text-gray-700 mb-1">粉專連結</label>
                <input type="url" value={newClubLink} onChange={(e) => setNewClubLink(e.target.value)} placeholder="https://instagram.com/..." className="w-full border border-gray-300 p-3 rounded-xl bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
              </div>
              <div className="flex-1 w-full">
                <label className="block text-sm font-bold text-gray-700 mb-1">Hashtags (逗號分隔)</label>
                <input type="text" value={newHashtags} onChange={(e) => setNewHashtags(e.target.value)} placeholder="音樂,表演" className="w-full border border-gray-300 p-3 rounded-xl bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
              </div>
            </div>
            
            <div className="w-full">
              <label className="block text-sm font-bold text-gray-700 mb-1">社團簡介</label>
              <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={3} placeholder="輸入一段吸引人的社團簡介..." className="w-full border border-gray-300 p-3 rounded-xl bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all resize-y" />
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 mt-2">
              {editingId && (
                <button type="button" onClick={setTransitToCreate} className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">
                  取消編輯
                </button>
              )}
              <button type="submit" disabled={isSubmitting} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all transform hover:-translate-y-0.5 disabled:opacity-50">
                {editingId ? '更新儲存' : '新增社團'}
              </button>
            </div>
          </form>
        </div>

        {/* ====================================================== */}
        {/* 社團資料管理：卡片網格 (取代原本的 Table)                  */}
        {/* ====================================================== */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-black text-gray-800">現有社團名單</h2>
          <span className="bg-indigo-100 text-indigo-800 font-bold px-3 py-1 rounded-full text-sm">
            共 {clubs.length} 筆
          </span>
        </div>

        {clubs.length === 0 ? (
          <div className="text-center py-20 text-gray-500 font-bold bg-white rounded-2xl border border-dashed border-gray-300">
            目前系統中沒有任何社團資料。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clubs.map(club => {
              const applied = club.applied || 0;
              const rate = applied > club.capacity ? `${((club.capacity / applied) * 100).toFixed(0)}%` : '100%';
              
              // 處理逗號分隔的第一張圖，或是單張圖
              const firstImage = club.imageFile?.split(',')[0]?.trim();
              const imageUrl = firstImage ? `/clubs/${firstImage}` : '/clubs/default.jpg';

              return (
                <div key={club.id} className="flex flex-col bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-300 group">
                  
                  {/* 照片區塊 */}
                  <div className="h-44 w-full relative bg-gray-900 overflow-hidden">
                    <img 
                      src={imageUrl} 
                      alt={club.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (!target.src.endsWith('/default.jpg')) target.src = '/clubs/default.jpg';
                      }}
                    />
                    {/* 分類標籤 */}
                    {club.category && (
                      <span className="absolute top-3 left-3 px-2.5 py-1 bg-rose-600 text-white text-xs font-black rounded-lg shadow-md">
                        ★ {club.category}
                      </span>
                    )}
                  </div>

                  {/* 內容區塊 */}
                  <div className="p-6 flex-1 flex flex-col">
                    <h3 className="text-xl font-black text-gray-800 mb-2 truncate" title={club.name}>
                      {club.name}
                    </h3>
                    
                    {/* 🚀 修正後：使用 inline-flex, h-6, items-center 確保文字絕對垂直置中 */}
                    <div className="flex flex-wrap gap-1.5 mb-4 min-h-[28px] items-center">
                      {club.hashtags && club.hashtags.split(/[,，、]+/).filter(Boolean).map((tag: string, i: number) => (
                        <span 
                          key={i} 
                          className="inline-flex items-center justify-center px-2.5 h-6 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-md border border-indigo-100 leading-none"
                        >
                          #{tag.trim()}
                        </span>
                      ))}
                    </div>

                    {/* 數據看板 */}
                    <div className="bg-gray-50 rounded-xl p-4 mb-5 text-sm text-gray-600 space-y-3 border border-gray-100 flex-1">
                      <div className="flex justify-between items-center">
                        <span>總名額：</span>
                        {/* 拿掉背景色與框線，改回純黑粗體 */}
                        <span className="font-bold text-gray-900">{club.capacity} 人</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>已登記：</span>
                        {/* 拿掉背景色與框線，改回純黑粗體 */}
                        <span className="font-bold text-gray-900">{applied} 人</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>中籤率：</span>
                        <span className={`font-black ${applied > club.capacity ? "text-red-500" : "text-green-600"}`}>
                          {rate}
                        </span>
                      </div>
                      {/* 如果有已分發的錄取人數，顯示出來 */}
                      <div className="flex justify-between items-center border-t border-gray-200 pt-3 mt-1">
                        <span className="text-purple-700 font-bold">已分發錄取：</span>
                        {/* 一樣拿掉背景，保持乾淨的紫色文字 */}
                        <span className="font-black text-purple-700">{club.enrolled || 0} 人</span>
                      </div>
                    </div>

                    {/* 操作按鈕 */}
                    <div className="flex gap-2 mt-auto">
                      <button onClick={() => handleViewList(club)} className="flex-1 py-2.5 text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors shadow-sm">
                        名單
                      </button>
                      <button onClick={() => setTransitToEdit(club)} className="flex-1 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
                        編輯
                      </button>
                      <button onClick={() => handleDeleteClub(club.id, club.name)} className="flex-1 py-2.5 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors shadow-sm">
                        刪除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 名單檢視彈窗 (Modal) - 維持原本邏輯，套用圓角與陰影美化 */}
      {selectedClubForList && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-800">{selectedClubForList.name} - 登記名單</h3>
              <button onClick={() => setSelectedClubForList(null)} className="text-gray-400 hover:text-gray-800 text-3xl font-bold leading-none transition-colors">&times;</button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 bg-white">
              {isLoadingList ? (
                <p className="text-center py-10 font-bold text-gray-400 animate-pulse">載入名單中...</p>
              ) : studentsList.length === 0 ? (
                <p className="text-center py-10 font-bold text-gray-400">目前尚無人登記此社團</p>
              ) : (
                <ul className="divide-y border border-gray-100 rounded-2xl bg-white shadow-sm overflow-hidden">
                  {studentsList.map((student, index) => (
                    <li key={index} className={`p-4 flex justify-between items-center transition-colors hover:bg-gray-50
                      ${student.status === 'accepted' ? 'bg-green-50/30' : ''}
                      ${student.status === 'failed' ? 'opacity-60 bg-gray-50' : ''}
                    `}>
                      <span className="font-mono text-gray-700 font-bold text-lg">{student.studentId}</span>
                      <span className={`text-xs font-black px-3 py-1.5 rounded-full shadow-sm
                        ${student.status === 'accepted' ? 'bg-green-100 text-green-700 border border-green-200' : 
                          student.status === 'failed' ? 'bg-gray-200 text-gray-600 border border-gray-300' : 
                          'bg-amber-100 text-amber-700 border border-amber-200'}
                      `}>
                        {student.status === 'accepted' ? '✔️ 已錄取' : 
                         student.status === 'failed' ? '❌ 未錄取' : '⏳ 等待抽籤'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-between items-center bg-gray-50">
              <span className="text-sm text-gray-500 font-bold bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
                總計: {studentsList.length} 人
              </span>
              <button onClick={() => setSelectedClubForList(null)} className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl transition-colors">
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}