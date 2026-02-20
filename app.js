/**
 * app.js
 * メモアプリのメインプログラム（アプリケーションのロジック）
 * ここでは画面の動きや、GAS経由でのスプレッドシートへの保存、音声認識の処理を行います。
 */

// -------------------------------------------------------------
// 1. アプリの状態管理 (State Management)
// -------------------------------------------------------------
// アプリがいま「オンラインか」「録音中か」などの状態を記憶しておく場所です。
const appState = {
    isListening: false,     // マイクで音声を聞き取っているか
    isOnline: navigator.onLine, // インターネットに繋がっているか
};

// -------------------------------------------------------------
// 2. 画面の部品（HTML要素）の取得 (DOM Elements)
// -------------------------------------------------------------
// プログラムから操作したい画面の部品をまとめて置いておきます。
const domElements = {
    statusBar: document.getElementById('status-bar'),
    statusText: document.getElementById('status-text'),
    statusDot: document.querySelector('.status-dot'),
    dateDisplay: document.querySelector('.date-display'),
    memoText: document.getElementById('memo-text'),
    micBtn: document.getElementById('mic-btn'),
    saveBtn: document.getElementById('save-btn'),
};

// -------------------------------------------------------------
// 3. アプリの初期設定 (Initialization)
// -------------------------------------------------------------
// 画面が読み込まれた時に最初に実行される処理です。
window.addEventListener('load', () => {
    initializeDateDisplay();
    updateOnlineStatusDisplay();
    checkOfflineUnsavedMemos();

    // オンラインなら、仮保存されたメモを自動で送信する
    if (appState.isOnline) {
        syncOfflineMemosToSheet();
    }
});

// 現在の日付を画面に表示します
function initializeDateDisplay() {
    const today = new Date();
    // 例: 2026年2月20日(金)
    const formatOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
    domElements.dateDisplay.textContent = today.toLocaleDateString('ja-JP', formatOptions);
}

// -------------------------------------------------------------
// 4. 音声認識 (Voice Recognition)
// -------------------------------------------------------------

// ブラウザが音声認識に対応しているかチェックします
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognitionAPI) {
    const voiceRecognizer = new SpeechRecognitionAPI();
    voiceRecognizer.continuous = true; // 連続して聞き取る
    voiceRecognizer.lang = 'ja-JP';    // 日本語を設定
    voiceRecognizer.interimResults = false; // 確定した言葉だけを取得する

    // 音声認識が「始まった時」の処理
    voiceRecognizer.onstart = () => {
        appState.isListening = true;
        domElements.micBtn.classList.add('listening');
        updateAppStatusMessage('音声を聞き取り中...', 'syncing');
    };

    // 音声認識が「終わった時」の処理
    voiceRecognizer.onend = () => {
        appState.isListening = false;
        domElements.micBtn.classList.remove('listening');

        if (appState.isOnline) {
            updateAppStatusMessage('ONLINE', 'online');
        } else {
            updateAppStatusMessage('OFFLINE', 'offline');
        }
    };

    // 音声が「文字に変換された時」の処理
    voiceRecognizer.onresult = (event) => {
        let recognizedText = '';

        // 新しく聞き取った言葉を繋げます
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                recognizedText += event.results[i][0].transcript;
            }
        }

        // テキストボックスに文字を入力します
        if (recognizedText) {
            // すでに文字が入っていたら、改行して追加します
            const separator = domElements.memoText.value.length > 0 ? '\n' : '';
            domElements.memoText.value += separator + recognizedText;
            domElements.saveBtn.disabled = false; // 保存ボタンを押せるようにする
        }
    };

    // マイクボタンが押された時の処理
    domElements.micBtn.onclick = () => {
        if (appState.isListening) {
            // 聞き取り中ならストップ
            voiceRecognizer.stop();
        } else {
            // 止まっていればスタート
            voiceRecognizer.start();
        }
    };
} else {
    // 音声認識に非対応のブラウザの場合
    console.warn("このブラウザは音声入力APIをサポートしていません。");
    domElements.micBtn.style.display = 'none';
    alert("このブラウザは音声入力をサポートしていません。Chrome ブラウザを使用してください。");
}

// -------------------------------------------------------------
// 5. メモの入力と保存アクション (Text & Save Actions)
// -------------------------------------------------------------

// メモ欄に文字が入力された時に、保存ボタンを押せるかをチェックします
domElements.memoText.addEventListener('input', () => {
    const textContent = domElements.memoText.value.trim();
    // 文字が空っぽなら保存ボタンを無効にする
    domElements.saveBtn.disabled = textContent.length === 0;
});

// 保存ボタンが押された時の処理
domElements.saveBtn.onclick = async () => {
    const textToSave = domElements.memoText.value.trim();
    if (!textToSave) return;

    updateAppStatusMessage('保存中...', 'syncing');
    domElements.saveBtn.disabled = true;

    // オンラインならGAS経由でスプレッドシートに保存
    if (appState.isOnline) {
        try {
            await sendMemoToSheet(textToSave);
            domElements.memoText.value = ''; // 保存できたら入力欄を空にする
            updateAppStatusMessage('保存しました！', 'online');

            // 2秒後にステータスを元に戻す
            setTimeout(() => updateAppStatusMessage('ONLINE', 'online'), 2000);
        } catch (error) {
            console.error('スプレッドシートへの保存に失敗しました', error);
            handleSaveFailure(textToSave, error);
        }
    } else {
        // オフラインの時は、ブラウザ内（手元）に保存しておく
        saveTextLocally(textToSave);
        domElements.memoText.value = '';
        updateAppStatusMessage('端末内に仮保存しました', 'offline');

        setTimeout(() => updateAppStatusMessage('OFFLINE', 'offline'), 2000);
    }
};

// 保存が失敗したときの処理
function handleSaveFailure(text, error) {
    saveTextLocally(text); // ひとまず端末に仮保存する

    const errorMessage = error.message || JSON.stringify(error);
    alert(`保存に失敗しました（端末内に仮保存しました）: ${errorMessage}`);

    updateAppStatusMessage('端末内に仮保存済（後で同期します）', 'offline');
}

// -------------------------------------------------------------
// 6. GAS経由でスプレッドシートへの保存処理 (GAS POST Logic)
// -------------------------------------------------------------

// GASのウェブアプリにメモを送信する関数です
async function sendMemoToSheet(content) {
    const gasUrl = window.APP_CONFIG.GAS_URL;
    const now = new Date();

    // 日時のフォーマット（例: 2026-02-20 22:54）
    const timestamp = now.toLocaleString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });

    // GASのウェブアプリに、メモの内容と日時をまとめて送ります
    const response = await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors', // GASへの通信にはこの設定が必要です
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: content,
            timestamp: timestamp,
        }),
    });

    // no-cors モードではレスポンスの中身を読めませんが、
    // 通信自体が成功すれば保存は完了しています。
    // ネットワークエラー時は fetch が例外を投げるため catch で捕まります。
}

// -------------------------------------------------------------
// 7. オフライン（インターネット切断）時の処理 (Offline & Sync Logic)
// -------------------------------------------------------------

// インターネットに「繋がった」時のイベント
window.addEventListener('online', () => {
    appState.isOnline = true;
    updateAppStatusMessage('ONLINE', 'online');
    syncOfflineMemosToSheet(); // 繋がったらすぐに、溜まっていたメモを同期する
});

// インターネットが「切れた」時のイベント
window.addEventListener('offline', () => {
    appState.isOnline = false;
    updateAppStatusMessage('OFFLINE', 'offline');
});

// 今現在、インターネットに繋がっているかを画面に表示します
function updateOnlineStatusDisplay() {
    if (navigator.onLine) {
        updateAppStatusMessage('ONLINE', 'online');
    } else {
        updateAppStatusMessage('OFFLINE', 'offline');
    }
}

// 画面左上のステータス表示（文字と色付きの点）を更新します
function updateAppStatusMessage(text, dotType) {
    domElements.statusText.textContent = text;
    domElements.statusDot.className = `status-dot ${dotType}`;
}

// 手元の端末（ブラウザの中）にメモを仮保存しておきます
function saveTextLocally(text) {
    // 過去に保存したものを取り出す（なければ空のリストを用意）
    const pendingMemos = JSON.parse(localStorage.getItem('pending_memos') || '[]');

    // 新しいメモと、保存した時間を追加する
    pendingMemos.push({
        text: text,
        timestamp: new Date().toISOString(),
    });

    // 端末の記憶箱に保存し直す
    localStorage.setItem('pending_memos', JSON.stringify(pendingMemos));
}

// オフラインの時に保存されたメモが残っていないか起動時に確認します
function checkOfflineUnsavedMemos() {
    const pendingMemos = JSON.parse(localStorage.getItem('pending_memos') || '[]');
    if (pendingMemos.length > 0) {
        console.log(`未送信のメモが ${pendingMemos.length} 件あります。接続時に送信されます。`);
    }
}

// 端末に仮保存されているメモを、まとめてスプレッドシートに送り出します（同期処理）
async function syncOfflineMemosToSheet() {
    if (!appState.isOnline) return;

    const pendingMemos = JSON.parse(localStorage.getItem('pending_memos') || '[]');
    if (pendingMemos.length === 0) return; // 送るものがなければ終了

    updateAppStatusMessage('同期中...', 'syncing');

    try {
        // 仮保存していた各メモを1件ずつ順番にスプレッドシートへ送ります
        for (const memo of pendingMemos) {
            await sendMemoToSheet(`(オフライン時の仮保存) ${memo.text}`);
        }

        // 同期に成功したら、手元の記憶箱は空っぽにする
        localStorage.removeItem('pending_memos');

        updateAppStatusMessage('同期完了！', 'online');
        setTimeout(() => updateAppStatusMessage('ONLINE', 'online'), 2000);
    } catch (error) {
        console.error('同期（一括送信）に失敗しました', error);
        // 失敗した場合は未送信のままにしておくため、次に再び試します
        updateAppStatusMessage('同期失敗（後で再試行します）', 'offline');
    }
}
