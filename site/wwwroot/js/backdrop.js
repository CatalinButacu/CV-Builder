// Animated background: a small language-model-style network computing, drawn
// in 2.5D.
//
// The network is a real transformer (two layers, two attention heads) with
// fixed random weights. Once a minute it is given the UTC date and time as 12
// digits and run forward. Its ten layers are drawn as tilted sheets standing
// side by side, all visible at once, and the calculation moves through them
// one sheet at a time, so the path of the signal can be followed.
//
// Every light is a real number from that calculation:
//   - a cell's brightness is the size of that neuron's activation, its colour the sign;
//   - a connection's brightness is the strength of the signal it carries
//     (attention weight, or weight x activation for the feed-forward parts).
//
// The input and the step being shown both come from UTC time alone, so a
// refresh, or another visitor anywhere, sees the same moment of the same pass.
// The weights are random, not trained, so the prediction is meaningless; what
// is real is how the numbers flow.
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

    const PASS = 60;  // seconds: one forward pass per UTC minute
    const STAGE = 5;  // seconds for the signal to cross from one sheet to the next
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
        planes = [plane('UTC time', tokens.map((t) => [t]), 'digit')];

        let x = add(tokens.map((t) => tokenEmbedding[t]), positionEmbedding);
        let current = plane('embedding', x);
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
            const attended = plane(`L${l + 1} attention`, x);
            attended.links = beams;
            planes.push(attended);

            const input = normalise(x);
            const hidden = multiply(input, layer.up).map((row) => row.map(gelu));
            const wide = plane(`L${l + 1} feed-forward`, hidden);
            wire(wide, attended, layer.up, input);
            planes.push(wide);

            x = add(x, multiply(hidden, layer.down));
            const merged = plane(`L${l + 1} residual`, x);
            wire(merged, wide, layer.down, hidden);
            planes.push(merged);
            current = merged;
        });

        const final = normalise(x);
        const probability = multiply(final, unembedding).map(softmax);
        const scores = plane('probabilities', probability, 'share');
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

    // --- The 2.5D view. Nothing is in perspective: a point on sheet k at
    // sheet coordinates (x, y) lands at  origin + x * EX + y * EY + k * EZ.
    // EX tilts each sheet away from the viewer, EZ steps to the next sheet.
    const EX = [0.34, 0.17], EY = [0, 0.5], EZ = [0.95, -0.12];
    const SHEETS = 3 + LAYERS * 3 + 1; // input, embedding, three per layer, probabilities, prediction

    let width = 0, height = 0, unit = 0, originX = 0, originY = 0;
    let colours = ['#888', '#888'], ink = '#888', paper = '#000', lastDraw = 0;

    const project = (x, y, k) => [originX + (x * EX[0] + k * EZ[0]) * unit, originY + (x * EX[1] + y * EY[1] + k * EZ[1]) * unit];

    const resize = () => {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        width = innerWidth;
        height = innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        // Size of the whole row of sheets in units, then scale it to fit the window.
        const wide = 3.2 * EX[0] + (SHEETS - 1) * EZ[0];
        const tall = 3.2 * EX[1] + 2 * EY[1] + (SHEETS - 1) * -EZ[1];
        unit = Math.min(width * 0.94 / wide, height * 0.8 / tall);
        originX = (width - wide * unit) / 2 + 1.6 * EX[0] * unit;
        originY = (height - tall * unit) / 2 + (SHEETS - 1) * -EZ[1] * unit + EY[1] * unit + 1.6 * EX[1] * unit;
    };

    // The palette's two colours, the text colour and the page colour, as resolved by the stylesheet.
    const readColours = () => {
        const style = getComputedStyle(root);
        colours = [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--counter').trim()];
        ink = style.getPropertyValue('--fg').trim();
        paper = style.getPropertyValue('--bg').trim();
    };

    const clamp = (v) => Math.max(0, Math.min(1, v));
    const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

    // A four-cornered tile lying in sheet k, centred on (x, y).
    const tile = (x, y, k, halfX, halfY) => {
        const corners = [[-halfX, -halfY], [halfX, -halfY], [halfX, halfY], [-halfX, halfY]];
        ctx.beginPath();
        corners.forEach(([dx, dy], n) => {
            const [px, py] = project(x + dx, y + dy, k);
            if (n) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        });
        ctx.closePath();
    };

    // The sheet itself: a faint pane that hides what is behind it, outlined
    // more strongly while the signal is arriving.
    const drawSheet = (k, active, curtain) => {
        tile(0, 0, k, 1.6, 0.96);
        ctx.globalAlpha = 0.55 * curtain;
        ctx.fillStyle = paper;
        ctx.fill();
        ctx.globalAlpha = (0.16 + 0.7 * active) * curtain;
        ctx.strokeStyle = active > 0 ? colours[0] : ink;
        ctx.lineWidth = 1 + active;
        ctx.stroke();
    };

    // Connections arriving from the previous sheet, growing as the signal travels.
    const drawLinks = (links, k, reached, curtain) => {
        if (reached <= 0) return;
        const travelling = reached < 1;
        for (const link of links) {
            const alpha = curtain * (travelling ? 0.06 + 0.9 * link.glow : 0.28 * link.glow);
            if (alpha < 0.03) continue;
            const [x1, y1] = project(link.ax, link.ay, k - 1);
            const [x2, y2] = project(link.bx, link.by, k);
            const ex = x1 + (x2 - x1) * reached, ey = y1 + (y2 - y1) * reached;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = ctx.fillStyle = colours[link.tone];
            ctx.lineWidth = link.glow > 0.6 ? 1.6 : 1;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            if (travelling && link.glow > 0.3) { // the head of the signal
                ctx.globalAlpha = Math.min(1, alpha * 2.5);
                ctx.beginPath();
                ctx.arc(ex, ey, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    };

    // The neurons of a sheet as lit tiles: brightness is the size of the activation.
    const drawNodes = (p, k, arrived, curtain) => {
        const halfX = p.count === HIDDEN ? 0.036 : 0.085, halfY = 0.04;
        for (const n of p.nodes) {
            if (n.text) {
                const [x, y] = project(n.x, n.y, k);
                ctx.globalAlpha = curtain * (0.3 + 0.7 * arrived);
                ctx.fillStyle = ink;
                ctx.font = `600 ${Math.max(7, 0.13 * unit)}px ui-monospace, Consolas, monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(n.text, x, y);
                continue;
            }
            tile(n.x, n.y, k, halfX, halfY);
            ctx.globalAlpha = curtain * (0.07 + 0.93 * n.glow * arrived);
            ctx.fillStyle = colours[n.value >= 0 ? 0 : 1];
            ctx.fill();
        }
    };

    const drawLabel = (label, k, active, curtain) => {
        const size = Math.max(0, 0.085 * unit);
        if (size < 8) return;
        const [x, y] = project(-1.6, -1.06, k);
        ctx.globalAlpha = curtain * (0.5 + 0.5 * active);
        ctx.fillStyle = active > 0 ? colours[0] : ink;
        ctx.font = `${Math.min(14, size)}px ui-monospace, Consolas, monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(label, x, y);
    };

    const draw = () => {
        const t = Date.now() / 1000; // UTC seconds: the only input
        const minute = Math.floor(t / PASS);
        const into = t - minute * PASS;
        const planes = build(minute);
        const curtain = smooth(into / 1.5) * smooth((PASS - into) / 2.5); // fade in and out

        ctx.clearRect(0, 0, width, height);
        ctx.lineJoin = 'round';

        for (let k = planes.length - 1; k >= 0; k--) { // far to near
            // 0..1: how far the signal has got on its way into sheet k.
            const reached = k === 0 ? 1 : clamp((into - (k - 1) * STAGE) / (STAGE * 0.85));
            const arrived = k === 0 ? 1 : smooth(reached * 1.3 - 0.3);
            const active = reached > 0 && reached < 1 ? Math.sin(reached * Math.PI) : 0;
            // The connections into the sheet in front are drawn first, so that sheet covers their ends.
            if (k + 1 < planes.length) {
                const next = clamp((into - k * STAGE) / (STAGE * 0.85));
                drawLinks(planes[k + 1].links, k + 1, next, curtain);
            }
            drawSheet(k, active, curtain);
            drawNodes(planes[k], k, arrived, curtain);
            drawLabel(planes[k].label, k, active, curtain);
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
