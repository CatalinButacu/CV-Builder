// Animated background: a nano-GPT, end to end, while it learns.
//
// The model is a small GPT (js/nanogpt.js) whose job is to sort six letters
// from {A, B, C}: given "C B A B B C" it should write "A B B B C C". It was
// trained once, offline, by tools/train-nanogpt.js, and its weights were saved
// at 32 points of that run (data/nanogpt.bin).
//
// Two things play at once, both driven by UTC time alone, so a refresh or
// another visitor sees the same moment:
//
//   1. The training run is replayed. Over two minutes the weights move from
//      random to trained, then hold. The weight blocks change in front of you,
//      and the answer the model writes goes from wrong to right.
//
//   2. An automatic walkthrough of one forward pass. The model is drawn as a
//      stack of solid blocks seen from above at an angle, as on
//      bbycroft.net/llm: every weight matrix and every intermediate result is
//      a slab whose top face has one cell per number. The view moves down the
//      stack block by block: embeddings, then for each layer the attention
//      weights, the attention pattern, the feed-forward weights and its hidden
//      layer, and finally the output probabilities and the letters predicted.
//
// A cell's brightness is the size of its number and its colour the sign.
// Result blocks have sides in the first palette colour, weight blocks in the
// second. Nothing is made up: the forward pass is recomputed every frame from
// the weights of that moment of the training run.
(() => {
    const canvas = document.querySelector('.backdrop canvas');
    if (!canvas || !window.NanoGPT) return;

    const ctx = canvas.getContext('2d');
    const root = document.documentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const TRAINING = 120; // seconds for the replay to go from random weights to trained
    const CYCLE = 150;    // then it holds the trained model until the cycle restarts
    const PASS = 50;      // seconds for one walkthrough of the forward pass
    const FRAME = 1000 / 30;

    // A repeatable value between 0 and 1 for a pair of whole numbers.
    const hash = (a, b) => {
        let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f);
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
        h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    };

    // ------------------------------------------------------------------
    // The recorded training run.
    // ------------------------------------------------------------------
    let run = null;   // the description: model shape and, per snapshot, step, loss and accuracy
    let bytes = null; // every snapshot's weights, one signed byte each

    // The weights at a point of the run. `at` counts snapshots and may fall
    // between two, in which case the weights are blended.
    const weightsAt = (at) => {
        const low = Math.min(run.snapshots.length - 1, Math.floor(at));
        const high = Math.min(run.snapshots.length - 1, low + 1), mix = at - low;
        const perSnapshot = bytes.length / run.snapshots.length;
        let offset = 0;
        const named = {};
        run.tensors.forEach((tensor, n) => {
            const a = run.snapshots[low].scales[n] / 127, b = run.snapshots[high].scales[n] / 127;
            const rows = [];
            for (let r = 0; r < tensor.rows; r++) {
                const row = new Array(tensor.cols);
                for (let c = 0; c < tensor.cols; c++) {
                    const i = offset + r * tensor.cols + c;
                    const from = bytes[low * perSnapshot + i] * a, to = bytes[high * perSnapshot + i] * b;
                    row[c] = from + (to - from) * mix;
                }
                rows.push(row);
            }
            named[tensor.name] = rows;
            offset += tensor.rows * tensor.cols;
        });
        return {
            wte: named.wte, wpe: named.wpe, head: named.head,
            layers: Array.from({ length: run.layers }, (_, l) => ({
                qkv: named[`layer${l}.qkv`], out: named[`layer${l}.out`], fc: named[`layer${l}.fc`], proj: named[`layer${l}.proj`],
            })),
        };
    };

    const blend = (key, at) => {
        const low = Math.min(run.snapshots.length - 1, Math.floor(at)), high = Math.min(run.snapshots.length - 1, low + 1);
        return run.snapshots[low][key] + (run.snapshots[high][key] - run.snapshots[low][key]) * (at - low);
    };

    // The model writing its answer one letter at a time, as it would be used.
    // Returns the full sequence it ended up with and the last forward pass.
    const write = (weights, letters) => {
        const tokens = [...letters];
        let result = null;
        for (let n = 0; n < run.letters; n++) {
            const padded = [...tokens];
            while (padded.length < run.context) padded.push(0);
            result = NanoGPT.forward(weights, padded, run.heads);
            tokens.push(result.prediction[tokens.length - 1]);
        }
        return { tokens, result };
    };

    // ------------------------------------------------------------------
    // The stack of blocks for one moment.
    // ------------------------------------------------------------------
    // kind: 'value' and 'weight' are signed numbers, 'share' is between 0 and 1, 'text' is letters.
    const slab = (label, grid, kind) => {
        let biggest = 1e-9;
        if (kind !== 'text') for (const row of grid) for (const v of row) biggest = Math.max(biggest, Math.abs(v));
        return { label, grid, kind, biggest, rows: grid.length, cols: grid[0].length };
    };

    const build = (weights, letters) => {
        const { tokens, result } = write(weights, letters);
        const input = tokens.slice(0, run.context);
        const name = (t) => run.vocab[t];
        const rows = [
            { formula: 'six letters to sort, then the answer so far', slabs: [slab('tokens', input.map((t) => [name(t)]), 'text')] },
            { formula: 'token embedding wte, position embedding wpe', slabs: [slab('wte', weights.wte, 'weight'), slab('wpe', weights.wpe, 'weight')] },
            { formula: 'x = wte[token] + wpe[position]', slabs: [slab('x', result.embedded, 'value')] },
        ];
        weights.layers.forEach((layer, l) => {
            const r = result.layers[l], n = l + 1;
            rows.push(
                { formula: `layer ${n} · attention weights`, slabs: [slab('W qkv', layer.qkv, 'weight')] },
                { formula: 'softmax(Q · Kᵀ / √d)   who looks at whom', slabs: r.attention.map((head, h) => slab(`head ${h + 1}`, head, 'share')) },
                { formula: 'x ← x + attention · W out', slabs: [slab('W out', layer.out, 'weight'), slab('x', r.afterAttention, 'value')] },
                { formula: `layer ${n} · feed-forward weights`, slabs: [slab('W fc', layer.fc, 'weight')] },
                { formula: 'h = GELU(LayerNorm(x) · W fc)', slabs: [slab('h', r.hidden, 'value')] },
                { formula: 'x ← x + h · W proj', slabs: [slab('W proj', layer.proj, 'weight'), slab('x', r.out, 'value')] },
            );
        });
        rows.push(
            { formula: 'p = softmax(LayerNorm(x) · W head)', slabs: [slab('W head', weights.head, 'weight'), slab('p  A B C', result.probabilities, 'share')] },
            { formula: 'the next letter, at every position', slabs: [slab('prediction', result.prediction.map((t) => [name(t)]), 'text')] },
        );
        const answer = tokens.slice(run.letters);
        const sorted = [...letters].sort((a, b) => a - b);
        return { rows, question: letters.map(name).join(' '), answer: answer.map(name).join(' '), right: answer.join() === sorted.join() };
    };

    // ------------------------------------------------------------------
    // Drawing.
    // ------------------------------------------------------------------
    // Isometric view: a step along a slab's first axis goes right and down, along its second left and down.
    const RIGHT = 0.866, DOWN = 0.5;

    let width = 0, height = 0, cell = 0, thick = 0, gap = 0;
    let colours = ['#888', '#888'], ink = '#888', surface = '#222', lastDraw = 0;

    const resize = () => {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        width = innerWidth;
        height = innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        // The widest row (W proj beside x) should fit across the window.
        cell = Math.max(2.6, Math.min(11, width * 0.86 / (112 * RIGHT), height / 48));
        thick = cell * 1.8;
        gap = cell * 7;
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

    const slabWidth = (s) => (s.rows + s.cols) * RIGHT * cell;
    const slabHeight = (s) => (s.rows + s.cols) * DOWN * cell + thick;
    const rowHeight = (row) => Math.max(...row.slabs.map(slabHeight));
    const rowWidth = (row) => row.slabs.reduce((sum, s) => sum + slabWidth(s), 0) + cell * 3 * (row.slabs.length - 1);

    const quad = (points) => {
        ctx.beginPath();
        points.forEach(([x, y], n) => { if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath();
    };

    // One slab. (cx, top) is where the middle of its top corner goes on screen.
    // lit: 0..1, how much of it the walkthrough has reached.
    const drawSlab = (s, cx, top, lit, fade) => {
        const I = s.rows, J = s.cols;
        const ox = cx - (I - J) * RIGHT * cell / 2;
        const at = (i, j) => [ox + (i - j) * RIGHT * cell, top + (i + j) * DOWN * cell];
        const weight = s.kind === 'weight';

        // The two visible sides: first colour for results, second for weights.
        const [lx, ly] = at(0, J), [bx, by] = at(I, J), [rx, ry] = at(I, 0);
        ctx.fillStyle = colours[weight ? 1 : 0];
        ctx.globalAlpha = fade * 0.34;
        quad([[lx, ly], [bx, by], [bx, by + thick], [lx, ly + thick]]);
        ctx.fill();
        ctx.globalAlpha = fade * 0.2;
        quad([[bx, by], [rx, ry], [rx, ry + thick], [bx, by + thick]]);
        ctx.fill();

        // The top face: a solid plate with one cell per number.
        ctx.globalAlpha = fade * 0.92;
        ctx.fillStyle = surface;
        quad([at(0, 0), at(I, 0), at(I, J), at(0, J)]);
        ctx.fill();

        const inset = cell > 4 ? 0.09 : 0;
        if (s.kind === 'text') {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `700 ${Math.max(8, cell * 1.5)}px ui-monospace, Consolas, monospace`;
        }
        for (let i = 0; i < I; i++) {
            // Results arrive row by row, sweeping across the block. Weights are simply there.
            const here = weight ? 0.35 + 0.65 * lit : smooth(lit * 1.5 - (i / I) * 0.5);
            for (let j = 0; j < J; j++) {
                const v = s.grid[i][j];
                if (s.kind === 'text') {
                    const [x, y] = at(i + 0.5, j + 0.5);
                    ctx.globalAlpha = fade * (0.3 + 0.7 * here);
                    ctx.fillStyle = ink;
                    ctx.fillText(v, x, y);
                    continue;
                }
                const strength = s.kind === 'share' ? Math.sqrt(v) : Math.abs(v) / s.biggest;
                ctx.globalAlpha = fade * (0.05 + 0.95 * strength * here);
                ctx.fillStyle = colours[v >= 0 ? 0 : 1];
                quad([at(i + inset, j + inset), at(i + 1 - inset, j + inset), at(i + 1 - inset, j + 1 - inset), at(i + inset, j + 1 - inset)]);
                ctx.fill();
            }
        }

        // The outline of the top face, brighter while the walkthrough is on this block.
        const active = Math.sin(clamp(lit) * Math.PI);
        ctx.globalAlpha = fade * (0.4 + 0.6 * active);
        ctx.strokeStyle = colours[weight ? 1 : 0];
        ctx.lineWidth = 1 + active;
        quad([at(0, 0), at(I, 0), at(I, J), at(0, J)]);
        ctx.stroke();

        if (cell >= 5) {
            const [tx, ty] = at(0, 0);
            ctx.globalAlpha = fade * 0.85;
            ctx.fillStyle = ink;
            ctx.font = `${Math.min(13, cell * 1.7)}px ui-monospace, Consolas, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(`${s.label}   ${I}×${J}`, tx, ty - cell * 0.9);
        }
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
            ctx.arc(x1 + (x2 - x1) * at, y1 + (y2 - y1) * at, Math.max(1.5, cell * 0.3), 0, Math.PI * 2);
            ctx.fill();
        }
    };

    // Screen x of the middle of each slab in a row, centred as a group.
    const centres = (row) => {
        let left = width / 2 - rowWidth(row) / 2;
        return row.slabs.map((s) => { const cx = left + slabWidth(s) / 2; left += slabWidth(s) + cell * 3; return cx; });
    };

    // What is being trained, and how the model is doing at this moment of the run.
    const drawStatus = (at, scene) => {
        const size = Math.max(10, Math.min(13, width / 60));
        const x = Math.max(12, width * 0.02), y = Math.min(height - 4 * size * 1.5, height * 0.8);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `${size}px ui-monospace, Consolas, monospace`;
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = ink;
        const last = run.snapshots[run.snapshots.length - 1].step;
        const trained = at >= run.snapshots.length - 1;
        ctx.fillText('nano-GPT learning to sort letters', x, y);
        ctx.fillText(trained ? `trained · step ${last} of ${last}` : `training · step ${Math.round(blend('step', at))} of ${last}`, x, y + size * 1.5);
        ctx.fillText(`loss ${blend('loss', at).toFixed(3)} · sorts ${Math.round(blend('accuracy', at) * 100)}% correctly`, x, y + size * 3);
        ctx.fillStyle = colours[scene.right ? 0 : 1];
        ctx.fillText(`${scene.question}  →  ${scene.answer}  ${scene.right ? '✓' : '✗'}`, x, y + size * 4.5);
        // Progress through the training run.
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = ink;
        ctx.fillRect(x, y + size * 5.2, size * 20, 2);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = colours[0];
        ctx.fillRect(x, y + size * 5.2, size * 20 * clamp(at / (run.snapshots.length - 1)), 2);
    };

    const draw = () => {
        if (!run || !bytes) return;
        const t = Date.now() / 1000; // UTC seconds: the playhead

        // Where the training replay is, and the weights of that moment.
        const at = clamp((t % CYCLE) / TRAINING) * (run.snapshots.length - 1);
        const pass = Math.floor(t / PASS), into = t - pass * PASS;
        // Each walkthrough sorts its own six letters.
        const letters = Array.from({ length: run.letters }, (_, i) => Math.floor(hash(pass, 50 + i) * run.vocab.length));
        const scene = build(weightsAt(at), letters);
        const rows = scene.rows;

        const stage = (PASS - 4) / rows.length; // seconds per row; the last seconds rewind
        const reached = into / stage;
        const fade = smooth(into / 1.2) * smooth((PASS - into) / 1.2);

        // Where each row sits in the stack, top to bottom.
        const tops = [];
        let y = 0;
        for (const row of rows) { tops.push(y); y += rowHeight(row) + gap; }
        const middle = (r) => tops[r] + rowHeight(rows[r]) / 2;

        // The view rests on each row, then glides to the next; at the end it rewinds.
        const capped = Math.min(rows.length - 1, reached);
        const whole = Math.floor(capped);
        const focus = (whole + smooth((capped - whole - 0.55) / 0.45)) * (1 - smooth((into - rows.length * stage) / 3));
        const low = Math.min(rows.length - 1, Math.floor(focus)), high = Math.min(rows.length - 1, low + 1);
        const scroll = middle(low) + (middle(high) - middle(low)) * (focus - low) - height * 0.5;

        ctx.clearRect(0, 0, width, height);
        ctx.lineJoin = 'round';

        rows.forEach((row, r) => {
            const top = tops[r] - scroll;
            if (top > height + 60 || top + rowHeight(row) + gap < -60) return;
            const lit = r === 0 ? 1 : clamp((reached - r) / 0.4);
            const cx = centres(row);

            // Pipes down to the next row, drawn first so the blocks sit on top of them.
            if (r + 1 < rows.length) {
                const flow = clamp((reached - r - 0.55) / 0.45);
                const nextTop = tops[r + 1] - scroll;
                const nextCx = centres(rows[r + 1]);
                cx.forEach((x, n) => nextCx.forEach((nx) => drawPipe(x, top + slabHeight(row.slabs[n]), nx, nextTop, flow, fade)));
            }
            row.slabs.forEach((s, n) => drawSlab(s, cx[n], top, lit, fade));

            if (cell >= 5) {
                ctx.globalAlpha = fade * (0.6 + 0.4 * Math.sin(clamp(lit) * Math.PI));
                ctx.fillStyle = lit > 0 && lit < 1 ? colours[0] : ink;
                ctx.font = `italic ${Math.min(17, cell * 2.2)}px 'Cambria Math', Cambria, Georgia, serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(row.formula, width / 2 - rowWidth(row) / 2, top - cell * 3.4);
            }
        });

        drawStatus(at, scene);
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

    // The recorded run is fetched once; the animation starts when it has arrived.
    const file = (name) => fetch(new URL(`data/${name}`, document.baseURI));
    Promise.all([file('nanogpt.json').then((r) => r.json()), file('nanogpt.bin').then((r) => r.arrayBuffer())])
        .then(([description, buffer]) => { run = description; bytes = new Int8Array(buffer); begin(); })
        .catch(() => { /* without the data there is simply no background animation */ });
})();
