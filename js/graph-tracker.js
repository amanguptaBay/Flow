import { Graph, uuidv4 } from './graph.js';

/**
 * GraphTracker — keeps track of the Graph over time.
 *
 * Wraps a Graph instance with an action log so that every mutation
 * is recorded and the full history can be replayed. This is the
 * single source of truth for both the live graph state and the
 * serialised history written to disk.
 *
 * All mutations to the graph must go through the public API here
 * (addNode, editNode, deleteNode, setWorking) so they are logged.
 * The Timeline can call viewAt() to non-destructively inspect any
 * historical state without touching the live action log.
 */
export class GraphTracker {
    constructor() {
        this.graph = new Graph();
        this.actionLog = [];
        this._nodeSeq = 1;
        this._initFresh();
    }

    // ── Mutation API ──────────────────────────────────────────────

    /** Add a child to the given parent. Returns the new node or null. */
    addNode(parentId, label) {
        const childId = uuidv4();
        const childLabel = label || `node ${this._nodeSeq++}`;
        this._dispatch('addNode', { parentId, childId, childLabel });
        return this.graph.getNode(childId);
    }

    /** Rename a node. Returns false if the node doesn't exist. */
    editNode(id, newLabel) {
        const node = this.graph.getNode(id);
        if (!node) return false;
        this._dispatch('editNodeLabel', { nodeId: id, oldLabel: node.label, newLabel });
        return true;
    }

    /** Delete a node and its descendants. Returns false if not possible. */
    deleteNode(id) {
        const node = this.graph.getNode(id);
        if (!node || id === this.graph.root?.id) return false;
        const parent = this.graph.getNode(node.parentId);
        this._dispatch('deleteNode', { nodeId: id, nodeLabel: node.label, parentId: parent?.id });
        return true;
    }

    /** Mark a node as the currently active working node. */
    setWorking(id) {
        if (!this.graph.index.has(id)) return false;
        this._dispatch('setWorking', { id });
        return true;
    }

    /** Wipe the graph and start fresh with a new root. */
    resetAll() {
        this._replayLog([], true);
    }

    // ── Serialisation / Persistence ───────────────────────────────

    /**
     * Replace the current graph state by replaying a previously
     * serialised action log (e.g. loaded from a JSON file).
     */
    loadLog(log) {
        this._replayLog(log, true);
    }

    /** Serialise the current action log to a JSON string for saving. */
    serialize() {
        return JSON.stringify(this.actionLog, null, 2);
    }

    // ── Timeline Support ──────────────────────────────────────────

    /**
     * Set the graph to the state it was in at a specific index within
     * a provided full log. Used by Timeline scrubbing.
     *
     * Does NOT update this.actionLog and does NOT emit graph-changed,
     * so it is safe to call repeatedly without triggering auto-saves.
     */
    viewAt(fullLog, index) {
        const partial = fullLog.slice(0, index + 1);
        this._replayLog(partial, false);
    }

    // ── Private ───────────────────────────────────────────────────

    _initFresh() {
        const rootId = uuidv4();
        this.graph = new Graph();
        this.graph.init(rootId);
        this.actionLog = [{ timestamp: Date.now(), type: 'init', rootId }];
        this._nodeSeq = 1;
    }

    /**
     * Record an action, apply it to the live graph, and (optionally) emit.
     * This is the single write path for all live mutations.
     */
    _dispatch(type, data = {}) {
        const action = { timestamp: Date.now(), type, ...data };
        this._applyAction(action);
        this.actionLog.push(action);
        this._emitChanged();
    }

    /**
     * Rebuild graph state from scratch using the given log.
     * If `emit` is true, fires graph-changed after replay so that
     * auto-save picks up the new state.
     */
    _replayLog(log, emit) {
        this._nodeSeq = 1;

        // Determine the root node ID ─────────────────────────────
        let rootId;
        const initAction = log.find(a => a.type === 'init' || a.type === 'resetAll');

        if (initAction) {
            rootId = initAction.rootId;
        } else {
            // Infer root from first action to support legacy / trimmed logs
            const first = log[0];
            if (!first) {
                rootId = uuidv4();
            } else if (first.type === 'addNode') {
                rootId = first.parentId;
            } else if (first.type === 'editNodeLabel' || first.type === 'editLabel') {
                rootId = first.nodeId ?? first.id;
            } else if (first.type === 'deleteNode') {
                rootId = first.parentId;
            } else {
                const firstAdd = log.find(a => a.type === 'addNode');
                rootId = firstAdd ? firstAdd.parentId : uuidv4();
            }
        }

        // Build fresh graph ───────────────────────────────────────
        this.graph = new Graph();
        this.graph.init(rootId);
        this.actionLog = [];

        // Ensure an init action is always the first entry
        if (!initAction) {
            this.actionLog.push({ timestamp: Date.now(), type: 'init', rootId });
        }

        for (const action of log) {
            this._applyAction(action);
            this.actionLog.push(action);
        }

        if (emit) this._emitChanged();
    }

    /**
     * Apply a single action to the live graph.
     * Handles both current and legacy action field names.
     */
    _applyAction(action) {
        const g = this.graph;
        switch (action.type) {
            case 'addNode':
                g.addNode(action.parentId, action.childLabel, action.childId);
                break;

            case 'editLabel':      // legacy alias
            case 'editNodeLabel':
                g.editNode(action.id ?? action.nodeId, action.newLabel);
                break;

            case 'deleteNode':
                g.deleteNode(action.nodeId);
                break;

            case 'setWorking':
                g.setWorking(action.id);
                break;

            case 'init':
            case 'resetAll':
                // Handled during _replayLog setup; nothing to do here.
                break;

            default:
                console.warn('[GraphTracker] Unknown action type:', action.type);
        }
    }

    _emitChanged() {
        window.dispatchEvent(new CustomEvent('graph-changed', {
            detail: { actionLog: this.actionLog }
        }));
    }
}
