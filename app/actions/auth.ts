'use server';

import fs from 'fs';
import path from 'path';

export async function verifyStudentLogin(studentId: string, name: string, className: string) {
  try {
    // 1. 定位 CSV 檔案路徑 (process.cwd() 會指向專案根目錄)
    const filePath = path.join(process.cwd(), 'lib', 'data', 'students.csv');
    
    // 2. 讀取 CSV 內容
    const fileContents = fs.readFileSync(filePath, 'utf8');

    // 3. 解析 CSV (以換行符號切割)
    const lines = fileContents.split(/\r?\n/);

    // 4. 從第 2 行開始跑迴圈 (跳過第一行的標題「姓名,班級,學號」)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // 依照你說的順序：一列姓名、一列班級、一列學號
      const [csvName, csvClass, csvId] = line.split(',');

      // 5. 嚴格比對 (去除多餘空白，並將學號轉大寫避免大小寫差異)
      if (
        csvId?.trim().toUpperCase() === studentId.trim().toUpperCase() &&
        csvName?.trim() === name.trim() &&
        csvClass?.trim() === className.trim()
      ) {
        return { success: true }; // 三個都對上，允許登入
      }
    }

    // 迴圈跑完都沒找到符合的
    return { success: false, message: '學號、姓名或班級不符，請重新確認。' };
    
  } catch (error) {
    console.error("CSV 讀取錯誤:", error);
    return { success: false, message: '系統驗證發生錯誤，找不到學生名單。' };
  }
}