// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

// 設定壓測的「階段 (Stages)」
export const options = {
  stages: [
    { duration: '30s', target: 100 },  // 階段 1：30 秒內，將虛擬使用者從 0 增加到 500 人
    { duration: '1m', target: 300 },  // 階段 2：1 分鐘內，將人數推升並維持在 2000 人同時在線
    { duration: '30s', target: 0 },    // 階段 3：30 秒內，讓人群慢慢散去，降回 0 人
  ],
  // 如果 2000 人對你的電腦負擔太大，可以把上面的 target 數字減半測試
};

export default function () {
  // 鎖定本地端的首頁網址
  const url = 'https://volunteer-selection-system.vercel.app/'; 

  // 模擬學生發起請求，進入首頁
  const res = http.get(url);

  // 檢查網站是否順利吐回資料 (HTTP 200)，且沒有崩潰
  check(res, {
    '網站存活 (status was 200)': (r) => r.status === 200,
    '載入速度達標 (response time < 1000ms)': (r) => r.timings.duration < 1000,
  });

  // 檢查網站是否存活 (HTTP 狀態碼為 200)
  const isSuccessful = check(res, {
    '網站存活 (status was 200)': (r) => r.status === 200,
    '載入速度達標 (response time < 1000ms)': (r) => r.timings.duration < 1000,
  });

  // 如果不是 200，印出 Vercel 回傳的狀態碼
  if (!isSuccessful) {
    console.log(`❌ 請求失敗！狀態碼: ${res.status}`);
  }

  // 每個虛擬使用者在畫面上停留 1 秒鐘，然後重新整理或進行下個動作
  sleep(1);
}