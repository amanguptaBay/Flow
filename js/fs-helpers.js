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
