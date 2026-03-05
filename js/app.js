import { GraphTracker } from './graph-tracker.js';
import { Visualizer }   from './visualizer.js';
import { Timeline }     from './timeline.js';
import * as FS          from './fs-helpers.js';
import * as Auth        from './auth.js';
import * as Firestore   from './firestore.js';

/**
 * App — the controller.
 *
 * Screens: auth → fileList → edit / timeline
 * Offline mode skips auth/fileList and uses localStorage only.
 */
class App {
    constructor() {
        this.tracker    = new GraphTracker();
        this.visualizer = new Visualizer(this.tracker, '#svg');
        this.timeline   = new Timeline(this.tracker, this.visualizer);
        this.ghostInput = document.getElementById('ghost-input');

        // ── State ────────────────────────────────────────────────
        this.mode            = 'init';   // 'init' | 'auth' | 'fileList' | 'edit' | 'timeline'
        this.offlineMode     = false;
        this.currentUserId   = null;
        this.currentFileId   = null;
        this.currentFileName = '';
        this._firestoreSaveTimer = null;

        this._setupUI();

        // ── Global event listeners ───────────────────────────────
        window.addEventListener('graph-changed', (e) => {
            const log = e.detail.actionLog;

            // Always save to localStorage immediately
            if (this.offlineMode) {
                FS.saveToLocalStorage(log);
            } else if (this.currentFileId) {
                FS.saveToLocalStorageForFile(this.currentFileId, log);
                this._debouncedFirestoreSave(log);
            }
        });

        window.addEventListener('switch-to-edit', (e) => {
            this._startEditMode(e.detail.log);
        });

        window.addEventListener('auth-state-changed', (e) => {
            const user = e.detail.user;
            if (user) {
                this.currentUserId = user.uid;
                this.offlineMode = false;
                this._showFileList();
            } else {
                this.currentUserId = null;
                this.currentFileId = null;
                if (!this.offlineMode) this._showAuthScreen();
            }
        });

        addEventListener('resize', () => this._repositionInput());

        // Kick off auth listener (will trigger auth-state-changed)
        Auth.initAuthListener();
    }

    // ── UI setup ─────────────────────────────────────────────────

    _setupUI() {

        // ── Auth screen ──────────────────────────────────────────
        document.getElementById('btn-google-signin').addEventListener('click', async () => {
            try { await Auth.signInWithGoogle(); }
            catch (err) { if (err.code !== 'auth/popup-closed-by-user') console.error('Google sign-in failed:', err); }
        });

        document.getElementById('btn-offline').addEventListener('click', () => {
            this._enterOfflineMode();
        });

        // ── File list screen ─────────────────────────────────────
        document.getElementById('btn-new-graph').addEventListener('click', () => this._createNewGraph());
        document.getElementById('btn-import-file').addEventListener('click', () => this._importFile());
        document.getElementById('btn-signout').addEventListener('click', async () => {
            await Auth.signOut();
        });

        // ── Offline landing page ─────────────────────────────────
        if (FS.hasLocalStorage()) {
            document.getElementById('btn-resume').style.display = 'block';
        }
        document.getElementById('btn-resume').addEventListener('click', () => {
            const log = FS.loadFromLocalStorage();
            if (log) this._startEditMode(log);
        });

        document.getElementById('btn-start-new').addEventListener('click', () => {
            FS.clearLocalStorage();
            this._startEditMode([]);
        });

        document.getElementById('btn-load-file').addEventListener('click', async () => {
            try {
                const content = await FS.loadFileViaInput();
                const log = JSON.parse(content);
                this._startTimelineMode(log);
            } catch (err) {
                if (err.message !== 'Cancelled') {
                    console.error('Failed to load file:', err);
                    alert('Error loading file. Check the console for details.');
                }
            }
        });

        document.getElementById('btn-go-online').addEventListener('click', () => {
            this._showAuthScreen();
        });

        // ── Toolbar ──────────────────────────────────────────────
        document.getElementById('exportBtn').addEventListener('click', () => {
            const name = this.currentFileName || 'thinkingdfs-graph';
            FS.exportFile(this.tracker.serialize(), `${name}.json`);
        });

        document.getElementById('btn-back-to-files').addEventListener('click', () => {
            if (this.offlineMode) {
                this._enterOfflineMode();
            } else {
                this.currentFileId = null;
                this.currentFileName = '';
                this._showFileList();
            }
        });

        document.getElementById('replayBtn').addEventListener('click', () => {
            this._startTimelineMode(this.tracker.actionLog);
        });

        document.getElementById('resetBtn').addEventListener('click', () => {
            const rootId = this.tracker.graph.root.id;
            this.tracker.setWorking(rootId);
            this._updateWorkingInfo();
            this.visualizer.render(() => {
                this.visualizer.focusNode(rootId);
                this._repositionInput();
                this.ghostInput.focus();
            });
        });

        // ── Ghost input ──────────────────────────────────────────
        this.ghostInput.addEventListener('keydown', e => {
            const ctrl = e.metaKey || e.ctrlKey;
            const { graph } = this.tracker;

            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.visualizer.editingNodeId) {
                    this._commitEditNode();
                } else {
                    this._handleAdd(e.shiftKey);
                }

            } else if (e.key === 'Escape') {
                e.preventDefault();
                this._cancelEdit();

            } else if (ctrl && e.key === 'ArrowUp') {
                e.preventDefault();
                const n = graph.getNode(graph.workingId);
                if (n?.parentId) this._setWorking(n.parentId);

            } else if (ctrl && e.key === 'ArrowDown') {
                e.preventDefault();
                const n = graph.getNode(graph.workingId);
                if (n?.children.length) this._setWorking(n.children[0].id);

            } else if (ctrl && e.key === 'ArrowLeft') {
                e.preventDefault();
                this._traverseSibling(-1);

            } else if (ctrl && e.key === 'ArrowRight') {
                e.preventDefault();
                this._traverseSibling(1);

            } else if (ctrl && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                this._startEditNode(graph.workingId);

            } else if (e.key === 'Backspace' && this.ghostInput.value === '' && !this.visualizer.editingNodeId) {
                e.preventDefault();
                this._deleteNode();
            }
        });

        // Clicking the SVG background refocuses the ghost input
        this.visualizer.svg.on('click', () => {
            if (this.ghostInput.style.display !== 'none') this.ghostInput.focus();
        });

        // Visualizer callbacks
        this.visualizer.onNodeClick    = (id) => this._setWorking(id);
        this.visualizer.onNodeDblClick = (id) => this._startEditNode(id);
        this.visualizer.onGhostClick   = ()   => this.ghostInput.focus();
        this.visualizer.onZoom         = ()   => this._repositionInput();
    }

    // ── Screen transitions ───────────────────────────────────────

    _hideAllScreens() {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('file-list-screen').style.display = 'none';
        document.getElementById('landing-page').style.display = 'none';
    }

    _showAuthScreen() {
        this.mode = 'auth';
        this.offlineMode = false;
        this._hideAllScreens();
        document.getElementById('auth-screen').style.display = 'flex';
    }

    _enterOfflineMode() {
        this.offlineMode = true;
        this._hideAllScreens();
        document.getElementById('landing-page').style.display = 'flex';

        // Show resume button if localStorage has data
        if (FS.hasLocalStorage()) {
            document.getElementById('btn-resume').style.display = 'block';
        }

        // Hide back-to-files toolbar button in offline mode
        document.getElementById('btn-back-to-files').style.display = 'none';
        document.getElementById('file-name-display').style.display = 'none';
        document.getElementById('app-title').style.display = '';
    }

    async _showFileList() {
        this.mode = 'fileList';
        this._hideAllScreens();
        document.getElementById('file-list-screen').style.display = 'flex';

        // Hide toolbar file context
        document.getElementById('btn-back-to-files').style.display = 'none';
        document.getElementById('file-name-display').style.display = 'none';
        document.getElementById('app-title').style.display = '';
        this._setSaveStatus('');

        // Check for localStorage migration on first visit
        await this._checkLocalStorageMigration();

        // Show loading
        const listEl    = document.getElementById('file-list');
        const emptyEl   = document.getElementById('file-list-empty');
        const loadingEl = document.getElementById('file-list-loading');
        listEl.innerHTML = '';
        emptyEl.style.display = 'none';
        loadingEl.style.display = 'block';

        try {
            const files = await Firestore.listFiles(this.currentUserId);
            loadingEl.style.display = 'none';

            if (files.length === 0) {
                emptyEl.style.display = 'block';
                return;
            }

            for (const file of files) {
                listEl.appendChild(this._createFileCard(file));
            }
        } catch (err) {
            console.error('[App] Failed to load file list:', err);
            loadingEl.textContent = 'Failed to load files. Check your connection.';
        }
    }

    _createFileCard(file) {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.dataset.fileId = file.id;

        const updatedAt = file.updatedAt?.toDate?.() ?? new Date();
        const timeAgo = this._timeAgo(updatedAt);

        const nameEl = document.createElement('div');
        nameEl.className = 'file-card-name';
        nameEl.textContent = file.name;

        const metaEl = document.createElement('div');
        metaEl.className = 'file-card-meta';
        metaEl.textContent = `Updated ${timeAgo}`;

        const actionsEl = document.createElement('div');
        actionsEl.className = 'file-card-actions';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'file-card-delete';
        deleteBtn.title = 'Delete';
        deleteBtn.textContent = '\u{1F5D1}';
        actionsEl.appendChild(deleteBtn);

        card.append(nameEl, metaEl, actionsEl);

        // Click card to open
        card.addEventListener('click', (e) => {
            if (e.target.closest('.file-card-delete')) return;
            this._openFile(file.id, file.name);
        });

        // Delete button
        deleteBtn.addEventListener('click', async () => {
            if (!confirm(`Delete "${file.name}"?`)) return;
            try {
                await Firestore.deleteFile(this.currentUserId, file.id);
                card.remove();
                const listEl = document.getElementById('file-list');
                if (listEl.children.length === 0) {
                    document.getElementById('file-list-empty').style.display = 'block';
                }
            } catch (err) {
                console.error('Failed to delete file:', err);
            }
        });

        return card;
    }

    async _openFile(fileId, fileName) {
        this.currentFileId   = fileId;
        this.currentFileName = fileName;

        // Try localStorage cache first
        let log = FS.loadFromLocalStorageForFile(fileId);

        if (!log) {
            const fileData = await Firestore.loadFile(this.currentUserId, fileId);
            if (!fileData) {
                alert('File not found.');
                return;
            }
            log = fileData.actionLog || [];
        }

        FS.setCurrentFile(fileId);
        this._showFileContext(fileName);
        this._startEditMode(log);
    }

    async _createNewGraph() {
        try {
            const files = await Firestore.listFiles(this.currentUserId);
            const existingNames = files.map(f => f.name);

            let name = prompt('Graph name:', 'Untitled Graph');
            if (!name) return;

            while (existingNames.includes(name)) {
                alert(`A graph named "${name}" already exists.`);
                name = prompt('Choose a different name:', 'Untitled Graph');
                if (!name) return;
            }

            const fileId = await Firestore.createFile(this.currentUserId, name, []);
            this._openFile(fileId, name);
        } catch (err) {
            console.error('Failed to create graph:', err);
            alert('Failed to create graph. Check your connection.');
        }
    }

    async _importFile() {
        try {
            const content = await FS.loadFileViaInput();
            const log = JSON.parse(content);

            const files = await Firestore.listFiles(this.currentUserId);
            const existingNames = files.map(f => f.name);

            let name = prompt('Name for this graph:', 'Imported Graph');
            if (!name) return;

            while (existingNames.includes(name)) {
                alert(`A graph named "${name}" already exists.`);
                name = prompt('Choose a different name:', 'Imported Graph');
                if (!name) return;
            }

            const fileId = await Firestore.createFile(this.currentUserId, name, log);
            this._openFile(fileId, name);
        } catch (err) {
            if (err.message !== 'Cancelled') {
                console.error('Failed to import file:', err);
                alert('Error importing file.');
            }
        }
    }

    // ── Mode transitions ─────────────────────────────────────────

    _startEditMode(initialLog) {
        this.mode = 'edit';
        this._hideAllScreens();
        this.timeline.hide();

        // Show back button — goes to offline landing or file list depending on mode
        if (this.offlineMode) {
            document.getElementById('btn-back-to-files').style.display = 'inline-block';
            document.getElementById('app-title').style.display = 'none';
        }
        document.getElementById('replayBtn').style.display = 'inline-block';
        document.getElementById('save-status').style.display = this.offlineMode ? 'none' : '';
        this.visualizer.showGhost = true;
        this.ghostInput.style.display = 'block';
        this.tracker.loadLog(initialLog);
        this.visualizer.render(() => {
            setTimeout(() => {
                this.visualizer.fitToContent();
                this._repositionInput();
                this.ghostInput.focus();
            }, 50);
        });
        this._updateWorkingInfo();
    }

    _startTimelineMode(log) {
        this._hideAllScreens();
        this.mode = 'timeline';
        this.visualizer.showGhost = false;
        this.ghostInput.style.display = 'none';
        document.getElementById('replayBtn').style.display = 'none';
        this.timeline.init(log);
    }

    // ── Firestore auto-save ──────────────────────────────────────

    _debouncedFirestoreSave(log) {
        clearTimeout(this._firestoreSaveTimer);
        this._setSaveStatus('pending');

        this._firestoreSaveTimer = setTimeout(async () => {
            try {
                this._setSaveStatus('saving');
                const compacted = Firestore.compactLog(log);
                await Firestore.saveFile(this.currentUserId, this.currentFileId, compacted);
                this._setSaveStatus('saved');
            } catch (err) {
                console.error('[App] Firestore save failed:', err);
                this._setSaveStatus('error');
            }
        }, 2000);
    }

    _setSaveStatus(status) {
        const el = document.getElementById('save-status');
        if (!el) return;
        el.className = `save-status ${status}`;
        el.textContent = {
            pending: '',
            saving:  'Saving\u2026',
            saved:   'Saved',
            error:   'Save failed',
        }[status] || '';
    }

    // ── Toolbar file context ─────────────────────────────────────

    _showFileContext(fileName) {
        document.getElementById('app-title').style.display = 'none';
        document.getElementById('btn-back-to-files').style.display = 'inline-block';
        document.getElementById('file-name-display').style.display = 'inline-block';
        document.getElementById('file-name-display').textContent = fileName;
    }

    // ── localStorage migration ───────────────────────────────────

    async _checkLocalStorageMigration() {
        if (!FS.hasLocalStorage()) return;

        const shouldMigrate = confirm(
            'You have a locally saved graph. Would you like to save it to your account?'
        );

        if (shouldMigrate) {
            const log = FS.loadFromLocalStorage();
            if (log) {
                const name = prompt('Name for this graph:', 'Migrated Graph');
                if (name) {
                    await Firestore.createFile(this.currentUserId, name, log);
                }
            }
        }
        FS.clearLocalStorage();
    }

    // ── Actions ───────────────────────────────────────────────────

    _handleAdd(keepFocus = false) {
        const label = this.ghostInput.value.trim();
        const newNode = this.tracker.addNode(this.tracker.graph.workingId, label);
        if (newNode) {
            if (!keepFocus) this.tracker.setWorking(newNode.id);
            this.ghostInput.value = '';
            this.visualizer.render(() => {
                this.visualizer.focusNode(newNode.id);
                this._repositionInput();
                this.ghostInput.focus();
            });
            this._updateWorkingInfo();
        }
    }

    _deleteNode() {
        const { graph } = this.tracker;
        if (this.tracker.deleteNode(graph.workingId)) {
            this.visualizer.render(() => {
                this.visualizer.focusNode(graph.workingId);
                this._repositionInput();
                this.ghostInput.focus();
            });
            this._updateWorkingInfo();
        }
    }

    _setWorking(id) {
        this.tracker.setWorking(id);
        this._updateWorkingInfo();
        this.visualizer.render(() => {
            this.visualizer.focusNode(id);
            this._repositionInput();
            this.ghostInput.focus();
        });
    }

    _traverseSibling(dir) {
        const { graph } = this.tracker;
        const current = graph.getNode(graph.workingId);
        if (!current?.parentId) return;
        const parent = graph.getNode(current.parentId);
        const idx = parent.children.findIndex(n => n.id === current.id);
        const newIdx = idx + dir;
        if (newIdx >= 0 && newIdx < parent.children.length) {
            this._setWorking(parent.children[newIdx].id);
        }
    }

    _startEditNode(id) {
        const node = this.tracker.graph.getNode(id);
        if (!node) return;
        this.visualizer.editingNodeId = id;
        this.ghostInput.value = node.label;
        this.visualizer.render(() => {
            this._repositionInput();
            this.ghostInput.select();
            this.ghostInput.focus();
        });
    }

    _commitEditNode() {
        const id = this.visualizer.editingNodeId;
        if (!id) return;
        const node = this.tracker.graph.getNode(id);
        const newLabel = this.ghostInput.value.trim();
        if (node && newLabel && newLabel !== node.label) {
            this.tracker.editNode(id, newLabel);
        }
        this.visualizer.editingNodeId = null;
        this.ghostInput.value = '';
        this.visualizer.render(() => {
            this._repositionInput();
            this.ghostInput.focus();
        });
    }

    _cancelEdit() {
        this.visualizer.editingNodeId = null;
        this.ghostInput.value = '';
        this.visualizer.render(() => {
            this._repositionInput();
            this.ghostInput.focus();
        });
    }

    // ── Helpers ───────────────────────────────────────────────────

    _repositionInput() {
        const id  = this.visualizer.editingNodeId ?? '__ghost__';
        const pos = this.visualizer.getScreenPos(id);
        if (!pos) return;
        this.ghostInput.style.left = `${pos.x}px`;
        this.ghostInput.style.top  = `${pos.y}px`;
    }

    _updateWorkingInfo() {
        const node = this.tracker.graph.getNode(this.tracker.graph.workingId);
        document.getElementById('workingInfo').textContent =
            node ? `Working: ${node.label}` : 'Working: none';
    }

    _timeAgo(date) {
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (seconds < 60)   return 'just now';
        const mins  = Math.floor(seconds / 60);
        if (mins < 60)      return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24)     return `${hours}h ago`;
        const days  = Math.floor(hours / 24);
        if (days < 30)      return `${days}d ago`;
        const months = Math.floor(days / 30);
        return `${months}mo ago`;
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

window.addEventListener('load', () => { window.app = new App(); });
