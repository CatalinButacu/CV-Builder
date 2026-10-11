// Animated background: a small language-model-style network drawn as a stack
// of solid 3D blocks, computing from top to bottom.
//
// The network is a real transformer (two layers, two attention heads) with
// fixed random weights. Once a minute it is given the UTC date and time as 12
// digits and run forward. Each stage of the calculation is a slab seen from
// above at an angle; its top face is a grid with one cell per number, lit by
// the size of that number. The view scrolls down the stack as the data moves
// from block to block, then rewinds.
//
// Reading a block: rows across are the 12 tokens (the digits of the time),
// the other direction is the values each token carries at that stage. In an
// attention block a cell shows how much one token looks at another.
//
// The input and the moment being shown both come from UTC time alone, so a
// refresh, or another visitor anywhere, sees the same thing. The weights are
// random, not trained, so the prediction is meaningless; what is real is how
// the numbers flow.
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

    const PASS = 60;    // seconds: one forward pass per UTC minute
    const STAGE = 5;    // seconds per block
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

    // One slab: a grid of numbers plus how to turn each into a brightness.
    // kind: 'signed' values, 'share' values between 0 and 1, or 'digit' text.
    const slab = (grid, kind) => {
        let biggest = 1e-9;
        for (const row of grid) for (const v of row) biggest = Math.max(biggest, Math.abs(v));
        const brightness = (v) => {
            if (kind === 'digit') return 1;
            return kind === 'share' ? Math.sqrt(v) : Math.abs(v) / biggest;
        };
        const glow = grid.map((row) => row.map(brightness));
        return { grid, glow, kind, tokens: grid.length, units: grid[0].length };
    };

    // The forward pass for one minute, as the rows of blocks to draw.
    const memo = new Map();
    const build = (minute) => {
        let rows = memo.get(minute);
        if (rows) return rows;

        const tokens = digitsAt(minute * 60);
        rows = [{ label: 'input: UTC date and time', slabs: [slab(tokens.map((t) => [t]), 'digit')] }];

        let x = add(tokens.map((t) => tokenEmbedding[t]), positionEmbedding);
        rows.push({ label: 'embedding', slabs: [slab(x, 'signed')] });

        layers.forEach((layer, l) => {
            const a = normalise(x);
            const q = multiply(a, layer.query), k = multiply(a, layer.key), v = multiply(a, layer.value);
            const width = C / HEADS;
            const mixed = Array.from({ length: T }, () => new Array(C).fill(0));
            const heads = [];
            for (let h = 0; h < HEADS; h++) {
                const from = h * width;
                // attention[i][j]: how much token i looks at token j.
                const attention = q.map((qi) => softmax(k.map((kj) => {
                    let dot = 0;
                    for (let c = from; c < from + width; c++) dot += qi[c] * kj[c];
                    return dot / Math.sqrt(width);
                })));
                attention.forEach((weights, i) => weights.forEach((w, j) => {
                    for (let c = from; c < from + width; c++) mixed[i][c] += w * v[j][c];
                }));
                heads.push(slab(attention, 'share'));
            }
            rows.push({ label: `layer ${l + 1}: attention, two heads`, slabs: heads });
            x = add(x, multiply(mixed, layer.out));

            const hidden = multiply(normalise(x), layer.up).map((row) => row.map(gelu));
            rows.push({ label: `layer ${l + 1}: feed-forward`, slabs: [slab(hidden, 'signed')] });

            x = add(x, multiply(hidden, layer.down));
            rows.push({ label: `layer ${l + 1}: output`, slabs: [slab(x, 'signed')] });
        });

        const probability = multiply(normalise(x), unembedding).map(softmax);
        rows.push(
            { label: 'probability of each digit', slabs: [slab(probability, 'share')] },
            { label: 'prediction', slabs: [slab(probability.map((row) => [row.indexOf(Math.max(...row))]), 'digit')] },
        );

        if (memo.size > 3) memo.clear();
        memo.set(minute, rows);
        return rows;
    };

    // --- Layout. Blocks are drawn in isometric view: one step along the token
    // axis goes right and down, one step along the unit axis goes left and down.
    const RIGHT = 0.866, DOWN = 0.5;
    const BLOCKS = 4 + LAYERS * 3;

    let width = 0, height = 0, cell = 0, thick = 0, gap = 0;
    let colours = ['#888', '#888'], ink = '#888', surface = '#222', lastDraw = 0;

    const resize = () => {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        width = innerWidth;
        height = innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        // Cell size: the widest block (feed-forward) should fit comfortably.
        cell = Math.max(3.5, Math.min(14, width * 0.82 / ((T + HIDDEN) * RIGHT), height / 50));
        thick = cell * 1.6; // how tall each slab stands
        gap = cell * 6;     // vertical space between blocks
    };

    // The palette's two colours, the text colour and the card colour, as resolved by the stylesheet.
    const readColours = () => {
        const style = getComputedStyle(root);
        colours = [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--counter').trim()];
        ink = style.getPropertyValue('--fg').trim();
        surface = style.getPropertyValue('--surface-raised').trim();
    };

    const clamp = (v) => Math.max(0, Math.min(1, v));
    const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

    const slabHeight = (s) => (s.tokens + s.units) * DOWN * cell + thick;
    const slabWidth = (s) => (s.tokens + s.units) * RIGHT * cell;
    const rowHeight = (row) => Math.max(...row.slabs.map(slabHeight));

    const quad = (points) => {
        ctx.beginPath();
        points.forEach(([x, y], n) => { if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath();
    };

    // One slab. (cx, top) is where the centre of its top edge goes on screen.
    // lit: 0..1, how much of the block has received its values yet.
    const drawSlab = (s, cx, top, lit, fade) => {
        const { tokens: I, units: J } = s;
        // Screen position of grid corner (i, j) on the top face.
        const ox = cx - (I - J) * RIGHT * cell / 2;
        const at = (i, j) => [ox + (i - j) * RIGHT * cell, top + (i + j) * DOWN * cell];

        // The two visible sides, darker than the top.
        const [lx, ly] = at(0, J), [bx, by] = at(I, J), [rx, ry] = at(I, 0);
        ctx.fillStyle = colours[0];
        ctx.globalAlpha = fade * 0.3;
        quad([[lx, ly], [bx, by], [bx, by + thick], [lx, ly + thick]]);
        ctx.fill();
        ctx.globalAlpha = fade * 0.18;
        quad([[bx, by], [rx, ry], [rx, ry + thick], [bx, by + thick]]);
        ctx.fill();

        // The top face: a solid plate with the cells on it.
        ctx.globalAlpha = fade * 0.9;
        ctx.fillStyle = surface;
        quad([at(0, 0), at(I, 0), at(I, J), at(0, J)]);
        ctx.fill();

        const inset = 0.08;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `600 ${Math.max(7, cell * 0.95)}px ui-monospace, Consolas, monospace`;
        for (let i = 0; i < I; i++) {
            // Values arrive token by token, sweeping across the block.
            const here = smooth(lit * 1.5 - (i / I) * 0.5);
            for (let j = 0; j < J; j++) {
                if (s.kind === 'digit') {
                    const [x, y] = at(i + 0.5, j + 0.5);
                    ctx.globalAlpha = fade * (0.25 + 0.75 * here);
                    ctx.fillStyle = ink;
                    ctx.fillText(s.grid[i][j], x, y);
                    continue;
                }
                ctx.globalAlpha = fade * (0.06 + 0.94 * s.glow[i][j] * here);
                ctx.fillStyle = colours[s.grid[i][j] >= 0 ? 0 : 1];
                quad([at(i + inset, j + inset), at(i + 1 - inset, j + inset), at(i + 1 - inset, j + 1 - inset), at(i + inset, j + 1 - inset)]);
                ctx.fill();
            }
        }

        // Outline of the top face.
        ctx.globalAlpha = fade * (0.35 + 0.5 * Math.sin(clamp(lit) * Math.PI));
        ctx.strokeStyle = colours[0];
        ctx.lineWidth = 1;
        quad([at(0, 0), at(I, 0), at(I, J), at(0, J)]);
        ctx.stroke();
    };

    // The pipe from one row of blocks down to the next, with light running down it.
    const drawPipe = (x1, y1, x2, y2, flow, fade) => {
        ctx.globalAlpha = fade * 0.3;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (flow <= 0 || flow >= 1) return;
        ctx.fillStyle = colours[0];
        for (let n = 0; n < 4; n++) { // a short train of lights
            const at = flow - n * 0.09;
            if (at < 0) continue;
            ctx.globalAlpha = fade * (1 - n * 0.22);
            ctx.beginPath();
            ctx.arc(x1 + (x2 - x1) * at, y1 + (y2 - y1) * at, Math.max(1.5, cell * 0.22), 0, Math.PI * 2);
            ctx.fill();
        }
    };

    const draw = () => {
        const t = Date.now() / 1000; // UTC seconds: the only input
        const minute = Math.floor(t / PASS);
        const into = t - minute * PASS;
        const rows = build(minute);
        const fade = smooth(into / 1.5) * smooth((PASS - into) / 2); // fade in and out

        // Where each row of blocks sits in the stack, top to bottom.
        const tops = [];
        let y = 0;
        for (const row of rows) { tops.push(y); y += rowHeight(row) + gap; }
        const middle = (r) => tops[r] + rowHeight(rows[r]) / 2;

        // Which block the calculation has reached. It rests on each block, then glides to the next.
        const stage = Math.min(BLOCKS - 1, into / STAGE);
        const whole = Math.floor(stage);
        const glide = whole + smooth((stage - whole - 0.55) / 0.45);
        // After the last block the view rewinds to the top.
        const rewind = smooth((into - BLOCKS * STAGE - 1) / 6);
        const focus = Math.min(BLOCKS - 1, glide) * (1 - rewind);
        const low = Math.floor(focus), high = Math.min(BLOCKS - 1, low + 1);
        const scroll = middle(low) + (middle(high) - middle(low)) * (focus - low) - height * 0.5;

        ctx.clearRect(0, 0, width, height);
        ctx.lineJoin = 'round';
        const centre = width / 2;

        rows.forEach((row, r) => {
            const top = tops[r] - scroll;
            const tall = rowHeight(row);
            if (top > height + 40 || top + tall + gap < -40) return;

            // 0..1: how much of this row has its values. Earlier rows stay lit.
            const lit = r === 0 ? 1 : clamp((into / STAGE - r) / 0.4);

            // Blocks in a row sit side by side.
            const spacing = cell * 2;
            const total = row.slabs.reduce((sum, s) => sum + slabWidth(s), 0) + spacing * (row.slabs.length - 1);
            let left = centre - total / 2;
            const centres = row.slabs.map((s) => { const cx = left + slabWidth(s) / 2; left += slabWidth(s) + spacing; return cx; });

            // Pipes down to the next row, drawn first so the blocks sit on top of them.
            if (r + 1 < rows.length) {
                const flow = clamp((into / STAGE - r - 0.55) / 0.45);
                const nextTop = tops[r + 1] - scroll;
                const next = rows[r + 1].slabs;
                const nextTotal = next.reduce((sum, s) => sum + slabWidth(s), 0) + spacing * (next.length - 1);
                let nextLeft = centre - nextTotal / 2;
                const nextCentres = next.map((s) => { const cx = nextLeft + slabWidth(s) / 2; nextLeft += slabWidth(s) + spacing; return cx; });
                centres.forEach((cx, n) => nextCentres.forEach((nx) => {
                    drawPipe(cx, top + slabHeight(row.slabs[n]), nx, nextTop, flow, fade);
                }));
            }

            row.slabs.forEach((s, n) => drawSlab(s, centres[n], top, lit, fade));

            if (cell >= 7) {
                ctx.globalAlpha = fade * (0.55 + 0.45 * Math.sin(clamp(lit) * Math.PI));
                ctx.fillStyle = ink;
                ctx.font = `${Math.min(14, cell * 1.05)}px ui-monospace, Consolas, monospace`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(row.label, centre - total / 2, top - cell * 0.9);
            }
        });
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
