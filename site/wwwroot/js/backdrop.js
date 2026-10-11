// Animated background: a transformer seen from the side, one forward pass at a time.
//
// You stand beside the network and travel along it, the way you would watch a
// train from a path next to the track. The layers are planes of neurons
// standing in a row; the data flows from left to right. Neurons that come too
// close to the screen dissolve, so nothing looms in front of the page.
//
// The network is finite: an input plane, four identical blocks, an output
// plane. Each block is three planes:
//   1. the stream after ATTENTION: signals cross from one token's column to
//      another's along curved arcs, the only place tokens exchange information;
//   2. the FEED-FORWARD hidden layer: each token on its own widens into two columns;
//   3. the stream again: each token narrows back to one column.
// Straight wires carry the residual stream from each neuron to its counterpart.
//
// One pass: two signals start on the input plane and run through every block
// to the output, a neuron that fires handing the signal down its wires to the
// neurons that fire next. The view follows them. At the output it holds for a
// moment, fades, and the next pass begins at the input: the loop.
//
// Nothing here is truly random. The wiring is fixed, the path of each pass is
// a formula of the pass number, and UTC time only says which pass we are in
// and how far along it is. A refresh, or another visitor, picks it up exactly
// where it was.
(() => {
    const canvas = document.querySelector('.backdrop canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const root = document.documentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const TOKENS = 8;      // columns in a plane
    const WIDTH = 6;       // neurons per token in the stream
    const BLOCKS = 4;
    const PLANES = BLOCKS * 3 + 1; // input plane, then three planes per block; the last is the output
    const GAP = 1.5;       // distance between planes

    const HOP = 1.1;       // seconds for a signal to cross from one plane to the next
    const PERIOD = 18;     // seconds from the start of one pass to the start of the next
    const FRAME = 1000 / 30;

    // The viewpoint: beside the network, turned a little towards where the data is going.
    const SIDE = 3.1;                 // how far to the side the viewer stands
    const TURN = 24 * Math.PI / 180;  // how far the view is turned along the flow
    const NEAR = 1.15, FAR = 7.5;     // things closer or further than this are not drawn

    // A repeatable value between 0 and 1 for a pair of whole numbers.
    const hash = (a, b) => {
        let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f);
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
        h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    };

    // --- The architecture. Plane 0 is the input; after that the three kinds repeat.
    const STREAM = 0, ATTENDED = 1, HIDDEN = 2;
    const kind = (k) => k % 3;
    const count = (k) => kind(k) === HIDDEN ? TOKENS * WIDTH * 2 : TOKENS * WIDTH;

    // A neuron is (plane k, index i). In the stream i = token * WIDTH + row;
    // in the hidden layer each token has two sub-columns of WIDTH neurons.
    const where = (k, i) => {
        if (kind(k) !== HIDDEN) return { token: Math.floor(i / WIDTH), half: -1, row: i % WIDTH };
        return { token: Math.floor(i / (WIDTH * 2)), half: Math.floor(i / WIDTH) % 2, row: i % WIDTH };
    };
    const columnX = (token) => -1.6 + 3.2 * (token + 0.5) / TOKENS;
    const rowY = (row) => -0.9 + 1.8 * (row + 0.5) / WIDTH;
    // Position in space: x across the tokens (towards the viewer), y down the column, z along the flow.
    const spot = (k, i) => {
        const { token, half, row } = where(k, i);
        return [columnX(token) + (half < 0 ? 0 : (half - 0.5) * 0.17), rowY(row), k * GAP];
    };

    // The tokens that read from `token` in the attention step after plane k: one or two others.
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
        wiring.set(key, out);
        return out;
    };

    // --- The signals. Each pass sends two through the network, from the input plane to the output.
    // The whole path of signal n of a pass: for each plane, which neurons fire and which wires carry it on.
    const paths = new Map();
    const pathOf = (pass, n) => {
        const key = pass * 2 + n;
        let steps = paths.get(key);
        if (steps) return steps;

        // It begins on a few neurons of one token of the input.
        const token = Math.floor(hash(key, 4) * TOKENS);
        let firing = [...new Set([0, 1, 2].map((m) => token * WIDTH + Math.floor(hash(key * 13 + m, 5) * WIDTH)))];
        steps = [];
        for (let k = 0; k < PLANES; k++) {
            const sparks = [];
            if (k < PLANES - 1) {
                for (const i of firing) {
                    // Attention always carries the signal across to the reading tokens. Elsewhere the
                    // neuron uses its first wire and, about half the time, a second.
                    wires(k, i).forEach((wire, m) => {
                        if (wire.arc || m === 0 || hash(key * 31 + k, i * 8 + m) < 0.5) sparks.push({ from: i, to: wire.to, arc: wire.arc });
                    });
                }
            }
            steps.push({ k, firing, sparks });
            // The neurons reached fire next; the cascade is kept from flooding the plane.
            firing = [...new Set(sparks.map((s) => s.to))].slice(0, 10);
        }
        if (paths.size > 8) paths.clear();
        paths.set(key, steps);
        return steps;
    };

    let width = 0, height = 0, focal = 0, colours = ['#888', '#888'], dark = true, lastDraw = 0;
    // Set once per frame: where along the network the viewer is, the slight drift of the head, and the fade.
    let along = 0, swayX = 0, swayY = 0, curtain = 1;

    const resize = () => {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        width = innerWidth;
        height = innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        focal = Math.min(height * 0.95, width * 0.62);
    };

    // The palette's two colours, as currently resolved by the stylesheet.
    const readColours = () => {
        const style = getComputedStyle(root);
        colours = [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--counter').trim()];
        dark = root.dataset.mode === 'dark';
    };

    const clamp = (v) => Math.max(0, Math.min(1, v));
    const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

    // Perspective from beside the network. Returns screen x, screen y and the distance from the viewer.
    const SIN = Math.sin(TURN), COS = Math.cos(TURN);
    const project = (x, y, z) => {
        const dx = x - (SIDE + swayX), dz = z - along;
        const depth = Math.max(0.05, -COS * dx + SIN * dz);
        return [width / 2 + (SIN * dx + COS * dz) * focal / depth, height / 2 + (y - swayY) * focal / depth, depth];
    };
    // Fully visible in the middle distance; dissolving close to the screen and far away.
    const visible = (depth) => clamp((depth - NEAR) / 0.75) * clamp((FAR - depth) / 2.5) * curtain;
    const see = (k, i) => { const [x, y, z] = spot(k, i); return project(x, y, z); };

    // The screen path of a wire from (k, from) to (k + 1, to): its two ends and, for
    // attention, a control point that lifts it into an arc over (or under) the columns.
    // The last entry is how visible the wire is (its dimmer end decides).
    const route = (k, from, to, arc) => {
        const a = spot(k, from), b = spot(k + 1, to);
        const p = project(a[0], a[1], a[2]), q = project(b[0], b[1], b[2]);
        let cx = (p[0] + q[0]) / 2, cy = (p[1] + q[1]) / 2;
        if (arc) {
            const lift = (0.35 + 0.5 * Math.abs(b[0] - a[0]) / 3.2) * (a[1] < 0 ? -1 : 1);
            [cx, cy] = project((a[0] + b[0]) / 2, a[1] + lift, (a[2] + b[2]) / 2);
        }
        return [p[0], p[1], cx, cy, q[0], q[1], Math.min(visible(p[2]), visible(q[2])), (p[2] + q[2]) / 2];
    };
    const trace = (r) => { ctx.moveTo(r[0], r[1]); ctx.quadraticCurveTo(r[2], r[3], r[4], r[5]); };
    const pointOn = (r, u) => {
        const v = 1 - u;
        return [v * v * r[0] + 2 * v * u * r[2] + u * u * r[4], v * v * r[1] + 2 * v * u * r[3] + u * u * r[5]];
    };

    // Lines of a given colour whose brightness varies with distance are drawn in
    // a few brightness bands, so each band is one stroke.
    const BANDS = 4;
    const strokeBanded = (lines, colour, strength) => {
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1;
        for (let band = 1; band <= BANDS; band++) {
            ctx.globalAlpha = strength * band / BANDS;
            ctx.beginPath();
            let any = false;
            for (const r of lines) {
                if (Math.ceil(r[6] * BANDS) !== band) continue;
                trace(r);
                any = true;
            }
            if (any) ctx.stroke();
        }
    };

    // The neurons of a plane at rest. Each fades on its own as it nears the screen.
    const drawDots = (points) => {
        ctx.fillStyle = colours[0];
        for (const [x, y, depth] of points) {
            const fog = visible(depth);
            if (fog <= 0.02) continue;
            ctx.globalAlpha = 0.34 * fog;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(0.8, Math.min(10, 0.02 * focal / depth)), 0, Math.PI * 2);
            ctx.fill();
        }
    };

    // One plane at rest: a spine down each token's column, the wires leaving it, and its neurons.
    const drawPlane = (k) => {
        const total = count(k);
        const points = Array.from({ length: total }, (_, i) => see(k, i));

        const spines = [];
        for (let i = 0; i < total; i += WIDTH) {
            const a = points[i], b = points[i + WIDTH - 1];
            spines.push([a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, b[0], b[1], Math.min(visible(a[2]), visible(b[2]))]);
        }
        // The input and output planes are drawn more strongly, to mark the two ends.
        strokeBanded(spines, colours[0], k === 0 || k === PLANES - 1 ? 0.55 : 0.2);

        if (k < PLANES - 1) {
            const straight = [], arcs = [];
            for (let i = 0; i < total; i++) {
                const edge = i % WIDTH === 0 || i % WIDTH === WIDTH - 1;
                for (const wire of wires(k, i)) {
                    if (!wire.arc) straight.push(route(k, i, wire.to, false));
                    // Only the top and bottom rows of attention are drawn at rest: a canopy, not a curtain.
                    else if (edge) arcs.push(route(k, i, wire.to, true));
                }
            }
            strokeBanded(straight, colours[0], 0.07);
            strokeBanded(arcs, colours[1], 0.22);
        }

        drawDots(points);
    };

    // A neuron firing: a bright core with a halo. `light` is 0..1.
    const drawFlash = (k, i, light, colour) => {
        const [x, y, depth] = see(k, i);
        const fog = visible(depth);
        if (fog <= 0.02 || light <= 0.02) return;
        const radius = Math.max(0.8, Math.min(10, 0.02 * focal / depth));
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
        const r = route(k, spark.from, spark.to, spark.arc);
        const fog = r[6];
        if (fog <= 0.02) return;
        ctx.strokeStyle = ctx.fillStyle = colour;
        // The wire glows while the spark is on it, and cools afterwards.
        ctx.globalAlpha = fog * (u < 1 ? 0.25 + 0.5 * Math.sin(u * Math.PI) : 0.35 * (1 - (u - 1) / 0.8));
        ctx.lineWidth = Math.max(1, Math.min(2.4, 0.005 * focal / r[7]));
        ctx.beginPath();
        trace(r);
        ctx.stroke();
        if (u >= 1) return;
        const head = smooth(u);
        const size = Math.max(1.2, Math.min(6, 0.011 * focal / r[7]));
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
        return since < 0.12 ? since / 0.12 : Math.exp(-(since - 0.12) * 1.4);
    };

    // One signal, as far as it has got. `phase` is the number of planes crossed so far.
    const drawSignal = (steps, phase, colour) => {
        for (const step of steps) {
            const since = phase - step.k;
            if (since < 0) break;
            if (since < 1.8) for (const spark of step.sparks) drawSpark(step.k, spark, since, colour);
            // The answer on the output plane stays lit until the pass ends.
            const light = step.k === PLANES - 1 ? Math.max(flash(since), 0.7 * smooth(since * 4)) : flash(since);
            for (const i of step.firing) drawFlash(step.k, i, light, colour);
        }
    };

    const draw = () => {
        const t = Date.now() / 1000; // UTC seconds: the playhead
        const pass = Math.floor(t / PERIOD);
        const into = t - pass * PERIOD;
        const phase = into / HOP;

        // The viewer keeps a little behind the signal, and stops when it reaches the output.
        along = GAP * (Math.min(phase, PLANES - 1) - 0.7);
        swayX = 0.1 * Math.sin(t * 0.21);
        swayY = -0.12 + 0.05 * Math.sin(t * 0.17 + 1);
        curtain = smooth(into / 1.2) * smooth((PERIOD - into) / 1.4); // fade in at the input, out at the output

        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'; // overlapping lights add up
        ctx.lineCap = 'round';

        for (let k = PLANES - 1; k >= 0; k--) {
            const away = Math.abs(k * GAP - along);
            if (away < 9) drawPlane(k); // planes far along the track are off screen anyway
        }
        drawSignal(pathOf(pass, 0), phase, colours[0]);
        drawSignal(pathOf(pass, 1), phase, colours[1]);

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
