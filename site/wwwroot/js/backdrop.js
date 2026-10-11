// Animated background: a first-person view from inside a neural network.
//
// You are standing between the layers, looking along the direction the data
// flows. Each layer is an ordered grid of neurons on a plane facing you; the
// planes recede into the distance, each wired to the next. The view drifts
// slowly forward, so layers pass by you and new ones come out of the haze,
// without end.
//
// Every few seconds a signal starts on the layer just ahead of you and travels
// away into the network. It is a real cascade: a neuron that fires hands the
// signal to one or two of the neurons it is wired to, a spark runs along that
// wire, and the neuron at the far end fires in turn. No spark starts or ends
// in mid-air, so a signal can be followed from layer to layer.
//
// Nothing here is truly random. The wiring of layer k and the path of signal
// number w are fixed by formulas, and UTC time only says where the viewer is
// and how far each signal has got. A refresh, or another visitor, picks the
// scene up exactly where it was.
(() => {
    const canvas = document.querySelector('.backdrop canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const root = document.documentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const COLS = 9, ROWS = 6;      // neurons in one layer
    const SIZE = COLS * ROWS;
    const SPEED = 0.11;            // layers the viewer drifts past per second
    const FAR = 7;                 // layers further ahead than this are lost in the haze
    const EVERY = 2.4;             // seconds between one signal starting and the next
    const HOP = 0.75;              // seconds for a signal to cross from one layer to the next
    const REACH = 8;               // layers a signal travels before it is out of sight
    const FRAME = 1000 / 30;

    // A repeatable value between 0 and 1 for a pair of whole numbers.
    const hash = (a, b) => {
        let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f);
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
        h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    };

    // --- The network. A neuron is (layer k, index i); i runs across the grid row by row.
    // Position on its plane, in plane units: an even grid with a slight hand-set wobble.
    const spot = (k, i) => {
        const col = i % COLS, row = Math.floor(i / COLS);
        return [
            -1.6 + 3.2 * (col + 0.5) / COLS + (hash(k * 131 + i, 1) - 0.5) * 0.05,
            -1 + 2 * (row + 0.5) / ROWS + (hash(k * 131 + i, 2) - 0.5) * 0.05,
        ];
    };

    // The three neurons of the next layer that neuron (k, i) is wired to: the
    // one straight ahead and two of its neighbours.
    const wiring = new Map();
    const wires = (k, i) => {
        const key = k * SIZE + i;
        let out = wiring.get(key);
        if (out) return out;
        const col = i % COLS, row = Math.floor(i / COLS);
        out = [i];
        for (let n = 0; out.length < 3 && n < 12; n++) {
            const c = col + Math.round((hash(key, 10 + n) - 0.5) * 3), r = row + Math.round((hash(key, 40 + n) - 0.5) * 3);
            const j = r * COLS + c;
            if (c >= 0 && c < COLS && r >= 0 && r < ROWS && !out.includes(j)) out.push(j);
        }
        if (wiring.size > 4000) wiring.clear();
        wiring.set(key, out);
        return out;
    };

    // --- The signals. Signal w starts at a fixed time on the layer then just ahead of the viewer.
    const startsAt = (w) => w * EVERY + hash(w, 7) * 0.8;
    // Between half a step and a step and a half ahead, so the first flash is close but in view.
    const startLayer = (w) => Math.floor(startsAt(w) * SPEED + 0.5) + 1;

    // The whole path of signal w: for each layer it crosses, which neurons fire
    // and which wires carry it onward.
    const paths = new Map();
    const pathOf = (w) => {
        let steps = paths.get(w);
        if (steps) return steps;

        const first = startLayer(w);
        // It begins on three or four neurons of the first layer.
        let firing = Array.from({ length: SIZE }, (_, i) => i)
            .sort((p, q) => hash(w * 977 + p, 3) - hash(w * 977 + q, 3)).slice(0, 3 + Math.floor(hash(w, 4) * 2));
        steps = [];
        for (let hop = 0; hop < REACH; hop++) {
            const k = first + hop;
            const sparks = [];
            for (const i of firing) {
                // Each firing neuron passes the signal down its favourite wire, and sometimes a second.
                const ranked = wires(k, i).map((j) => ({ j, pick: hash(w * 31 + k, i * 64 + j) })).sort((p, q) => p.pick - q.pick);
                sparks.push({ from: i, to: ranked[0].j });
                if (ranked[1] && ranked[1].pick < 0.42) sparks.push({ from: i, to: ranked[1].j });
            }
            steps.push({ k, firing, sparks });
            // The neurons reached fire next; the cascade is kept from flooding the layer.
            firing = [...new Set(sparks.map((s) => s.to))].slice(0, 9);
        }
        if (paths.size > 12) paths.clear();
        paths.set(w, steps);
        return steps;
    };

    let width = 0, height = 0, focal = 0, colours = ['#888', '#888'], dark = true, lastDraw = 0;
    // Set once per frame: where the viewer is, and the head's slight sideways drift.
    let viewer = 0, swayX = 0, swayY = 0;

    const resize = () => {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        width = innerWidth;
        height = innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        // A layer one step ahead just about fills the window, so you are inside it.
        focal = Math.max(width / 3.3, height / 2.05);
    };

    // The palette's two colours, as currently resolved by the stylesheet.
    const readColours = () => {
        const style = getComputedStyle(root);
        colours = [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--counter').trim()];
        dark = root.dataset.mode === 'dark';
    };

    const clamp = (v) => Math.max(0, Math.min(1, v));
    const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

    // Perspective: a point on layer k, seen from where the viewer is now.
    const project = (x, y, depth) => [width / 2 + (x - swayX) * focal / depth, height / 2 + (y - swayY) * focal / depth];
    const see = (k, i) => { const [x, y] = spot(k, i); return project(x, y, k - viewer); };
    // Faint in the distance, and fading out as a layer passes the viewer.
    const haze = (depth) => clamp((FAR - depth) / 3.5) * clamp((depth - 0.12) / 0.45);

    // One layer at rest: its grid lines, the wires leaving it, and its neurons.
    const drawLayer = (k) => {
        const depth = k - viewer;
        const fog = haze(depth);
        if (fog <= 0) return;
        const points = Array.from({ length: SIZE }, (_, i) => see(k, i));

        // The lattice that makes the plane read as a layer.
        ctx.strokeStyle = colours[0];
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.13 * fog;
        ctx.beginPath();
        for (let i = 0; i < SIZE; i++) {
            if (i % COLS < COLS - 1) { ctx.moveTo(points[i][0], points[i][1]); ctx.lineTo(points[i + 1][0], points[i + 1][1]); }
            if (i + COLS < SIZE) { ctx.moveTo(points[i][0], points[i][1]); ctx.lineTo(points[i + COLS][0], points[i + COLS][1]); }
        }
        ctx.stroke();

        // The wires on to the next layer, running away from you.
        const next = depth + 1;
        if (haze(next) > 0) {
            ctx.globalAlpha = 0.07 * Math.min(fog, haze(next));
            ctx.beginPath();
            for (let i = 0; i < SIZE; i++) {
                for (const j of wires(k, i)) {
                    const [x, y] = see(k + 1, j);
                    ctx.moveTo(points[i][0], points[i][1]);
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }

        // The neurons at rest.
        const radius = Math.max(0.8, Math.min(11, 0.014 * focal / depth));
        ctx.fillStyle = colours[0];
        ctx.globalAlpha = 0.3 * fog;
        ctx.beginPath();
        for (const [x, y] of points) { ctx.moveTo(x + radius, y); ctx.arc(x, y, radius, 0, Math.PI * 2); }
        ctx.fill();
    };

    // A neuron firing: a bright core with a halo. `light` is 0..1.
    const drawFlash = (k, i, light, colour) => {
        const depth = k - viewer;
        const fog = haze(depth);
        if (fog <= 0 || light <= 0.02) return;
        const [x, y] = see(k, i);
        const radius = Math.max(0.8, Math.min(11, 0.014 * focal / depth));
        ctx.fillStyle = colour;
        ctx.globalAlpha = 0.2 * light * fog;
        ctx.beginPath();
        ctx.arc(x, y, radius * (2.6 + 3 * light), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = (0.35 + 0.65 * light) * fog;
        ctx.beginPath();
        ctx.arc(x, y, radius * (1 + 0.7 * light), 0, Math.PI * 2);
        ctx.fill();
    };

    // The wire from (k, from) to (k + 1, to), lit, with a spark `u` of the way along it.
    const drawSpark = (k, spark, u, colour) => {
        const near = k - viewer, far = near + 1;
        const fog = Math.min(haze(near), haze(far));
        if (fog <= 0) return;
        const [x1, y1] = see(k, spark.from), [x2, y2] = see(k + 1, spark.to);
        ctx.strokeStyle = ctx.fillStyle = colour;
        // The wire glows while the spark is on it, and cools afterwards.
        ctx.globalAlpha = fog * (u < 1 ? 0.25 + 0.5 * Math.sin(u * Math.PI) : 0.35 * (1 - (u - 1) / 0.8));
        ctx.lineWidth = Math.max(1, Math.min(2.4, 0.003 * focal / far));
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (u >= 1) return;
        const head = smooth(u);
        // The spark shrinks as it moves away from you, like everything else.
        const size = Math.max(1.2, 0.007 * focal / (near + head));
        for (let tail = 0; tail < 4; tail++) {
            const at = head - tail * 0.05;
            if (at <= 0) return;
            ctx.globalAlpha = fog * (1 - tail * 0.23);
            ctx.beginPath();
            ctx.arc(x1 + (x2 - x1) * at, y1 + (y2 - y1) * at, size * (1 - tail * 0.16), 0, Math.PI * 2);
            ctx.fill();
        }
    };

    // Brightness of a neuron `since` hops after the signal reached it: a quick flash, then a slow fade.
    const flash = (since) => {
        if (since < 0) return 0;
        return since < 0.12 ? since / 0.12 : Math.exp(-(since - 0.12) * 1.5);
    };

    // One signal, as far as it has got.
    const drawSignal = (w, t) => {
        const phase = (t - startsAt(w)) / HOP; // layers crossed so far
        if (phase < 0) return;
        const colour = colours[((w % 2) + 2) % 2];
        for (const [hop, step] of pathOf(w).entries()) {
            const since = phase - hop;
            if (since < 0) break;
            if (since < 1.8) for (const spark of step.sparks) drawSpark(step.k, spark, since, colour);
            const light = flash(since);
            for (const i of step.firing) drawFlash(step.k, i, light, colour);
        }
    };

    const draw = () => {
        const t = Date.now() / 1000; // UTC seconds: the playhead
        viewer = t * SPEED;
        swayX = 0.11 * Math.sin(t * 0.11);
        swayY = 0.07 * Math.sin(t * 0.15 + 1);

        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'; // overlapping lights add up
        ctx.lineCap = 'round';

        // The layers ahead, from the furthest to the nearest.
        for (let k = Math.floor(viewer + FAR); k > viewer; k--) drawLayer(k);

        // Every signal still within sight.
        const latest = Math.floor(t / EVERY);
        for (let w = latest; startsAt(w) > t - (REACH + 2) * HOP; w--) drawSignal(w, t);

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    };

    const loop = (frame) => {
        if (still.matches) return;
        requestAnimationFrame(loop);
        if (frame - lastDraw < FRAME) return;
        lastDraw = frame;
        draw();
    };

    // With "reduce motion" on: no smooth movement, just a fresh picture each second.
    let ticker = 0;
    const begin = () => {
        clearInterval(ticker);
        draw();
        if (still.matches) ticker = setInterval(draw, 1000);
        else requestAnimationFrame(loop);
    };

    addEventListener('resize', () => { resize(); draw(); });
    still.addEventListener('change', begin);
    new MutationObserver(() => { readColours(); draw(); })
        .observe(root, { attributes: true, attributeFilter: ['data-mode', 'data-palette'] });

    resize();
    readColours();
    begin();
})();
