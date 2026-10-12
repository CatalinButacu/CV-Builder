// Animated background: a real transformer forward pass, seen from the side,
// with its formulas.
//
// You stand beside the network and travel along it. The layers are planes of
// neurons standing in a row; the data flows from left to right. Neurons that
// come too close to the screen dissolve.
//
// The network is a genuine small transformer and the scene is its calculation:
//   - 8 tokens, each a column of 6 neurons (the residual stream is 6 wide);
//   - 4 blocks, each drawn as three planes:
//       x + Attention(x)   two heads; arcs cross from one token to another
//       GELU(x W1)         the feed-forward hidden layer, 12 wide (two columns)
//       x + h W2           back to the stream
//   - an input plane before the first block; the last plane is the output.
//
// What you see is what was computed. A neuron's brightness is the size of its
// activation and its colour the sign. A wire's brightness is the signal it
// carries: the attention weight for an arc, weight x activation for a
// feed-forward wire. Above every plane floats the formula it computes, and the
// plane being computed also shows that formula with its real numbers.
//
// The weights are fixed and random, not trained, so the final prediction means
// nothing; the arithmetic is real. Each pass feeds in eight tokens chosen by a
// formula of the pass number. UTC time is only the playhead: which pass, and
// how far along. A refresh, or another visitor, picks it up exactly there.
(() => {
    const canvas = document.querySelector('.backdrop canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const root = document.documentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const TOKENS = 8;      // columns in a plane
    const WIDTH = 6;       // neurons per token: the width of the residual stream
    const HEADS = 2;
    const HIDDEN = WIDTH * 2;
    const VOCAB = 10;
    const BLOCKS = 4;
    const PLANES = BLOCKS * 3 + 1; // input plane, then three planes per block; the last is the output
    const GAP = 1.5;       // distance between planes

    const HOP = 1.6;       // seconds for the calculation to move from one plane to the next
    const PERIOD = 24;     // seconds from the start of one pass to the start of the next
    const FRAME = 1000 / 30;

    // The viewpoint: beside the network, turned a little towards where the data is going.
    const SIDE = 3.1;
    const TURN = 24 * Math.PI / 180;
    const NEAR = 1.15, FAR = 7.5; // things closer or further than this are not drawn

    // A repeatable value between 0 and 1 for a pair of whole numbers.
    const hash = (a, b) => {
        let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f);
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
        h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    };

    // ------------------------------------------------------------------
    // The model: fixed random weights, the same for every visitor.
    // ------------------------------------------------------------------
    const random = (() => {
        let seed = 0x7a3f51;
        return () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    })();
    const normal = () => random() + random() + random() + random() - 2; // roughly bell-shaped
    const matrix = (rows, cols, scale) =>
        Array.from({ length: rows }, () => Array.from({ length: cols }, () => normal() * scale));

    const tokenEmbedding = matrix(VOCAB, WIDTH, 1);
    const positionEmbedding = matrix(TOKENS, WIDTH, 0.6);
    const blocks = Array.from({ length: BLOCKS }, () => ({
        query: matrix(WIDTH, WIDTH, 0.9), key: matrix(WIDTH, WIDTH, 0.9), value: matrix(WIDTH, WIDTH, 0.7), out: matrix(WIDTH, WIDTH, 0.6),
        up: matrix(WIDTH, HIDDEN, 0.7), down: matrix(HIDDEN, WIDTH, 0.4),
    }));
    const unembedding = matrix(WIDTH, VOCAB, 0.8);

    // A matrix is an array of rows.
    const multiply = (a, b) => a.map((row) => b[0].map((_, j) => row.reduce((sum, v, k) => sum + v * b[k][j], 0)));
    const add = (a, b) => a.map((row, i) => row.map((v, j) => v + b[i][j]));
    const normalise = (a) => a.map((row) => {
        const mean = row.reduce((s, v) => s + v, 0) / row.length;
        const spread = Math.sqrt(row.reduce((s, v) => s + (v - mean) ** 2, 0) / row.length) || 1;
        return row.map((v) => (v - mean) / spread);
    });
    const softmax = (row) => {
        const top = Math.max(...row);
        const e = row.map((v) => Math.exp(v - top));
        const sum = e.reduce((s, v) => s + v, 0);
        return e.map((v) => v / sum);
    };
    const gelu = (v) => 0.5 * v * (1 + Math.tanh(0.7978845608 * (v + 0.044715 * v ** 3)));
    const fixed = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);

    // One drawn plane: its values (one row per token), the wires arriving from
    // the plane before, the formula it computes, and that formula with numbers in.
    const plane = (grid, formula, detail) => {
        let biggest = 1e-9;
        for (const row of grid) for (const v of row) biggest = Math.max(biggest, Math.abs(v));
        return { values: grid.flat(), glow: grid.flat().map((v) => Math.abs(v) / biggest), links: [], formula, detail };
    };

    // Wires between two dense planes of the same token: for each target unit its
    // two strongest incoming signals, where a signal is weight x activation.
    const wire = (target, source, weights) => {
        const signals = [];
        let biggest = 1e-9;
        source.forEach((row, token) => {
            for (let u = 0; u < weights[0].length; u++) {
                const ranked = row.map((a, c) => ({ c, s: a * weights[c][u] })).sort((p, q) => Math.abs(q.s) - Math.abs(p.s)).slice(0, 2);
                for (const r of ranked) {
                    biggest = Math.max(biggest, Math.abs(r.s));
                    signals.push({ from: token * row.length + r.c, to: token * weights[0].length + u, s: r.s });
                }
            }
        });
        for (const g of signals) target.links.push({ from: g.from, to: g.to, arc: false, glow: Math.abs(g.s) / biggest, tone: g.s >= 0 ? 0 : 1 });
    };

    // The largest entry of a grid, with where it is.
    const peak = (grid) => {
        let best = { token: 0, unit: 0, value: 0 };
        grid.forEach((row, token) => row.forEach((v, unit) => { if (Math.abs(v) > Math.abs(best.value)) best = { token, unit, value: v }; }));
        return best;
    };

    // The forward pass for one pass number, as the planes to draw.
    const memo = new Map();
    const build = (pass) => {
        let planes = memo.get(pass);
        if (planes) return planes;

        const tokens = Array.from({ length: TOKENS }, (_, i) => Math.floor(hash(pass, 100 + i) * VOCAB));
        let x = add(tokens.map((t) => tokenEmbedding[t]), positionEmbedding);
        planes = [plane(x, 'x = E[token] + P[position]', `tokens = [${tokens.join(' ')}]`)];

        for (const block of blocks) {
            // --- Attention.
            const a = normalise(x);
            const q = multiply(a, block.query), k = multiply(a, block.key), v = multiply(a, block.value);
            const span = WIDTH / HEADS;
            const mixed = Array.from({ length: TOKENS }, () => new Array(WIDTH).fill(0));
            const arcs = [];
            let strongest = { w: 0, i: 0, j: 0 };
            for (let h = 0; h < HEADS; h++) {
                const from = h * span;
                q.forEach((qi, i) => {
                    // How much token i attends to each token j.
                    const share = softmax(k.map((kj) => {
                        let dot = 0;
                        for (let c = from; c < from + span; c++) dot += qi[c] * kj[c];
                        return dot / Math.sqrt(span);
                    }));
                    share.forEach((w, j) => {
                        for (let c = from; c < from + span; c++) mixed[i][c] += w * v[j][c];
                        if (i === j) return;
                        if (w > strongest.w) strongest = { w, i, j };
                        // Each head owns its share of the neurons, so its arcs run along those rows.
                        if (w > 0.14) for (let c = from; c < from + span; c++) arcs.push({ from: j * WIDTH + c, to: i * WIDTH + c, arc: true, glow: Math.sqrt(w), tone: h });
                    });
                });
            }
            const before = x;
            x = add(x, multiply(mixed, block.out));
            const attended = plane(x, 'x ← x + softmax(Q·Kᵀ / √d) · V',
                `token ${strongest.i} attends to token ${strongest.j}:  a = ${strongest.w.toFixed(2)}`);
            // The residual: every neuron also carries its own value straight on.
            before.flat().forEach((value, i) => attended.links.push({ from: i, to: i, arc: false, glow: 0.5 * planes[planes.length - 1].glow[i], tone: value >= 0 ? 0 : 1 }));
            attended.links.push(...arcs);
            planes.push(attended);

            // --- Feed-forward, widening.
            const input = normalise(x);
            const sums = multiply(input, block.up);
            const hidden = sums.map((row) => row.map(gelu));
            const top = peak(hidden);
            const wide = plane(hidden, 'h = GELU(x · W₁)', `GELU(${fixed(sums[top.token][top.unit])}) = ${fixed(top.value)}`);
            wire(wide, input, block.up);
            planes.push(wide);

            // --- Feed-forward, narrowing, added back to the stream.
            const delta = multiply(hidden, block.down);
            const after = add(x, delta);
            const most = peak(delta);
            const merged = plane(after, 'x ← x + h · W₂',
                `${fixed(x[most.token][most.unit])} ${most.value < 0 ? '−' : '+'} ${Math.abs(most.value).toFixed(2)} = ${fixed(after[most.token][most.unit])}`);
            wire(merged, hidden, block.down);
            planes.push(merged);
            x = after;
        }

        // The last plane is also the output: what the model would say comes next for each token.
        const probability = multiply(normalise(x), unembedding).map(softmax);
        const answer = probability.map((row) => row.indexOf(Math.max(...row)));
        const final = planes[planes.length - 1];
        final.formula = 'p = softmax(x · Wᵤ)';
        final.detail = `argmax p = [${answer.join(' ')}]`;

        if (memo.size > 3) memo.clear();
        memo.set(pass, planes);
        return planes;
    };

    // ------------------------------------------------------------------
    // Where things are.
    // ------------------------------------------------------------------
    const isWide = (k) => k % 3 === 2; // the feed-forward hidden planes
    const columnX = (token) => -1.6 + 3.2 * (token + 0.5) / TOKENS;
    const rowY = (row) => -0.9 + 1.8 * (row + 0.5) / WIDTH;
    // Position in space: x across the tokens (towards the viewer), y down the column, z along the flow.
    const spot = (k, i) => {
        if (!isWide(k)) return [columnX(Math.floor(i / WIDTH)), rowY(i % WIDTH), k * GAP];
        const half = Math.floor(i / WIDTH) % 2;
        return [columnX(Math.floor(i / HIDDEN)) + (half - 0.5) * 0.17, rowY(i % WIDTH), k * GAP];
    };

    let width = 0, height = 0, focal = 0, colours = ['#888', '#888'], ink = '#888', dark = true, lastDraw = 0;
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

    // The palette's two colours and the text colour, as currently resolved by the stylesheet.
    const readColours = () => {
        const style = getComputedStyle(root);
        colours = [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--counter').trim()];
        ink = style.getPropertyValue('--fg').trim();
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

    // The screen path of a wire into plane k: its two ends and, for attention, a
    // control point that lifts it into an arc over (or under) the columns. Then
    // how visible it is (its dimmer end decides) and how far away.
    const route = (k, link) => {
        const a = spot(k - 1, link.from), b = spot(k, link.to);
        const p = project(a[0], a[1], a[2]), q = project(b[0], b[1], b[2]);
        let cx = (p[0] + q[0]) / 2, cy = (p[1] + q[1]) / 2;
        if (link.arc) {
            const lift = (0.35 + 0.5 * Math.abs(b[0] - a[0]) / 3.2) * (a[1] < 0 ? -1 : 1);
            [cx, cy] = project((a[0] + b[0]) / 2, a[1] + lift, (a[2] + b[2]) / 2);
        }
        return [p[0], p[1], cx, cy, q[0], q[1], Math.min(visible(p[2]), visible(q[2])), (p[2] + q[2]) / 2];
    };
    const pointOn = (r, u) => {
        const v = 1 - u;
        return [v * v * r[0] + 2 * v * u * r[2] + u * u * r[4], v * v * r[1] + 2 * v * u * r[3] + u * u * r[5]];
    };
    // Draws the first `part` of a route (0..1), as a curve.
    const trace = (r, part) => {
        const [ex, ey] = pointOn(r, part);
        // Control point of the shortened curve (de Casteljau).
        ctx.moveTo(r[0], r[1]);
        ctx.quadraticCurveTo(r[0] + (r[2] - r[0]) * part, r[1] + (r[3] - r[1]) * part, ex, ey);
        return [ex, ey];
    };

    // The wires arriving at plane k. `reached` is 0 before the calculation gets
    // there, rises to 1 as the signals cross, and stays 1 afterwards.
    const drawLinks = (k, links, reached) => {
        if (reached <= 0) { // not yet computed: only a faint trace of the wiring, in one stroke
            ctx.globalAlpha = 0.05 * curtain;
            ctx.strokeStyle = colours[0];
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (const link of links) {
                const r = route(k, link);
                if (r[6] > 0.3) trace(r, 1);
            }
            ctx.stroke();
            return;
        }
        const crossing = reached < 1;
        for (const link of links) {
            // Crossing: full strength. Done: settled a little dimmer.
            const r = route(k, link);
            const alpha = (crossing ? 0.1 + 0.9 * link.glow : 0.06 + 0.5 * link.glow) * r[6];
            if (alpha < 0.025) continue;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = ctx.fillStyle = colours[link.tone];
            ctx.lineWidth = crossing && link.glow > 0.55 ? 1.6 : 1;
            ctx.beginPath();
            const [ex, ey] = trace(r, reached);
            ctx.stroke();
            if (crossing && link.glow > 0.45) { // the head of a strong signal
                ctx.globalAlpha = Math.min(1, alpha * 2);
                ctx.beginPath();
                ctx.arc(ex, ey, Math.max(1.2, Math.min(5, 0.009 * focal / r[7])), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    };

    // The neurons of plane k. `arrived` is how far their values have come in, 0..1.
    const drawNeurons = (k, p, arrived) => {
        for (let i = 0; i < p.values.length; i++) {
            const [x, y, depth] = see(k, i);
            const fog = visible(depth);
            if (fog <= 0.02) continue;
            const shine = p.glow[i] * arrived;
            const radius = Math.max(0.8, Math.min(10, 0.02 * focal / depth));
            ctx.fillStyle = colours[arrived > 0 && p.values[i] < 0 ? 1 : 0];
            if (shine > 0.5) { // a halo around the strongest
                ctx.globalAlpha = 0.2 * shine * fog;
                ctx.beginPath();
                ctx.arc(x, y, radius * 2.6, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = (0.14 + 0.86 * shine) * fog;
            ctx.beginPath();
            ctx.arc(x, y, radius * (0.8 + 0.5 * shine), 0, Math.PI * 2);
            ctx.fill();
        }
    };

    // The formula above plane k. While the plane is being computed it is brighter
    // and a second line shows the same formula with this pass's numbers.
    const drawFormula = (k, p, reached) => {
        const [x, y, depth] = project(0, -1.2, k * GAP);
        const fog = visible(depth);
        const size = Math.min(21, 0.075 * focal / depth);
        if (fog <= 0.03 || size < 9) return;
        const live = reached > 0 ? Math.max(0, 1 - Math.max(0, reached - 1) / 1.2) : 0; // fades after the plane is done
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = live > 0.05 ? colours[0] : ink;
        ctx.globalAlpha = fog * (0.5 + 0.5 * live);
        ctx.font = `italic ${size}px 'Cambria Math', 'STIX Two Math', Cambria, Georgia, serif`;
        ctx.fillText(p.formula, x, y);
        if (live > 0.05) {
            ctx.fillStyle = ink;
            ctx.globalAlpha = fog * live;
            ctx.font = `${size * 0.72}px ui-monospace, Consolas, monospace`;
            ctx.fillText(p.detail, x, y - size * 1.25);
        }
    };

    const draw = () => {
        const t = Date.now() / 1000; // UTC seconds: the playhead
        const pass = Math.floor(t / PERIOD);
        const into = t - pass * PERIOD;
        const phase = into / HOP; // how many planes the calculation has reached
        const planes = build(pass);

        // The viewer keeps a little behind the calculation, and stops when it reaches the output.
        along = GAP * (Math.min(phase, PLANES - 1) - 0.7);
        swayX = 0.1 * Math.sin(t * 0.21);
        swayY = -0.05 + 0.05 * Math.sin(t * 0.17 + 1);
        curtain = smooth(into / 1.2) * smooth((PERIOD - into) / 1.4); // fade in at the input, out at the output

        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'; // overlapping lights add up
        ctx.lineCap = 'round';

        for (let k = PLANES - 1; k >= 0; k--) {
            if (Math.abs(k * GAP - along) > 9) continue; // far along the track: off screen anyway
            const reached = k === 0 ? 1 + phase : phase - (k - 1); // crossing while between 0 and 1
            if (k > 0) drawLinks(k, planes[k].links, Math.min(1, reached));
            drawNeurons(k, planes[k], k === 0 ? 1 : smooth(reached * 1.4 - 0.4));
        }
        // Formulas last, so they sit on top of the lights.
        ctx.globalCompositeOperation = 'source-over';
        for (let k = 0; k < PLANES; k++) {
            if (Math.abs(k * GAP - along) <= 9) drawFormula(k, planes[k], k === 0 ? 1 + phase : phase - (k - 1));
        }
        ctx.globalAlpha = 1;
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
