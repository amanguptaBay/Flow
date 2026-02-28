import { GraphTracker } from './graph-tracker.js';
import { Visualizer }   from './visualizer.js';
import { Timeline }     from './timeline.js';
import * as FS          from './fs-helpers.js';

/**
 * App — the controller.
 *
 * The ghost input (#ghost-input) is the single point of focus for all text
 * entry. The Visualizer positions it over the ghost node (for adding) or
 * over an existing node (for editing). There is no separate toolbar input.
 *
 * Keyboard shortcuts are handled on the ghost input itself so they work
 * naturally alongside typing without any focus-check gymnastics.
 */
class App {
    constructor() {
        this.tracker    = new GraphTracker();
        this.visualizer = new Visualizer(this.tracker, '#svg');
        this.timeline   = new Timeline(this.tracker, this.visualizer);
        this.fileHandle = null;

        this.ghostInput = document.getElementById('ghost-input');

        this._setupUI();

        window.addEventListener('graph-changed', async (e) => {
            if (!this.fileHandle) return;
            try {
                await FS.writeFile(this.fileHandle, JSON.stringify(e.detail.actionLog, null, 2));
            } catch (err) {
                console.error('Auto-save failed', err);
            }
        });

        window.addEventListener('switch-to-edit', (e) => {
            this._startEditMode(e.detail.log);
        });

        addEventListener('resize', () => this._repositionInput());
    }

    // ── UI setup ─────────────────────────────────────────────────

    _setupUI() {
        // Landing page
        document.getElementById('btn-start-new').addEventListener('click', async () => {
            try {
                this.fileHandle = await FS.getNewFileHandle();
                this._startEditMode([]);
                await FS.writeFile(this.fileHandle, this.tracker.serialize());
            } catch (err) {
                console.log('Cancelled or failed to pick file:', err);
            }
        });

        document.getElementById('btn-load-file').addEventListener('click', async () => {
            try {
                this.fileHandle = await FS.getOpenFileHandle();
                const content = await FS.readFile(this.fileHandle);
                const log = JSON.parse(content);
                this._startTimelineMode(log);
            } catch (err) {
                console.error('Failed to load file:', err);
                alert('Error loading file. Check the console for details.');
            }
        });

        // Toolbar buttons
        document.getElementById('centerBtn').addEventListener('click', () => {
            this.visualizer.focusNode(this.tracker.graph.workingId);
            this.ghostInput.focus();
        });

        document.getElementById('resetBtn').addEventListener('click', () => {
            if (confirm('Reset the graph? This cannot be undone.')) {
                this.tracker.resetAll();
                this.visualizer.render(() => {
                    this.visualizer.fitToContent();
                    this._repositionInput();
                });
                this.ghostInput.focus();
            }
        });

        // ── Ghost input ───────────────────────────────────────────
        // The ghost input is the sole keyboard entry point while in edit mode.
        // Shortcuts are embedded here so they coexist naturally with typing.
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
                // Backspace on empty ghost = delete working node
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

    // ── Mode transitions ─────────────────────────────────────────

    _startEditMode(initialLog) {
        document.getElementById('landing-page').style.display = 'none';
        this.timeline.hide();
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
        document.getElementById('landing-page').style.display = 'none';
        this.visualizer.showGhost = false;
        this.ghostInput.style.display = 'none';
        this.timeline.init(log);
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
        // Re-render so the editing node's SVG text hides and the input takes over
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

    /**
     * Move the floating ghost input to sit on top of either the ghost node
     * (normal mode) or the node currently being edited. Called after every
     * render and on zoom/pan/resize.
     */
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
}

window.addEventListener('load', () => { window.app = new App(); });
