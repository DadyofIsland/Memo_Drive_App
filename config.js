// config.js
// GAS ウェブアプリの設定

const config = {
  // Google Apps Script（GAS）で公開したウェブアプリのURL
  GAS_URL: 'https://script.google.com/macros/s/AKfycbwan-p0LTJGqEZPwOLItHSV3Iyj58AlHfx7uvkfV_TCFL_ESYiXSSNRbj3D1NAWTgRI/exec',
};

// 他のファイルから読み込めるようにグローバルに公開
window.APP_CONFIG = config;
