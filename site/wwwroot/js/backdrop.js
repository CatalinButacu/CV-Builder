// Animated background: a tiny transformer drawn as grids of cells.
//
// The input is the UTC date and time as 14 digits (YYYYMMDDHHMMSS), one token
// per digit. Once a second the digits change, the whole forward pass is run
// again, and the new values sweep through the diagram block by block.
// Everything on screen is a function of UTC time alone, so a refresh, or
// another visitor anywhere, sees the same picture at the same moment.
//
// The maths is a genuine transformer forward pass: token and position
// embeddings, two layers of two-head self-attention and a feed-forward block
// on a residual stream, a final normalisation and a softmax over the ten
// digits. The weights are random and fixed, not trained, so the "prediction"
// column means nothing; what is real is how the numbers flow.
(() => {
    const canvas = document.querySelector('.backdrop canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const root = document.documentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const T = 14;      // tokens: the digits of the UTC date and time
    const V = 10;      // vocabulary: the digits 0-9
    const C = 16;      // width of the residual stream
    const HEADS = 2;
    const LAYERS = 2;
    const HIDDEN = 32; // feed-forward width

    const STEP = 0.065;   // seconds between one block starting to change and the next
    const CHANGE = 0.22;  // seconds a block takes to change
    const FRAME = 1000 / 30;

    // --- Fixed random weights: the same model for every visitor.
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

    const tokenEmbedding = matrix(V, C, 0.9);
    const positionEmbedding = matrix(T, C, 0.6);
    const layers = Array.from({ length: LAYERS }, () => ({
        query: matrix(C, C, 0.5), key: matrix(C, C, 0.5), value: matrix(C, C, 0.45), out: matrix(C, C, 0.45),
        up: matrix(C, HIDDEN, 0.45), down: matrix(HIDDEN, C, 0.3),
    }));
    const unembedding = matrix(C, V, 0.6);

    // --- Small matrix helpers. A matrix is an array of rows.
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

    const digitsAt = (second) => {
        const d = new Date(second * 1000);
        const two = (n) => String(n).padStart(2, '0');
        return (d.getUTCFullYear() + two(d.getUTCMonth() + 1) + two(d.getUTCDate())
            + two(d.getUTCHours()) + two(d.getUTCMinutes()) + two(d.getUTCSeconds())).split('').map(Number);
    };

    // The forward pass for one second. Returns every intermediate grid, keyed
    // by the block that displays it.
    const memo = new Map();
    const forward = (second) => {
        let out = memo.get(second);
        if (out) return out;

        const tokens = digitsAt(second);
        out = { tokens, 'token': tokens.map((t) => tokenEmbedding[t]), 'position': positionEmbedding };
        let x = add(out.token, positionEmbedding);
        out.x0 = x;

        layers.forEach((layer, l) => {
            const a = normalise(x);
            const q = multiply(a, layer.query), k = multiply(a, layer.key), v = multiply(a, layer.value);
            const width = C / HEADS;
            const mixed = Array.from({ length: T }, () => new Array(C).fill(0));
            for (let h = 0; h < HEADS; h++) {
                const from = h * width;
                // How much each token (row) attends to each other token (column).
                const attention = q.map((qi) => softmax(k.map((kj) => {
                    let dot = 0;
                    for (let c = from; c < from + width; c++) dot += qi[c] * kj[c];
                    return dot / Math.sqrt(width);
                })));
                out[`attention${l}${h}`] = attention;
                attention.forEach((weights, i) => weights.forEach((w, j) => {
                    for (let c = from; c < from + width; c++) mixed[i][c] += w * v[j][c];
                }));
            }
            x = add(x, multiply(mixed, layer.out));
            out[`mid${l}`] = x;

            const hidden = multiply(normalise(x), layer.up).map((row) => row.map(gelu));
            out[`hidden${l}`] = hidden;
            x = add(x, multiply(hidden, layer.down));
            out[`out${l}`] = x;
        });

        out.final = normalise(x);
        out.probability = multiply(out.final, unembedding).map(softmax);
        out.prediction = out.probability.map((row) => row.indexOf(Math.max(...row)));

        if (memo.size > 8) memo.clear();
        memo.set(second, out);
        return out;
    };

    // --- The diagram: four bands of blocks, read left to right, top to bottom.
    // kind: signed values, weights between 0 and 1, or digits shown as text.
    const block = (key, label, cols, kind, stage) => ({ key, label, cols, kind, stage, x: 0, y: 0 });
    const bands = [[
        block('tokens', 'UTC', 1, 'digit', 0),
        block('token', 'token embedding', C, 'signed', 0),
        block('position', 'position embedding', C, 'signed', 0),
        block('x0', 'sum', C, 'signed', 1),
    ]];
    for (let l = 0; l < LAYERS; l++) {
        const s = 2 + l * 4;
        bands.push([
            block(`attention${l}0`, `layer ${l + 1}: attention head 1`, T, 'weight', s),
            block(`attention${l}1`, 'head 2', T, 'weight', s),
            block(`mid${l}`, 'residual + attention', C, 'signed', s + 1),
            block(`hidden${l}`, 'feed-forward', HIDDEN, 'signed', s + 2),
            block(`out${l}`, 'residual + feed-forward', C, 'signed', s + 3),
        ]);
    }
    const last = 2 + LAYERS * 4;
    bands.push([
        block('final', 'final norm', C, 'signed', last),
        block('probability', 'softmax over digits', V, 'weight', last + 1),
        block('prediction', 'out', 1, 'digit', last + 2),
    ]);
    const GAP = 2;      // cells between blocks
    const BAND_GAP = 3; // cells between bands
    const widest = Math.max(...bands.map((band) => band.reduce((sum, b) => sum + b.cols, 0) + GAP * (band.length - 1)));
    const tall = bands.length * T + BAND_GAP * (bands.length - 1);

    let width = 0, height = 0, cell = 0, colours = ['#888', '#888'], ink = '#888', lastDraw = 0;

    const resize = () => {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        width = innerWidth;
        height = innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        cell = Math.max(2, Math.min(width * 0.9 / widest, height * 0.84 / tall));
        const top = (height - tall * cell) / 2;
        bands.forEach((band, row) => {
            const span = band.reduce((sum, b) => sum + b.cols, 0) + GAP * (band.length - 1);
            let x = (width - span * cell) / 2;
            for (const b of band) {
                b.x = x;
                b.y = top + row * (T + BAND_GAP) * cell;
                x += (b.cols + GAP) * cell;
            }
        });
    };

    // The palette's two colours and the text colour, as resolved by the stylesheet.
    const readColours = () => {
        const style = getComputedStyle(root);
        colours = [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--counter').trim()];
        ink = style.getPropertyValue('--fg-muted').trim();
    };

    const smooth = (x) => x * x * (3 - 2 * x);

    const draw = () => {
        const t = Date.now() / 1000; // UTC seconds: the only input
        const second = Math.floor(t);
        const into = still.matches ? 1 : t - second; // 0..1 through the current second
        const now = forward(second), before = forward(second - 1);

        ctx.clearRect(0, 0, width, height);
        const size = Math.max(1, cell - 1);
        const text = cell >= 8;
        ctx.font = `${Math.round(cell * 0.82)}px ui-monospace, Consolas, monospace`;
        ctx.textBaseline = 'middle';

        for (const band of bands) {
            for (const b of band) {
                // How far this block has changed from last second's values to this second's.
                const mix = smooth(Math.max(0, Math.min(1, (into - b.stage * STEP) / CHANGE)));
                const changing = mix > 0 && mix < 1;

                if (b.kind === 'digit') {
                    const values = (mix < 0.5 ? before : now)[b.key];
                    ctx.fillStyle = ink;
                    ctx.globalAlpha = 0.9;
                    ctx.textAlign = 'center';
                    if (text) values.forEach((digit, i) => ctx.fillText(digit, b.x + cell / 2, b.y + (i + 0.5) * cell));
                } else {
                    const from = before[b.key], to = now[b.key];
                    let scale = 1;
                    if (b.kind === 'signed') {
                        scale = 0;
                        for (const row of to) for (const v of row) scale = Math.max(scale, Math.abs(v));
                    }
                    for (let i = 0; i < T; i++) {
                        for (let j = 0; j < b.cols; j++) {
                            const v = from[i][j] + (to[i][j] - from[i][j]) * mix;
                            const strength = b.kind === 'weight' ? Math.sqrt(v) : Math.min(1, Math.abs(v) / scale);
                            ctx.globalAlpha = 0.08 + 0.92 * strength;
                            ctx.fillStyle = colours[b.kind === 'weight' || v >= 0 ? 0 : 1];
                            ctx.fillRect(b.x + j * cell, b.y + i * cell, size, size);
                        }
                    }
                }

                // Outline the block that is being recomputed right now.
                if (changing) {
                    ctx.globalAlpha = Math.sin(mix * Math.PI);
                    ctx.strokeStyle = colours[1];
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(b.x - 3, b.y - 3, b.cols * cell + 5, T * cell + 5);
                }

                if (text) {
                    ctx.globalAlpha = 0.75;
                    ctx.fillStyle = ink;
                    ctx.textAlign = 'left';
                    ctx.fillText(b.label, b.x, b.y - cell * 0.9);
                }
            }
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

    // With "reduce motion" on: no sweep, just a fresh picture each second.
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
