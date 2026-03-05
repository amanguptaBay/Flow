import { FLAGS } from './flags.js';

/**
 * Timeline — the playback / scrubbing view.
 *
 * Holds the complete action log that was loaded from a file and lets the
 * user move through it step by step or via the slider. Scrubbing calls
 * tracker.viewAt() which rebuilds the graph at that point in time without
 * touching the live action log, so switching back to edit mode always
 * starts from the correct base state.
 *
 * Dispatches a 'switch-to-edit' custom event when the user clicks
 * "Edit Here", passing the partial log up to the current position.
 */
export class Timeline {
    constructor(tracker, visualizer) {
        this.tracker = tracker;
        this.visualizer = visualizer;

        this.container = document.getElementById('timeline-controls');
        this.slider    = document.getElementById('timeline-slider');
        this.startBtn  = document.getElementById('timeline-start');
        this.prevBtn   = document.getElementById('timeline-prev');
        this.nextBtn   = document.getElementById('timeline-next');
        this.playBtn   = document.getElementById('timeline-play');
        this.editBtn   = document.getElementById('timeline-edit');

        this.isPlaying = false;
        this.playInterval = null;
        this.fullLog = [];
        this.currentIndex = 0;

        this._setupListeners();
    }

    /** Load a full action log and display the graph at the final state. */
    init(log) {
        this.fullLog = log;
        this.currentIndex = Math.max(0, log.length - 1);
        this.slider.max = Math.max(0, log.length - 1);
        this.slider.value = this.currentIndex;
        this.container.style.display = 'flex';
        this._updateGraph();
    }

    show() { this.container.style.display = 'flex'; }

    hide() {
        this.container.style.display = 'none';
        this.pause();
    }

    /** Jump to an arbitrary position in the log. */
    jumpTo(index) {
        this.currentIndex = Math.max(0, Math.min(index, this.fullLog.length - 1));
        this.slider.value = this.currentIndex;
        this._updateGraph();
    }

    step(dir) { this.jumpTo(this.currentIndex + dir); }

    play() {
        this.isPlaying = true;
        this.playBtn.textContent = 'Pause';
        this.playInterval = setInterval(() => {
            if (this.currentIndex < this.fullLog.length - 1) {
                this.step(1);
            } else {
                this.pause();
            }
        }, 500);
    }

    pause() {
        this.isPlaying = false;
        this.playBtn.textContent = 'Play';
        clearInterval(this.playInterval);
    }

    // ── Private ───────────────────────────────────────────────────

    _setupListeners() {
        // Slider scrubbing is opt-in via feature flag
        if (FLAGS.timeline_scrub) {
            this.slider.addEventListener('input', e => this.jumpTo(parseInt(e.target.value)));
        } else {
            this.slider.style.display = 'none';
        }
        this.startBtn.addEventListener('click', () => this.jumpTo(0));
        this.prevBtn.addEventListener('click', () => this.step(-1));
        this.nextBtn.addEventListener('click', () => this.step(1));
        this.playBtn.addEventListener('click', () => this.isPlaying ? this.pause() : this.play());
        this.editBtn.addEventListener('click', () => {
            const logUpToHere = this.fullLog.slice(0, this.currentIndex + 1);
            window.dispatchEvent(new CustomEvent('switch-to-edit', { detail: { log: logUpToHere } }));
        });
    }

    _updateGraph() {
        // Rebuild graph at the current timeline position without mutating
        // the tracker's live action log.
        this.tracker.viewAt(this.fullLog, this.currentIndex);
        this.visualizer.render(() => {
            const last = this.fullLog[this.currentIndex];
            if (last) {
                const id = last.childId ?? last.nodeId ?? last.id;
                if (id) this.visualizer.focusNode(id);
            }
        });
    }
}
