// Animated background: a small neural network being trained, live.
//
// This is real computing, not an animation of it. A classifier with two
// hidden layers of 16 units learns to separate two classes of points in the
// plane: every step runs a forward pass, backpropagation and an Adam update in
// the browser, and what is drawn are the actual numbers. Brightness is
// magnitude: the brighter a cell, the larger the value.
//
// The run is tied to UTC time. Every two minutes of the UTC clock a new run
// starts from fresh random weights on the next dataset, and the step being
// shown is decided by the clock alone. On load the script trains silently up
// to the current step, so a refresh, or another visitor anywhere, lands on the
// same step of the same run.
(() => {
    const canvas = document.querySelector('.backdrop canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const root = document.documentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    // --- Timing, in seconds of UTC time.
    const PERIOD = 120;  // one training run, start to start
    const TICK = 0.25;   // one training step
    const STEPS = 400;   // steps per run; the rest of the period shows the result
    const FRAME = 1000 / 30;

    // ------------------------------------------------------------------
    // The model and its training loop.
    // ------------------------------------------------------------------
    const SIZES = [2, 16, 16, 1];
    const POINTS = 160;
    const BATCH = 32;
    const RATE = 0.03;
    const DATASETS = ['two moons', 'rings', 'checkers', 'spiral'];

    const seeded = (seed) => () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // 160 labelled points in the square -1..1, in one of four classic shapes.
    const makeData = (cycle) => {
        const random = seeded(0x1234 + cycle * 7919);
        const noise = (amount) => (random() + random() + random() - 1.5) * amount;
        const kind = ((cycle % DATASETS.length) + DATASETS.length) % DATASETS.length;
        const points = [];
        for (let i = 0; i < POINTS; i++) {
            const label = i % 2;
            const u = random();
            let x, y;
            if (kind === 0) {        // two interlocking half circles
                const a = u * Math.PI;
                x = ((label ? 1 - Math.cos(a) : Math.cos(a)) - 0.5) / 1.6 + noise(0.07);
                y = ((label ? 0.5 - Math.sin(a) : Math.sin(a)) - 0.25) / 0.9 + noise(0.07);
            } else if (kind === 1) { // a ring around a blob
                const a = u * Math.PI * 2;
                const r = label ? 0.78 + noise(0.1) : 0.3 * Math.sqrt(random());
                x = r * Math.cos(a); y = r * Math.sin(a);
            } else if (kind === 2) { // opposite corners share a class
                const sx = random() < 0.5 ? -1 : 1;
                const sy = label ? sx : -sx;
                x = sx * (0.5 + noise(0.3)); y = sy * (0.5 + noise(0.3));
            } else {                 // two arms of a spiral
                const r = 0.14 + 0.8 * u;
                const a = u * Math.PI * 1.6 + (label ? Math.PI : 0);
                x = r * Math.cos(a) + noise(0.035); y = r * Math.sin(a) + noise(0.035);
            }
            points.push({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), label });
        }
        return { name: DATASETS[kind], points };
    };

    // Weights are stored per layer as one flat array, row by row, with the bias
    // as the last entry of each row: layer.w[j * (inputs + 1) + i].
    const makeModel = (cycle) => {
        const random = seeded(0xbeef + cycle * 104729);
        return SIZES.slice(1).map((outputs, l) => {
            const inputs = SIZES[l];
            const limit = Math.sqrt(6 / (inputs + outputs));
            const w = new Float64Array(outputs * (inputs + 1));
            for (let j = 0; j < outputs; j++)
                for (let i = 0; i < inputs; i++) w[j * (inputs + 1) + i] = (random() * 2 - 1) * limit;
            return { inputs, outputs, w, m: new Float64Array(w.length), v: new Float64Array(w.length) };
        });
    };

    // Forward pass for one point. Returns the activations of every layer.
    const forward = (model, x, y) => {
        const acts = [[x, y]];
        model.forEach((layer, l) => {
            const input = acts[l], out = new Array(layer.outputs), stride = layer.inputs + 1;
            for (let j = 0; j < layer.outputs; j++) {
                let sum = layer.w[j * stride + layer.inputs];
                for (let i = 0; i < layer.inputs; i++) sum += layer.w[j * stride + i] * input[i];
                out[j] = l === model.length - 1 ? 1 / (1 + Math.exp(-sum)) : Math.tanh(sum);
            }
            acts.push(out);
        });
        return acts;
    };

    // One step of training on a mini-batch: backpropagation, then an Adam update.
    // Returns the batch loss and the gradient of every weight.
    const trainStep = (model, data, step) => {
        const grads = model.map((layer) => new Float64Array(layer.w.length));
        const pick = seeded(0x51ed + step * 2654435761);
        let loss = 0;
        for (let b = 0; b < BATCH; b++) {
            const p = data.points[Math.floor(pick() * POINTS)];
            const acts = forward(model, p.x, p.y);
            const out = acts[acts.length - 1][0];
            loss -= p.label ? Math.log(out + 1e-9) : Math.log(1 - out + 1e-9);

            // With a sigmoid output and cross-entropy loss the error at the output is simply out - label.
            let delta = [out - p.label];
            for (let l = model.length - 1; l >= 0; l--) {
                const layer = model[l], input = acts[l], stride = layer.inputs + 1;
                const back = new Array(layer.inputs).fill(0);
                for (let j = 0; j < layer.outputs; j++) {
                    for (let i = 0; i < layer.inputs; i++) {
                        grads[l][j * stride + i] += delta[j] * input[i] / BATCH;
                        back[i] += delta[j] * layer.w[j * stride + i];
                    }
                    grads[l][j * stride + layer.inputs] += delta[j] / BATCH;
                }
                if (l > 0) delta = back.map((d, i) => d * (1 - input[i] * input[i])); // tanh'
            }
        }
        const t = step + 1;
        model.forEach((layer, l) => {
            for (let k = 0; k < layer.w.length; k++) {
                const g = grads[l][k];
                layer.m[k] = 0.9 * layer.m[k] + 0.1 * g;
                layer.v[k] = 0.999 * layer.v[k] + 0.001 * g * g;
                layer.w[k] -= RATE * (layer.m[k] / (1 - 0.9 ** t)) / (Math.sqrt(layer.v[k] / (1 - 0.999 ** t)) + 1e-8);
            }
        });
        return { loss: loss / BATCH, grads };
    };

    const accuracy = (model, data) =>
        data.points.reduce((right, p) => right + ((forward(model, p.x, p.y)[SIZES.length - 1][0] > 0.5) === (p.label === 1) ? 1 : 0), 0) / POINTS;

    // ------------------------------------------------------------------
    // The run in progress.
    // ------------------------------------------------------------------
    const GRID = 30; // the decision surface is sampled on a GRID x GRID lattice

    // The network's answer over the whole input square: what it has learned so far.
    const surfaceOf = (model) => {
        const out = new Float64Array(GRID * GRID);
        for (let j = 0; j < GRID; j++)
            for (let i = 0; i < GRID; i++)
                out[j * GRID + i] = forward(model, -1 + 2 * (i + 0.5) / GRID, 1 - 2 * (j + 0.5) / GRID)[SIZES.length - 1][0];
        return out;
    };

    const weightsOf = (model) => model.map((layer) => Float64Array.from(layer.w));

    // Brings the run to the given step of the given cycle and records what the
    // drawing needs: weights and surface before and after the step, the
    // gradients it used, and the activations for one sample point.
    let run = null;
    const seek = (cycle, step) => {
        if (run && run.cycle === cycle && run.shown === step) return run;

        if (!run || run.cycle !== cycle || run.done > step) {
            run = { cycle, done: 0, shown: -1, data: makeData(cycle), model: makeModel(cycle), losses: [] };
            run.surfaceAfter = null;
        }
        // Catch up silently to the state just before this step.
        const caughtUp = run.done === step && run.surfaceAfter;
        while (run.done < step) run.losses.push(trainStep(run.model, run.data, run.done++).loss);

        run.before = weightsOf(run.model);
        run.surfaceBefore = caughtUp ? run.surfaceAfter : surfaceOf(run.model);
        run.sample = run.data.points[step % POINTS];
        run.acts = forward(run.model, run.sample.x, run.sample.y);

        if (step < STEPS) {
            const result = trainStep(run.model, run.data, run.done++);
            run.losses.push(result.loss);
            run.grads = result.grads;
            run.after = weightsOf(run.model);
            run.surfaceAfter = surfaceOf(run.model);
        } else { // training is over: nothing changes any more
            run.grads = null;
            run.after = run.before;
            run.surfaceAfter = run.surfaceBefore;
        }
        run.accuracy = accuracy(run.model, run.data);
        run.shown = step;
        return run;
    };

    // ------------------------------------------------------------------
    // Drawing.
    // ------------------------------------------------------------------
    // Layout in cells, left to right. Weight grids have one row per unit.
    const H = SIZES[1];
    const parts = [
        { key: 'surface', label: 'data and what the network has learned', cols: GRID, rows: GRID },
        { gap: 3 },
        { key: 'w0', label: 'weights 1', cols: 3, rows: H },
        { gap: 1 },
        { key: 'a1', label: '', cols: 1, rows: H },
        { gap: 2 },
        { key: 'w1', label: 'weights 2', cols: H, rows: H },
        { gap: 1 },
        { key: 'a2', label: '', cols: 1, rows: H },
        { gap: 2 },
        { key: 'w2', label: 'w3', cols: 1, rows: H },
        { gap: 1 },
        { key: 'a3', label: 'out', cols: 1, rows: 1 },
        { gap: 3 },
        { key: 'loss', label: 'loss', cols: GRID, rows: GRID },
    ];
    const wide = parts.reduce((sum, p) => sum + (p.gap || p.cols), 0);
    const box = {};

    let width = 0, height = 0, cell = 0, top = 0, colours = ['#888', '#888'], ink = '#888', lastDraw = 0;

    const resize = () => {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        width = innerWidth;
        height = innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        cell = Math.max(2, Math.min(width * 0.92 / wide, height * 0.62 / GRID));
        top = (height - GRID * cell) / 2;
        let x = (width - wide * cell) / 2;
        for (const p of parts) {
            if (p.gap) { x += p.gap * cell; continue; }
            box[p.key] = { x, y: top + (GRID - p.rows) / 2 * cell, cols: p.cols, rows: p.rows, label: p.label };
            x += p.cols * cell;
        }
    };

    // The palette's two colours and the text colour, as resolved by the stylesheet.
    const readColours = () => {
        const style = getComputedStyle(root);
        colours = [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--counter').trim()];
        ink = style.getPropertyValue('--fg').trim();
    };

    const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    const pulse = (f, from, to) => f <= from || f >= to ? 0 : Math.sin((f - from) / (to - from) * Math.PI);

    // One cell: colour says the sign, brightness says the size.
    const light = (b, col, row, value, strength) => {
        ctx.globalAlpha = 0.05 + 0.95 * Math.min(1, strength);
        ctx.fillStyle = colours[value >= 0 ? 0 : 1];
        ctx.fillRect(b.x + col * cell, b.y + row * cell, Math.max(1, cell - 1), Math.max(1, cell - 1));
    };

    const outline = (b, strength) => {
        if (strength <= 0) return;
        ctx.globalAlpha = strength;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(b.x - 3, b.y - 3, b.cols * cell + 5, b.rows * cell + 5);
    };

    const draw = () => {
        const t = Date.now() / 1000; // UTC seconds: the only input
        const cycle = Math.floor(t / PERIOD);
        const elapsed = t - cycle * PERIOD;
        const step = Math.min(STEPS, Math.floor(elapsed / TICK));
        const training = step < STEPS;
        // 0..1 through the current step: forward pass, then backward pass, then the update.
        const f = !training ? 0 : still.matches ? 0.999 : elapsed / TICK - step;
        const r = seek(cycle, step);

        ctx.clearRect(0, 0, width, height);

        // --- What the network has learned: its answer over the whole plane.
        const s = box.surface;
        const settle = smooth((f - 0.85) / 0.15);
        for (let j = 0; j < GRID; j++) {
            for (let i = 0; i < GRID; i++) {
                const k = j * GRID + i;
                const p = r.surfaceBefore[k] + (r.surfaceAfter[k] - r.surfaceBefore[k]) * settle;
                light(s, i, j, p - 0.5, Math.abs(p - 0.5) * 2);
            }
        }
        // The training points: filled for one class, hollow for the other.
        ctx.fillStyle = ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        const dot = Math.max(1, cell * 0.2);
        for (const p of r.data.points) {
            const px = s.x + (p.x + 1) / 2 * GRID * cell, py = s.y + (1 - p.y) / 2 * GRID * cell;
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.arc(px, py, dot, 0, Math.PI * 2);
            if (p.label) ctx.fill(); else ctx.stroke();
        }
        // The point going through the network on this step.
        const seen = pulse(f, 0, 0.45);
        if (seen > 0) {
            ctx.globalAlpha = seen;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(s.x + (r.sample.x + 1) / 2 * GRID * cell, s.y + (1 - r.sample.y) / 2 * GRID * cell, dot + 3 + 6 * f, 0, Math.PI * 2);
            ctx.stroke();
        }

        // --- Weights. Each layer changes at the moment backpropagation reaches it.
        const reach = [[0.7, 0.95], [0.55, 0.8], [0.45, 0.65]]; // when the gradient passes each layer
        r.before.forEach((before, l) => {
            const b = box[`w${l}`], after = r.after[l];
            const inputs = SIZES[l], stride = inputs + 1;
            const shownCols = l === 0 ? stride : inputs; // the first grid also shows the bias column
            const mix = smooth((f - reach[l][1] + 0.1) / 0.1);
            const flash = r.grads ? pulse(f, reach[l][0], reach[l][1]) : 0;

            let biggest = 1e-9, steepest = 1e-9;
            for (let k = 0; k < after.length; k++) biggest = Math.max(biggest, Math.abs(after[k]));
            if (flash > 0) for (let k = 0; k < after.length; k++) steepest = Math.max(steepest, Math.abs(r.grads[l][k]));

            for (let j = 0; j < SIZES[l + 1]; j++) {
                for (let i = 0; i < shownCols; i++) {
                    const k = j * stride + i;
                    const w = before[k] + (after[k] - before[k]) * mix;
                    // The last layer has a single unit, so its weights are drawn as a column.
                    const col = l === 2 ? 0 : i, row = l === 2 ? i : j;
                    light(b, col, row, w, Math.abs(w) / biggest);
                    if (flash > 0) { // the gradient arriving, as a white flare
                        ctx.globalAlpha = flash * Math.min(1, Math.abs(r.grads[l][k]) / steepest);
                        ctx.fillStyle = ink;
                        ctx.fillRect(b.x + col * cell, b.y + row * cell, Math.max(1, cell - 1), Math.max(1, cell - 1));
                    }
                }
            }
            outline(b, flash * 0.8);
        });

        // --- Activations for the sample point, lighting up layer by layer.
        const fade = 1 - smooth((f - 0.92) / 0.08);
        [1, 2, 3].forEach((l) => {
            const b = box[`a${l}`];
            const on = training ? smooth((f - 0.05 - 0.1 * (l - 1)) / 0.12) * fade : 1;
            r.acts[l].forEach((a, j) => {
                const v = l === 3 ? a - 0.5 : a;
                light(b, 0, j, v, (l === 3 ? Math.abs(v) * 2 : Math.abs(v)) * on);
            });
            outline(b, pulse(f, 0.05 + 0.1 * (l - 1), 0.3 + 0.1 * (l - 1)) * 0.6);
        });

        // --- Loss so far in this run.
        const c = box.loss;
        const w = c.cols * cell, h = c.rows * cell;
        const ceiling = Math.max(0.8, r.losses[0] || 0.8);
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        ctx.strokeRect(c.x, c.y, w, h);
        if (r.losses.length > 1) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle = colours[0];
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            r.losses.forEach((loss, k) => {
                const x = c.x + k / STEPS * w, y = c.y + h - Math.min(1, loss / ceiling) * h;
                if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }

        // --- Labels and the status line.
        if (cell >= 8) {
            ctx.font = `${Math.round(Math.min(13, cell * 0.85))}px ui-monospace, Consolas, monospace`;
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
            ctx.fillStyle = ink;
            ctx.globalAlpha = 0.8;
            for (const key in box) if (box[key].label) ctx.fillText(box[key].label, box[key].x, box[key].y - cell * 0.7);

            const loss = r.losses.length ? r.losses[r.losses.length - 1].toFixed(3) : '-';
            const state = training ? `step ${step + 1} of ${STEPS}` : 'trained';
            ctx.fillText(`${r.data.name} · ${state} · loss ${loss} · accuracy ${Math.round(r.accuracy * 100)}%`,
                s.x, s.y + GRID * cell + cell * 1.6);
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

    // With "reduce motion" on: no flashes, just a fresh picture each second.
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
