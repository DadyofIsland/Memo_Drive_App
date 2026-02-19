// config.js
// 取得した値をここに記入してください

const config = {
  CLIENT_ID: '921489554772-fiapks2ah36cc131f60cpcf7dquem4tl.apps.googleusercontent.com', // 例: 72...apps.googleusercontent.com
  API_KEY: 'AIzaSyB0RqQWATjoqlzShSAbzVNO-Ql20NHItlw',     // 例: AIza...
  FOLDER_ID: '1kwfsVQVNmKoPDCBhQfa6OASfNVJQjIPh', // 例: 1A2B...
  
  // Google Drive APIのスコープ（変更不要）
  SCOPES: 'https://www.googleapis.com/auth/drive.file',
  DISCOVERY_DOC: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
};

// 他のファイルから読み込めるようにグローバルに公開
window.APP_CONFIG = config;
