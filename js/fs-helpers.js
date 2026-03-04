const LS_KEY = 'thinkingdfs_v3';

// ── localStorage ──────────────────────────────────────────────────────────────

export function saveToLocalStorage(log) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(log));
    } catch (e) {
        console.warn('[FS] localStorage save failed:', e);
    }
}

export function loadFromLocalStorage() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

export function hasLocalStorage() {
    return localStorage.getItem(LS_KEY) !== null;
}

export function clearLocalStorage() {
    localStorage.removeItem(LS_KEY);
}

// ── Per-file localStorage (multi-file cache for Firestore-backed files) ───────

const LS_CURRENT_FILE_KEY = 'thinkingdfs_currentFile';

export function saveToLocalStorageForFile(fileId, log) {
    try {
        localStorage.setItem(`thinkingdfs_file_${fileId}`, JSON.stringify(log));
    } catch (e) {
        console.warn('[FS] localStorage save failed:', e);
    }
}

export function loadFromLocalStorageForFile(fileId) {
    try {
        const raw = localStorage.getItem(`thinkingdfs_file_${fileId}`);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

export function setCurrentFile(fileId) {
    localStorage.setItem(LS_CURRENT_FILE_KEY, fileId);
}

export function getCurrentFile() {
    return localStorage.getItem(LS_CURRENT_FILE_KEY);
}

// ── File input (load) ─────────────────────────────────────────────────────────

export function loadFileViaInput() {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return reject(new Error('No file selected'));
            try {
                resolve(await file.text());
            } catch (err) {
                reject(err);
            }
        };
        // Some browsers fire oncancel, others just never fire onchange
        input.oncancel = () => reject(new Error('Cancelled'));
        input.click();
    });
}

// ── Blob download (export) ────────────────────────────────────────────────────

export function exportFile(content, filename = 'thinkingdfs-graph.json') {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
