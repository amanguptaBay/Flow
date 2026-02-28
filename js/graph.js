export function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Graph — the pure tree data structure.
 *
 * Responsible solely for maintaining the tree in memory and
 * performing structural operations on it. No logging, no events,
 * no persistence — just data.
 */
export class Graph {
    constructor() {
        this.root = null;
        this.index = new Map(); // id → node
        this.workingId = null;
    }

    /** Initialise the graph with a single root node. */
    init(rootId, rootLabel = 'root') {
        this.root = { id: rootId, label: rootLabel, children: [], parentId: null };
        this.index.clear();
        this.index.set(rootId, this.root);
        this.workingId = rootId;
    }

    /** O(1) node lookup. Returns null if not found. */
    getNode(id) {
        return this.index.get(id) ?? null;
    }

    /**
     * Add a child node to an existing parent.
     * Callers must supply a deterministic `id` so that replay is consistent.
     * Returns the new node, or null if parentId is not found.
     */
    addNode(parentId, label, id) {
        const parent = this.index.get(parentId);
        if (!parent) return null;
        const node = { id, label, children: [], parentId: parent.id };
        parent.children.push(node);
        this.index.set(id, node);
        return node;
    }

    /** Rename a node. Returns false if the node doesn't exist. */
    editNode(id, newLabel) {
        const node = this.index.get(id);
        if (!node) return false;
        node.label = newLabel;
        return true;
    }

    /**
     * Delete a node and all its descendants.
     * Root cannot be deleted. If the working node is deleted, workingId
     * is moved to the deleted node's parent.
     * Returns false if the node doesn't exist or is root.
     */
    deleteNode(id) {
        if (id === this.root?.id) return false;
        const node = this.index.get(id);
        if (!node) return false;
        const parent = this.index.get(node.parentId);
        if (!parent) return false;

        const removeSubtree = (n) => {
            n.children?.forEach(c => removeSubtree(c));
            this.index.delete(n.id);
        };
        removeSubtree(node);
        parent.children = parent.children.filter(c => c.id !== id);

        if (!this.index.has(this.workingId)) {
            this.workingId = parent.id;
        }
        return true;
    }

    /** Set the currently active (working) node. Returns false if id doesn't exist. */
    setWorking(id) {
        if (!this.index.has(id)) return false;
        this.workingId = id;
        return true;
    }
}
