// config.example.js
// 【重要】このファイルは設定の「ひな形（テンプレート）」です。
// このファイルを「config.js」という名前にコピーしてから、
// 実際のAPIキーや取得した値を書き込んで使用してください。
// config.js はGitでは公開（アップロード）されない設定になっています。

const config = {
  // === Google Drive API を使う場合の設定 ===
  CLIENT_ID: 'YOUR_CLIENT_ID_HERE', // 例: 72...apps.googleusercontent.com
  API_KEY: 'YOUR_API_KEY_HERE',     // 例: AIza...
  FOLDER_ID: 'YOUR_FOLDER_ID_HERE', // 例: 1A2B...
  
  // Google Drive APIのスコープ（変更不要）
  SCOPES: 'https://www.googleapis.com/auth/drive.file',
  DISCOVERY_DOC: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',

  // === Google Apps Script（GAS）を使う場合の設定 ===
  GAS_URL: 'YOUR_GAS_WEB_APP_URL_HERE',
};

// 他のファイルから読み込めるようにグローバルに公開
window.APP_CONFIG = config;
