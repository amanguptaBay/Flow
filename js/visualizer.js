/**
 * Visualizer — the D3 rendering view.
 *
 * Always renders a "ghost" child node attached to the currently active
 * (working) node. The ghost represents where the next new node will land,
 * and its position is used by the App to overlay the floating text input —
 * making the graph itself the single point of focus for all text entry.
 *
 * Callbacks the controller must assign:
 *   onNodeClick(id)    — single click on a real node
 *   onNodeDblClick(id) — double-click on a real node (edit label)
 *   onGhostClick()     — click on the ghost node (re-focus the input)
 *   onZoom()           — any zoom/pan event (reposition the input overlay)
 */
export class Visualizer {
    constructor(tracker, svgSelector) {
        this.tracker       = tracker;
        this.editingNodeId = null; // id of the node whose label is being edited
        this.showGhost     = true; // false during timeline playback

        this._nodePositions = new Map(); // id → {x, y} in D3 layout space

        this.svg  = d3.select(svgSelector);
        this.g    = this.svg.append('g');
        this.defs = this.svg.append('defs');

        this.defs.append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 10).attr('refY', 0)
            .attr('markerWidth', 8).attr('markerHeight', 8)
            .attr('orient', 'auto')
            .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#2a3c52');

        this.linkLayer = this.g.append('g').attr('class', 'links');
        this.nodeLayer = this.g.append('g').attr('class', 'nodes');

        this.zoom = d3.zoom()
            .scaleExtent([0.2, 2.5])
            .on('zoom', ev => {
                const { k } = ev.transform;
                this.g.attr('transform', ev.transform);
                this.nodeLayer.selectAll('text.label')
                    .attr('font-size', `${Math.max(9, 12 / k)}px`)
                    .attr('opacity', Math.min(1, k * 1.2));
                if (this.onZoom) this.onZoom();
            });

        this.svg.call(this.zoom);
        this.stage = document.getElementById('stage');
        this.updateDimensions();
        addEventListener('resize', () => this.updateDimensions());

        this.treeLayout = d3.tree().nodeSize([180, 220]);

        this.onNodeClick    = null;
        this.onNodeDblClick = null;
        this.onGhostClick   = null;
        this.onZoom         = null;
    }

    updateDimensions() {
        if (this.stage) {
            this.svg.attr('width',  this.stage.clientWidth)
                    .attr('height', this.stage.clientHeight);
        }
    }

    render(after) {
        const { graph } = this.tracker;

        // Split text into lines at word boundaries, max maxChars per line.
        const wordWrap = (text, maxChars) => {
            const words = text.split(/\s+/);
            const lines = []; let current = '';
            for (const word of words) {
                const candidate = current ? `${current} ${word}` : word;
                if (candidate.length <= maxChars) {
                    current = candidate;
                } else {
                    if (current) lines.push(current);
                    current = word.length > maxChars ? word.slice(0, maxChars - 1) + '…' : word;
                }
            }
            if (current) lines.push(current);
            return lines;
        };

        // Apply a single truncated line (inactive) or wrapped tspan lines (active).
        const applyLabel = (textEl, d) => {
            if (d.data.id === '__ghost__') { textEl.text(''); return; }
            const full  = d.data.label;
            const active = d.data.id === graph.workingId || d.data.id === this.editingNodeId;
            textEl.selectAll('tspan').remove();
            textEl.text(null);
            if (!active || full.length <= 14) {
                textEl.attr('dy', '0.35em').attr('y', null);
                textEl.text(!active && full.length > 14 ? full.slice(0, 12) + '…' : full);
                return;
            }
            textEl.attr('dy', null).attr('y', null);
            const lh    = 15;
            const lines = wordWrap(full, 20);
            lines.forEach((line, i) => {
                textEl.append('tspan')
                    .attr('x', 0)
                    .attr('y', (i - (lines.length - 1) / 2) * lh)
                    .text(line);
            });
        };

        // Build the display tree — optionally inject a ghost child
        const treeData = this.showGhost
            ? this._buildDisplayRoot(graph.root, graph.workingId)
            : graph.root;

        const root = d3.hierarchy(treeData);
        this.treeLayout(root);

        // Cache final layout positions for the input overlay
        this._nodePositions.clear();
        root.descendants().forEach(d => this._nodePositions.set(d.data.id, { x: d.x, y: d.y }));

        // ── Links ────────────────────────────────────────────────
        const link = this.linkLayer.selectAll('path.link')
            .data(root.links(), d => d.target.data.id);

        link.join(
            enter => enter.append('path')
                .attr('class', d => d.target.data.id === '__ghost__' ? 'link ghost-link' : 'link arrow')
                .attr('d', d => this._connector(d, true))
                .transition().duration(250).attr('d', d => this._connector(d)),
            update => update.transition().duration(250)
                .attr('class', d => d.target.data.id === '__ghost__' ? 'link ghost-link' : 'link arrow')
                .attr('d', d => this._connector(d)),
            exit => exit.transition().duration(200).style('opacity', 0).remove()
        );

        // ── Nodes ────────────────────────────────────────────────
        const nodes = this.nodeLayer.selectAll('g.node')
            .data(root.descendants(), d => d.data.id);

        const enter = nodes.enter().append('g')
            .attr('class', d => d.data.id === '__ghost__' ? 'node ghost' : 'node')
            .attr('transform', d => `translate(${d.parent ? d.parent.x : d.x},${d.parent ? d.parent.y : d.y})`)
            .style('opacity', 0)
            .on('click', (ev, d) => {
                ev.stopPropagation();
                if (d.data.id === '__ghost__') {
                    if (this.onGhostClick) this.onGhostClick();
                    return;
                }
                if (this.onNodeClick) this.onNodeClick(d.data.id);
            })
            .on('dblclick', (ev, d) => {
                ev.stopPropagation();
                if (d.data.id === '__ghost__') {
                    if (this.onGhostClick) this.onGhostClick();
                    return;
                }
                if (this.onNodeDblClick) this.onNodeDblClick(d.data.id);
            })
            .call(g => {
                g.append('circle').attr('r', 70);
                // Text is appended for all nodes; ghost + editing nodes hide it
                // so the floating HTML input can visually take its place.
                // Label is set here on enter so new nodes show their text immediately —
                // the update selection below only runs on already-existing nodes.
                g.append('text').attr('class', 'label')
                    .attr('text-anchor', 'middle')
                    .each(function(d) { applyLabel(d3.select(this), d); });
            });

        enter.transition().duration(250)
            .attr('transform', d => `translate(${d.x},${d.y})`)
            .style('opacity', 1);

        const editingId = this.editingNodeId;

        nodes.transition().duration(250)
            .attr('transform', d => `translate(${d.x},${d.y})`)
            .attr('class', d => {
                const cls = ['node'];
                if (d.data.id === '__ghost__') {
                    cls.push('ghost');
                } else {
                    if (d.data.id === graph.workingId) cls.push('current');
                    if (d.depth === 0) cls.push('root');
                    if (d.data.id === editingId) cls.push('editing');
                }
                return cls.join(' ');
            })
            .select('text.label')
            // Hide SVG text for ghost + editing nodes: the floating input is the
            // visual representation for both of those cases.
            .style('opacity', d =>
                (d.data.id === '__ghost__' || d.data.id === editingId) ? 0 : null
            );

        // Update text content outside the transition so tspan children can be
        // added/removed freely without fighting the transition machinery.
        nodes.select('text.label')
            .each(function(d) { applyLabel(d3.select(this), d); });

        nodes.exit().transition().duration(200).style('opacity', 0).remove();

        if (after) after();
    }

    /**
     * Convert a node's D3 layout position to viewport screen coordinates,
     * accounting for the current zoom/pan transform. Used to position the
     * floating HTML input overlay over the correct node.
     */
    getScreenPos(id) {
        const pos = this._nodePositions.get(id);
        if (!pos) return null;
        const t = d3.zoomTransform(this.svg.node());
        const [sx, sy] = t.apply([pos.x, pos.y]);
        const rect = this.svg.node().getBoundingClientRect();
        return { x: rect.left + sx, y: rect.top + sy };
    }

    /** Smoothly pan + zoom to centre a specific node in the viewport. */
    focusNode(id) {
        const pos = this._nodePositions.get(id);
        if (!pos) return;
        const rect = this.svg.node().getBoundingClientRect();
        const k = 1.2;
        const tx = rect.width  / 2 - pos.x * k;
        const ty = rect.height / 2 - pos.y * k;
        const t = d3.zoomIdentity.translate(tx, ty).scale(k);
        this.svg.transition().duration(500).call(this.zoom.transform, t);
    }

    /** Fit the entire tree into the viewport with a comfortable margin. */
    fitToContent() {
        const bbox = this.g.node().getBBox();
        const rect = this.svg.node().getBoundingClientRect();
        if (!isFinite(bbox.width) || !bbox.width) return;
        const m = 80;
        const k = Math.min((rect.width - m) / bbox.width, (rect.height - m) / bbox.height, 1.5);
        const t = d3.zoomIdentity
            .translate(
                (rect.width  - bbox.width  * k) / 2 - bbox.x * k,
                (rect.height - bbox.height * k) / 2 - bbox.y * k
            )
            .scale(k);
        this.svg.transition().duration(300).call(this.zoom.transform, t);
    }

    // ── Private ───────────────────────────────────────────────────

    /**
     * Recursively clone the graph's root data and inject a single ghost
     * child node at the working node. The clone is ephemeral — it exists
     * only for the duration of the D3 layout + render cycle.
     */
    _buildDisplayRoot(node, workingId) {
        const children = (node.children || []).map(c => this._buildDisplayRoot(c, workingId));
        if (node.id === workingId) {
            children.push({ id: '__ghost__', label: '', children: [], parentId: node.id });
        }
        return { id: node.id, label: node.label, children, parentId: node.parentId };
    }

    _connector(d) {
        const { x: sx, y: sy } = d.source;
        const { x: tx, y: ty } = d.target;
        const r   = 70;
        const y1  = sy + r;          // leave source circle at its bottom edge
        const y2  = ty - r;          // arrive at target circle at its top edge
        const mid = (sy + ty) / 2;   // vertical midpoint between centres
        // Control points directly above/below source and target ensure the
        // curve departs and arrives vertically, so the arrowhead points down.
        return `M${sx},${y1} C${sx},${mid} ${tx},${mid} ${tx},${y2}`;
    }
}
