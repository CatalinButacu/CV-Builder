// Animated background: a flight through a small language-model-style network
// while it computes.
//
// The network is a real transformer (two layers, two attention heads) with
// fixed random weights. Once a minute it is given the UTC date and time as 12
// digits and run forward. Its layers are laid out one behind the other, and
// the camera travels through them from the input to the prediction.
//
// Every light is a real number from that calculation:
//   - a neuron's brightness is the size of its activation, its colour the sign;
//   - a connection's brightness is the strength of the signal it carries
//     (attention weight, or weight x activation for the feed-forward parts).
// Signals shoot into each layer just ahead of the camera, so the calculation
// unfolds as you fly.
//
// The input, the camera position and its sway all come from UTC time alone,
// so a refresh, or another visitor anywhere, sees the same moment of the same
// flight. The weights are random, not trained, so the prediction is meaningless;
// what is real is how the numbers flow.
(() => {
    const canvas = document.querySelector('.backdrop canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const root = document.documentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const T = 12;      // tokens: the digits of the UTC date and time, to the minute
    const V = 10;      // vocabulary: the digits 0-9
    const C = 16;      // width of the residual stream
    const HEADS = 2;
    const LAYERS = 2;
    const HIDDEN = 32; // feed-forward width

    const JOURNEY = 60; // seconds: one flight per UTC minute
    const TRAVEL = 53;  // seconds spent moving; then hold on the prediction and fade
    const START = -1.3; // camera depth at the start, in layers
    const VIEW = 1.5;   // how far in front of the last layer the flight ends
    const FAR = 5;      // layers further away than this are not drawn
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
            + two(d.getUTCHours()) + two(d.getUTCMinutes())).split('').map(Number);
    };

    // --- Where things sit on a layer. Tokens run left to right; the units of
    // each token are stacked in a column (two columns for the wide layers).
    const columnX = (token) => -1.5 + 3 * (token + 0.5) / T;
    const place = (token, unit, count) => {
        if (count === 1) return [columnX(token), 0];
        if (count === HIDDEN) return [columnX(token) + (unit % 2 - 0.5) * 0.09, -0.8 + 1.6 * ((unit >> 1) + 0.5) / (count / 2)];
        const reach = count === V ? 0.5 : 0.8;
        return [columnX(token), -reach + 2 * reach * (unit + 0.5) / count];
    };

    // A layer as drawn: its neurons, and the connections arriving from the layer before.
    const plane = (label, grid, kind) => {
        const count = grid[0].length;
        let biggest = 1e-9;
        for (const row of grid) for (const v of row) biggest = Math.max(biggest, Math.abs(v));
        const nodes = [];
        grid.forEach((row, token) => row.forEach((v, unit) => {
            const [x, y] = place(token, unit, count);
            nodes.push({ x, y, value: v, glow: kind === 'share' ? Math.sqrt(v) : Math.abs(v) / biggest, text: kind === 'digit' ? String(v) : '' });
        }));
        return { label, nodes, links: [], count };
    };

    // Connections between two dense layers: for each target unit, its two
    // strongest incoming signals (weight x activation), per token.
    const wire = (target, from, weights, source) => {
        const signals = [];
        let biggest = 1e-9;
        source.forEach((row, token) => {
            for (let u = 0; u < weights[0].length; u++) {
                const ranked = row.map((a, c) => ({ c, s: a * weights[c][u] })).sort((p, q) => Math.abs(q.s) - Math.abs(p.s)).slice(0, 2);
                for (const r of ranked) {
                    biggest = Math.max(biggest, Math.abs(r.s));
                    signals.push({ token, from: r.c, to: u, s: r.s });
                }
            }
        });
        for (const g of signals) {
            const [ax, ay] = place(g.token, g.from, from.count), [bx, by] = place(g.token, g.to, target.count);
            target.links.push({ ax, ay, bx, by, glow: Math.abs(g.s) / biggest, tone: g.s >= 0 ? 0 : 1 });
        }
    };

    // The forward pass for one minute, turned into the layers to draw.
    const memo = new Map();
    const build = (minute) => {
        let planes = memo.get(minute);
        if (planes) return planes;

        const tokens = digitsAt(minute * 60);
        planes = [plane('input: the UTC date and time', tokens.map((t) => [t]), 'digit')];

        let x = add(tokens.map((t) => tokenEmbedding[t]), positionEmbedding);
        let current = plane('token + position embedding', x);
        // Each digit fans out into its 16 embedding values.
        current.nodes.forEach((n, k) => {
            current.links.push({ ax: columnX(Math.floor(k / C)), ay: 0, bx: n.x, by: n.y, glow: n.glow, tone: n.value >= 0 ? 0 : 1 });
        });
        planes.push(current);

        layers.forEach((layer, l) => {
            const a = normalise(x);
            const q = multiply(a, layer.query), k = multiply(a, layer.key), v = multiply(a, layer.value);
            const width = C / HEADS;
            const mixed = Array.from({ length: T }, () => new Array(C).fill(0));
            const beams = [];
            for (let h = 0; h < HEADS; h++) {
                const from = h * width;
                q.forEach((qi, i) => {
                    // How much token i attends to each token j.
                    const share = softmax(k.map((kj) => {
                        let dot = 0;
                        for (let c = from; c < from + width; c++) dot += qi[c] * kj[c];
                        return dot / Math.sqrt(width);
                    }));
                    share.forEach((w, j) => {
                        for (let c = from; c < from + width; c++) mixed[i][c] += w * v[j][c];
                        // One head arcs over the top of the columns, the other under the bottom.
                        if (w > 0.05) beams.push({ ax: columnX(j), ay: h ? 0.92 : -0.92, bx: columnX(i), by: h ? 0.92 : -0.92, glow: Math.sqrt(w), tone: h });
                    });
                });
            }
            x = add(x, multiply(mixed, layer.out));
            const attended = plane(`layer ${l + 1}: attention`, x);
            attended.links = beams;
            planes.push(attended);

            const input = normalise(x);
            const hidden = multiply(input, layer.up).map((row) => row.map(gelu));
            const wide = plane(`layer ${l + 1}: feed-forward`, hidden);
            wire(wide, attended, layer.up, input);
            planes.push(wide);

            x = add(x, multiply(hidden, layer.down));
            const merged = plane(`layer ${l + 1}: back to the residual stream`, x);
            wire(merged, wide, layer.down, hidden);
            planes.push(merged);
            current = merged;
        });

        const final = normalise(x);
        const probability = multiply(final, unembedding).map(softmax);
        const scores = plane('probability of each digit', probability, 'share');
        wire(scores, current, unembedding, final);
        planes.push(scores);

        const answer = plane('prediction', probability.map((row) => [row.indexOf(Math.max(...row))]), 'digit');
        probability.forEach((row, token) => {
            const best = row.indexOf(Math.max(...row));
            const [ax, ay] = place(token, best, V);
            answer.links.push({ ax, ay, bx: columnX(token), by: 0, glow: Math.sqrt(row[best]), tone: 0 });
        });
        planes.push(answer);

        if (memo.size > 3) memo.clear();
        memo.set(minute, planes);
        return planes;
    };

    let width = 0, height = 0, focal = 0, colours = ['#888', '#888'], ink = '#888', dark = true, lastDraw = 0;

    const resize = () => {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        width = innerWidth;
        height = innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        // A layer one unit away fills most of the screen.
        focal = Math.min(width / 3.5, height / 2.3);
    };

    // The palette's two colours and the text colour, as resolved by the stylesheet.
    const readColours = () => {
        const style = getComputedStyle(root);
        colours = [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--counter').trim()];
        ink = style.getPropertyValue('--fg').trim();
        dark = root.dataset.mode === 'dark';
    };

    const clamp = (v) => Math.max(0, Math.min(1, v));
    const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

    // The camera's sideways drift and the fade at each end of the flight, set once per frame.
    let swayX = 0, swayY = 0, curtain = 1;

    const project = (x, y, depth) => [width / 2 + (x - swayX) * focal / depth, height / 2 + (y - swayY) * focal / depth];
    // Faint in the distance, and fading out as a layer passes the camera.
    const haze = (depth) => clamp((FAR - depth) / 2.5) * clamp((depth - 0.1) / 0.3) * curtain;

    // Connections from the layer behind, growing towards this one as the signal travels.
    const drawLinks = (links, depth, reached) => {
        const behind = depth - 1;
        if (behind <= 0.12 || reached <= 0) return;
        const fade = Math.min(haze(depth), haze(behind)) * (reached < 1 ? 1 : 0.5);
        for (const link of links) {
            const alpha = fade * (0.04 + 0.9 * link.glow);
            if (alpha < 0.02) continue;
            const [x1, y1] = project(link.ax, link.ay, behind);
            const [x2, y2] = project(link.bx, link.by, depth);
            const ex = x1 + (x2 - x1) * reached, ey = y1 + (y2 - y1) * reached;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = ctx.fillStyle = colours[link.tone];
            ctx.lineWidth = link.glow > 0.6 ? 1.6 : 1;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            if (reached < 1 && link.glow > 0.3) { // the head of the signal
                ctx.globalAlpha = Math.min(1, alpha * 2.5);
                ctx.beginPath();
                ctx.arc(ex, ey, 1.8, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    };

    const drawDigit = (text, x, y, depth, alpha) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = ink;
        ctx.font = `600 ${Math.max(8, Math.min(72, 0.1 * focal / depth))}px ui-monospace, Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    };

    // Neurons: brightness is the size of the activation.
    const drawNodes = (nodes, depth, arrived) => {
        const fog = haze(depth);
        const radius = Math.max(0.7, Math.min(9, 0.011 * focal / depth));
        for (const n of nodes) {
            const [x, y] = project(n.x, n.y, depth);
            if (x < -20 || x > width + 20 || y < -20 || y > height + 20) continue;
            if (n.text) {
                drawDigit(n.text, x, y, depth, fog * (0.25 + 0.75 * arrived));
                continue;
            }
            const shine = n.glow * arrived;
            ctx.fillStyle = colours[n.value >= 0 ? 0 : 1];
            if (shine > 0.45) { // a halo around the strongest ones
                ctx.globalAlpha = fog * 0.22 * shine;
                ctx.beginPath();
                ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = fog * (0.07 + 0.93 * shine);
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    // The layer's name, at its top-left corner, once it is close enough to read.
    const drawLabel = (label, depth) => {
        const size = 0.045 * focal / depth;
        if (size < 8) return;
        const [x, y] = project(-1.5, -1.02, depth);
        ctx.globalAlpha = haze(depth) * 0.75;
        ctx.fillStyle = ink;
        ctx.font = `${Math.min(22, size)}px ui-monospace, Consolas, monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(label, x, y);
    };

    const draw = () => {
        const t = Date.now() / 1000; // UTC seconds: the only input
        const minute = Math.floor(t / JOURNEY);
        const into = t - minute * JOURNEY;
        const planes = build(minute);
        const last = planes.length - 1;

        // Camera depth: steady travel that eases off whenever a layer is at viewing distance.
        const along = START + (last - VIEW - START) * clamp(into / TRAVEL);
        const camera = along + 0.1 * Math.sin(2 * Math.PI * (along + 0.05)) * clamp((TRAVEL - into) / 3);
        swayX = 0.13 * Math.sin(t * 0.13);
        swayY = 0.08 * Math.sin(t * 0.17 + 1);
        curtain = smooth(into / 1.5) * smooth((JOURNEY - into) / 2);

        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'; // overlapping lights add up
        ctx.lineCap = 'round';

        for (let k = last; k >= 0; k--) { // far to near
            const depth = k - camera;
            if (depth <= 0.1 || depth > FAR) continue;
            // 0..1: how far the signals have got into this layer. They fire just ahead of the camera.
            const reached = k === 0 ? 1 : clamp(camera - (k - 2.6));
            if (k > 0) drawLinks(planes[k].links, depth, reached);
            drawNodes(planes[k].nodes, depth, k === 0 ? 1 : smooth(reached * 1.25 - 0.25));
            drawLabel(planes[k].label, depth);
        }
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

    // With "reduce motion" on: no smooth flight, just a fresh picture each second.
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
