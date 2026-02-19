// app.js

const STATE = {
    isListening: false,
    isOnline: navigator.onLine,
    isAuthenticated: false,
    tokenClient: null,
    gapiInited: false,
    gisInited: false,
};

// DOM Elements
const els = {
    statusBar: document.getElementById('status-bar'),
    statusText: document.getElementById('status-text'),
    statusDot: document.querySelector('.status-dot'),
    dateDisplay: document.querySelector('.date-display'),
    memoText: document.getElementById('memo-text'),
    micBtn: document.getElementById('mic-btn'),
    saveBtn: document.getElementById('save-btn'),
    authContainer: document.getElementById('auth-container'),
};

// --- Initialization ---

window.onload = () => {
    initDateDisplay();
    checkOnlineStatus();
    loadOfflineData();

    // Initialize Google APIs
    gapi.load('client', initGapi);

    // Note: GIS (Google Identity Services) client initialization handled in initGis
};

function initDateDisplay() {
    const now = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
    els.dateDisplay.textContent = now.toLocaleDateString('ja-JP', options);
}

// --- Google API & Auth ---

async function initGapi() {
    await gapi.client.init({
        apiKey: window.APP_CONFIG.API_KEY,
        discoveryDocs: [window.APP_CONFIG.DISCOVERY_DOC],
    });
    STATE.gapiInited = true;
    maybeEnableAuth();
}

function initGis() {
    STATE.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: window.APP_CONFIG.CLIENT_ID,
        scope: window.APP_CONFIG.SCOPES,
        callback: '', // defined at request time
    });
    STATE.gisInited = true;
    maybeEnableAuth();
}

function maybeEnableAuth() {
    if (STATE.gapiInited && STATE.gisInited) {
        renderAuthButton();
    }
}

// Manually verify initGis called (it's called by script load usually, but we need to ensure)
// Actually, we need to call it manually after the script loads.
// We'll trust the onload callback in HTML or just call it here if window.google exists.
if (window.google) {
    initGis();
} else {
    // If script loads later
    // This is a simplification; in production, use better async loading
    setTimeout(initGis, 1000);
}

function renderAuthButton() {
    // Simple check if we have a token stored (not perfect, but good for MVP)
    const token = gapi.client.getToken();
    if (token) {
        STATE.isAuthenticated = true;
        updateStatus('ONLINE (AUTHED)', 'online');
    } else {
        // Render a "Sign In" button
        const btn = document.createElement('button');
        btn.textContent = 'Googleでログイン';
        btn.onclick = handleAuthClick;
        btn.style.padding = '4px 8px';
        btn.style.fontSize = '12px';
        els.authContainer.innerHTML = '';
        els.authContainer.appendChild(btn);
    }
}

function handleAuthClick() {
    STATE.tokenClient.callback = async (resp) => {
        if (resp.error) {
            throw (resp);
        }
        STATE.isAuthenticated = true;
        els.authContainer.innerHTML = ''; // Remove button
        updateStatus('ONLINE (AUTHED)', 'online');
        await syncPendingData(); // Sync any offline data once authenticated
    };

    if (gapi.client.getToken() === null) {
        STATE.tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        STATE.tokenClient.requestAccessToken({ prompt: '' });
    }
}

// --- Voice Recognition ---

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'ja-JP';
    recognition.interimResults = true;

    recognition.onstart = () => {
        STATE.isListening = true;
        els.micBtn.classList.add('listening');
        updateStatus('Listening...', 'syncing');
    };

    recognition.onend = () => {
        STATE.isListening = false;
        els.micBtn.classList.remove('listening');
        if (STATE.isOnline) {
            updateStatus('ONLINE', 'online');
        } else {
            updateStatus('OFFLINE', 'offline');
        }
    };

    recognition.onresult = (event) => {
        let finalTranscript = '';

        // Simply append new results to existing text
        // A more robust app would handle cursor position
        const currentText = els.memoText.value;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            }
        }

        if (finalTranscript) {
            // Add a newline if there's text
            const separator = els.memoText.value.length > 0 ? '\n' : '';
            els.memoText.value += separator + finalTranscript;
            els.saveBtn.disabled = false;
        }
    };

    els.micBtn.onclick = () => {
        if (STATE.isListening) {
            recognition.stop();
        } else {
            recognition.start();
        }
    };
} else {
    console.log("Web Speech API not supported");
    els.micBtn.style.display = 'none';
    alert("このブラウザは音声入力をサポートしていません。Chromeを使用してください。");
}

// --- Text & Save Logic ---

els.memoText.addEventListener('input', () => {
    els.saveBtn.disabled = els.memoText.value.trim().length === 0;
});

els.saveBtn.onclick = async () => {
    const text = els.memoText.value.trim();
    if (!text) return;

    updateStatus('Saving...', 'syncing');
    els.saveBtn.disabled = true;

    if (STATE.isOnline && STATE.isAuthenticated) {
        try {
            await saveToDrive(text);
            els.memoText.value = ''; // Clear after save
            updateStatus('Saved!', 'online');
            setTimeout(() => updateStatus('ONLINE', 'online'), 2000);
        } catch (err) {
            console.error('Save failed', err);
            // Fallback to local
            saveToLocal(text);
            const errMsg = err.result?.error?.message || err.message || JSON.stringify(err);
            alert(`保存に失敗しました: ${errMsg}`);
            updateStatus('Saved Locally (Sync later)', 'offline');
        }
    } else {
        saveToLocal(text);
        els.memoText.value = '';
        updateStatus('Saved Locally', 'offline');
        setTimeout(() => updateStatus('OFFLINE', 'offline'), 2000);
    }
};

// --- Drive API Logic ---

async function saveToDrive(content) {
    const fileName = getFileName();
    const folderId = window.APP_CONFIG.FOLDER_ID;

    // 1. Search for existing file
    const query = `name = '${fileName}' and '${folderId}' in parents and trashed = false`;
    let fileId = null;
    let currentContent = '';

    try {
        const listResp = await gapi.client.drive.files.list({
            q: query,
            fields: 'files(id, name)',
            spaces: 'drive',
        });

        if (listResp.result.files.length > 0) {
            fileId = listResp.result.files[0].id;
            // Download current content to append
            const fileResp = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media',
            });
            currentContent = fileResp.body;
        }
    } catch (err) {
        console.error("Search failed", err);
        throw err;
    }

    // 2. Prepare new content (Append with timestamp)
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const newEntry = `\n## ${time}\n${content}\n`;
    const finalContent = (currentContent + newEntry).trim();

    if (fileId) {
        // Update (PATCH)
        // parents field cannot be set directly on update unless using addParents/removeParents
        const updateMetadata = {
            name: fileName,
            mimeType: 'text/markdown',
        };

        const multipartRequestBody =
            `--foo_bar_baz\nContent-Type: application/json; charset=UTF-8\n\n` +
            JSON.stringify(updateMetadata) +
            `\n--foo_bar_baz\nContent-Type: text/markdown\n\n` +
            finalContent +
            `\n--foo_bar_baz--`;

        await gapi.client.request({
            path: `/upload/drive/v3/files/${fileId}`,
            method: 'PATCH',
            params: { uploadType: 'multipart' },
            headers: { 'Content-Type': 'multipart/related; boundary=foo_bar_baz' },
            body: multipartRequestBody,
        });
    } else {
        // Create (POST)
        const createMetadata = {
            name: fileName,
            mimeType: 'text/markdown',
            parents: [folderId],
        };

        const multipartRequestBody =
            `--foo_bar_baz\nContent-Type: application/json; charset=UTF-8\n\n` +
            JSON.stringify(createMetadata) +
            `\n--foo_bar_baz\nContent-Type: text/markdown\n\n` +
            finalContent +
            `\n--foo_bar_baz--`;

        await gapi.client.request({
            path: '/upload/drive/v3/files',
            method: 'POST',
            params: { uploadType: 'multipart' },
            headers: { 'Content-Type': 'multipart/related; boundary=foo_bar_baz' },
            body: multipartRequestBody,
        });
    }
}

function getFileName() {
    // Format: YYYY-MM-DD.md
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}.md`;
}

// --- Offline & Sync Logic ---

window.addEventListener('online', () => {
    STATE.isOnline = true;
    updateStatus('ONLINE', 'online');
    syncPendingData();
});

window.addEventListener('offline', () => {
    STATE.isOnline = false;
    updateStatus('OFFLINE', 'offline');
});

function checkOnlineStatus() {
    if (navigator.onLine) {
        updateStatus('ONLINE', 'online');
    } else {
        updateStatus('OFFLINE', 'offline');
    }
}

function updateStatus(text, type) {
    els.statusText.textContent = text;
    els.statusDot.className = 'status-dot ' + type;
}

function saveToLocal(text) {
    const pending = JSON.parse(localStorage.getItem('pending_memos') || '[]');
    pending.push({
        text: text,
        timestamp: new Date().toISOString(),
    });
    localStorage.setItem('pending_memos', JSON.stringify(pending));
}

function loadOfflineData() {
    // Just checks if there is any, maybe indicator later
    const pending = JSON.parse(localStorage.getItem('pending_memos') || '[]');
    if (pending.length > 0) {
        console.log(`${pending.length} unsaved memos found.`);
    }
}

async function syncPendingData() {
    if (!STATE.isAuthenticated || !STATE.isOnline) return;

    const pending = JSON.parse(localStorage.getItem('pending_memos') || '[]');
    if (pending.length === 0) return;

    updateStatus('Syncing...', 'syncing');

    // Try to save one large chunk or individually
    // Let's combine them for efficiency
    let combinedText = '';
    pending.forEach(item => {
        combinedText += `\n(Synced from offline)\n${item.text}\n`;
    });

    try {
        await saveToDrive(combinedText);
        localStorage.removeItem('pending_memos'); // Clear after success
        updateStatus('Synced!', 'online');
        setTimeout(() => updateStatus('ONLINE', 'online'), 2000);
    } catch (err) {
        console.error('Sync failed', err);
        updateStatus('Sync Failed', 'offline'); // Keep offline status so we try again
    }
}
