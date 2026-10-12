// Animated background: a first-person view from inside a transformer.
//
// You are standing in the residual stream, looking along the direction the
// data flows. The network is a stack of identical blocks, and each block is
// three planes of neurons facing you:
//
//   1. the stream: one column of neurons per token, eight tokens side by side;
//   2. the stream after ATTENTION: signals cross from one token's column to
//      another's along curved arcs, the only place where tokens exchange
//      information;
//   3. the FEED-FORWARD hidden layer: each token on its own is widened into
//      two columns, then narrowed back into the next block's stream.
//
// Straight wires run through from each neuron to its counterpart further on:
// the residual connection. The view drifts slowly forward, block after block,
// without end.
//
// Every few seconds a signal starts just ahead of you and travels away. A
// neuron that fires passes the signal down the wires it has, a spark runs
// along each wire, and the neuron at the far end fires in turn, so a signal
// can be followed: across tokens through attention, out and back through the
// feed-forward layer, block after block.
//
// Nothing here is truly random. Which token attends to which, and the path of
// signal number w, are fixed by formulas, and UTC time only says where the
// viewer is and how far each signal has got. A refresh, or another visitor,
// picks the scene up exactly where it was.
(() => {
    const canvas = document.querySelector('.backdrop canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const root = document.documentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const TOKENS = 8;    // columns
    const WIDTH = 6;     // neurons per token in the stream
    const SPEED = 0.14;  // planes the viewer drifts past per second
    const FAR = 7.5;     // planes further ahead than this are lost in the haze
    const EVERY = 2.6;   // seconds between one signal starting and the next
    const HOP = 0.8;     // seconds for a signal to cross from one plane to the next
    const REACH = 9;     // planes a signal travels before it is out of sight
    const FRAME = 1000 / 30;

    // A repeatable value between 0 and 1 for a pair of whole numbers.
    const hash = (a, b) => {
        let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f);
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
        h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    };

    // --- The architecture. Plane k is one of three kinds, repeating.
    const STREAM = 0, ATTENDED = 1, HIDDEN = 2;
    const kind = (k) => ((k % 3) + 3) % 3;
    const count = (k) => kind(k) === HIDDEN ? TOKENS * WIDTH * 2 : TOKENS * WIDTH;

    // A neuron is (plane k, index i). In the stream i = token * WIDTH + row;
    // in the hidden layer each token has two sub-columns of WIDTH neurons.
    const where = (k, i) => {
        if (kind(k) !== HIDDEN) return { token: Math.floor(i / WIDTH), half: -1, row: i % WIDTH };
        return { token: Math.floor(i / (WIDTH * 2)), half: Math.floor(i / WIDTH) % 2, row: i % WIDTH };
    };
    const columnX = (token) => -1.6 + 3.2 * (token + 0.5) / TOKENS;
    const rowY = (row) => -0.9 + 1.8 * (row + 0.5) / WIDTH;
    const spot = (k, i) => {
        const { token, half, row } = where(k, i);
        return [columnX(token) + (half < 0 ? 0 : (half - 0.5) * 0.17), rowY(row)];
    };

    // The tokens that read from `token` in the attention step of plane k: one or two others.
    const readers = (k, token) => {
        const out = [];
        for (let n = 0; out.length < 2 && n < 6; n++) {
            const other = Math.floor(hash(k * 16 + token, 20 + n) * TOKENS);
            if (other !== token && !out.includes(other) && (out.length === 0 || hash(k * 16 + token, 9) < 0.6)) out.push(other);
        }
        return out;
    };

    // The wires leaving neuron (k, i) for the next plane. `arc` marks attention, which crosses between tokens.
    const wiring = new Map();
    const wires = (k, i) => {
        const key = k * 128 + i;
        let out = wiring.get(key);
        if (out) return out;
        const { token, half, row } = where(k, i);
        const type = kind(k);
        if (type === STREAM) {
            // Attention: straight on (the residual), and across to every token that reads from this one.
            out = [{ to: i, arc: false }, ...readers(k, token).map((other) => ({ to: other * WIDTH + row, arc: true }))];
        } else if (type === ATTENDED) {
            // Feed-forward, widening: to both sub-columns of the same token, and one neighbour.
            const near = Math.max(0, Math.min(WIDTH - 1, row + (hash(key, 3) < 0.5 ? -1 : 1)));
            const base = token * WIDTH * 2;
            out = [{ to: base + row, arc: false }, { to: base + WIDTH + row, arc: false }, { to: base + (hash(key, 4) < 0.5 ? 0 : WIDTH) + near, arc: false }];
        } else {
            // Feed-forward, narrowing: back to the same token's stream.
            const near = Math.max(0, Math.min(WIDTH - 1, row + (half ? 1 : -1)));
            out = [{ to: token * WIDTH + row, arc: false }, { to: token * WIDTH + near, arc: false }];
        }
        if (wiring.size > 6000) wiring.clear();
        wiring.set(key, out);
        return out;
    };

    // --- The signals. Signal w starts at a fixed time on a plane then just ahead of the viewer.
    const startsAt = (w) => w * EVERY + hash(w, 7) * 0.8;
    // Between half a step and a step and a half ahead, so the first flash is close but in view.
    const startPlane = (w) => Math.floor(startsAt(w) * SPEED + 0.5) + 1;

    // The whole path of signal w: for each plane it crosses, which neurons fire
    // and which wires carry it onward.
    const paths = new Map();
    const pathOf = (w) => {
        let steps = paths.get(w);
        if (steps) return steps;

        const first = startPlane(w);
        // It begins on a few neurons of one token.
        const token = Math.floor(hash(w, 4) * TOKENS);
        const perToken = count(first) / TOKENS;
        let firing = [0, 1, 2].map((n) => token * perToken + Math.floor(hash(w * 13 + n, 5) * perToken));
        firing = [...new Set(firing)];
        steps = [];
        for (let hop = 0; hop < REACH; hop++) {
            const k = first + hop;
            const sparks = [];
            for (const i of firing) {
                const options = wires(k, i);
                // Attention always carries the signal across to the reading tokens. Elsewhere the
                // neuron uses its first wire and, about half the time, a second.
                options.forEach((wire, n) => {
                    if (wire.arc || n === 0 || hash(w * 31 + k, i * 8 + n) < 0.5) sparks.push({ from: i, to: wire.to, arc: wire.arc });
                });
            }
            steps.push({ k, firing, sparks });
            // The neurons reached fire next; the cascade is kept from flooding the plane.
            firing = [...new Set(sparks.map((s) => s.to))].slice(0, 10);
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
        // A plane one step ahead just about fills the window, so you are inside it.
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

    // Perspective: a point at a given depth ahead of the viewer.
    const project = (x, y, depth) => [width / 2 + (x - swayX) * focal / depth, height / 2 + (y - swayY) * focal / depth];
    const see = (k, i) => { const [x, y] = spot(k, i); return project(x, y, k - viewer); };
    // Faint in the distance, and fading out as a plane passes the viewer.
    const haze = (depth) => clamp((FAR - depth) / 3.5) * clamp((depth - 0.12) / 0.45);

    // The screen path of a wire from (k, from) to (k + 1, to): two ends and, for
    // attention, a control point that lifts it into an arc over (or under) the columns.
    const route = (k, from, to, arc) => {
        const [ax, ay] = spot(k, from), [bx, by] = spot(k + 1, to);
        const [x1, y1] = project(ax, ay, k - viewer), [x2, y2] = project(bx, by, k + 1 - viewer);
        if (!arc) return [x1, y1, (x1 + x2) / 2, (y1 + y2) / 2, x2, y2];
        const lift = (0.3 + 0.5 * Math.abs(bx - ax) / 3.2) * (ay < 0 ? -1 : 1);
        const [cx, cy] = project((ax + bx) / 2, ay + lift, k + 0.5 - viewer);
        return [x1, y1, cx, cy, x2, y2];
    };
    const stroke = (r) => { ctx.moveTo(r[0], r[1]); ctx.quadraticCurveTo(r[2], r[3], r[4], r[5]); };
    const pointOn = (r, u) => {
        const v = 1 - u;
        return [v * v * r[0] + 2 * v * u * r[2] + u * u * r[4], v * v * r[1] + 2 * v * u * r[3] + u * u * r[5]];
    };

    // A spine down each column, which is what makes a column read as one token.
    const drawSpines = (points, fog) => {
        ctx.strokeStyle = colours[0];
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.16 * fog;
        ctx.beginPath();
        for (let i = 0; i < points.length; i += WIDTH) {
            ctx.moveTo(points[i][0], points[i][1]);
            ctx.lineTo(points[i + WIDTH - 1][0], points[i + WIDTH - 1][1]);
        }
        ctx.stroke();
    };

    // The wires from plane k to the next, at rest. Straight ones are the residual
    // stream and the feed-forward fans. Attention arcs are in the second colour,
    // and only the top and bottom rows are drawn, so they form a canopy without
    // hiding the columns.
    const drawWires = (k, total, fade) => {
        ctx.strokeStyle = colours[0];
        ctx.globalAlpha = 0.06 * fade;
        ctx.beginPath();
        for (let i = 0; i < total; i++) for (const wire of wires(k, i)) if (!wire.arc) stroke(route(k, i, wire.to, false));
        ctx.stroke();
        if (kind(k) !== STREAM) return;

        ctx.strokeStyle = colours[1];
        ctx.globalAlpha = 0.2 * fade;
        ctx.beginPath();
        for (let i = 0; i < total; i++) {
            const edge = i % WIDTH === 0 || i % WIDTH === WIDTH - 1;
            if (edge) for (const wire of wires(k, i)) if (wire.arc) stroke(route(k, i, wire.to, true));
        }
        ctx.stroke();
    };

    // One plane at rest: its token columns, the wires leaving it, and its neurons.
    const drawPlane = (k) => {
        const depth = k - viewer;
        const fog = haze(depth);
        if (fog <= 0) return;
        const total = count(k);
        const points = Array.from({ length: total }, (_, i) => see(k, i));

        drawSpines(points, fog);
        const ahead = Math.min(fog, haze(depth + 1));
        if (ahead > 0) drawWires(k, total, ahead);

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

    // A wire lit up, with a spark `u` of the way along it.
    const drawSpark = (k, spark, u, colour) => {
        const near = k - viewer, far = near + 1;
        const fog = Math.min(haze(near), haze(far));
        if (fog <= 0) return;
        const r = route(k, spark.from, spark.to, spark.arc);
        ctx.strokeStyle = ctx.fillStyle = colour;
        // The wire glows while the spark is on it, and cools afterwards.
        ctx.globalAlpha = fog * (u < 1 ? 0.25 + 0.5 * Math.sin(u * Math.PI) : 0.35 * (1 - (u - 1) / 0.8));
        ctx.lineWidth = Math.max(1, Math.min(2.4, 0.003 * focal / far));
        ctx.beginPath();
        stroke(r);
        ctx.stroke();
        if (u >= 1) return;
        const head = smooth(u);
        // The spark shrinks as it moves away from you, like everything else.
        const size = Math.max(1.2, 0.007 * focal / (near + head));
        for (let tail = 0; tail < 4; tail++) {
            const at = head - tail * 0.05;
            if (at <= 0) return;
            const [x, y] = pointOn(r, at);
            ctx.globalAlpha = fog * (1 - tail * 0.23);
            ctx.beginPath();
            ctx.arc(x, y, size * (1 - tail * 0.16), 0, Math.PI * 2);
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
        const phase = (t - startsAt(w)) / HOP; // planes crossed so far
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

        // The planes ahead, from the furthest to the nearest.
        for (let k = Math.floor(viewer + FAR); k > viewer; k--) drawPlane(k);

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
