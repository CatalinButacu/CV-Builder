// Trains the nano-GPT shown in the site's background and records the run.
//
//   node tools/train-nanogpt.js        (from the site/ folder; takes under a minute)
//
// The task is the one from bbycroft.net/llm: the model is shown six letters
// from {A, B, C} and must write them out again in sorted order. It is trained
// here once, with plain backpropagation and Adam written out by hand, and its
// weights are saved at intervals. The site replays those snapshots, so
// visitors watch a real training run without their browser doing the training.
//
// Output, in wwwroot/data/:
//   nanogpt.json   the model's shape and, per snapshot, the step, loss and accuracy
//   nanogpt.bin    every snapshot's weights, one signed byte per weight
const fs = require('node:fs');
const path = require('node:path');
const NanoGPT = require('../wwwroot/js/nanogpt.js');

const VOCAB = ['A', 'B', 'C'];
const LETTERS = 6;                 // letters to sort
const CONTEXT = LETTERS * 2 - 1;   // the six letters, then the first five of the answer
const WIDTH = 16, HEADS = 2, LAYERS = 2, HIDDEN = WIDTH * 4;
const STEPS = 400, BATCH = 32, RATE = 1.5e-3, SNAPSHOTS = 32;

// --- A repeatable random source, so the recorded run is always the same.
let seed = 20261012;
const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());

const zeros = (rows, cols) => Array.from({ length: rows }, () => new Array(cols).fill(0));
const matrix = (rows, cols, scale) => Array.from({ length: rows }, () => Array.from({ length: cols }, () => normal() * scale));

const weights = {
    wte: matrix(VOCAB.length, WIDTH, 0.3),
    wpe: matrix(CONTEXT, WIDTH, 0.3),
    layers: Array.from({ length: LAYERS }, () => ({
        qkv: matrix(WIDTH, WIDTH * 3, 0.25), out: matrix(WIDTH, WIDTH, 0.12),
        fc: matrix(WIDTH, HIDDEN, 0.25), proj: matrix(HIDDEN, WIDTH, 0.08),
    })),
    head: matrix(WIDTH, VOCAB.length, 0.25),
};
// Every weight matrix, in the order they are written to the file.
const tensors = [
    { name: 'wte', m: weights.wte }, { name: 'wpe', m: weights.wpe },
    ...weights.layers.flatMap((layer, l) => ['qkv', 'out', 'fc', 'proj'].map((key) => ({ name: `layer${l}.${key}`, m: layer[key] }))),
    { name: 'head', m: weights.head },
];

// One example: six random letters, then their sorted order. The model reads the
// first eleven tokens and must predict the sorted letters at the last six positions.
const example = () => {
    const letters = Array.from({ length: LETTERS }, () => Math.floor(random() * VOCAB.length));
    const sorted = [...letters].sort((a, b) => a - b);
    return { letters, sorted, tokens: [...letters, ...sorted.slice(0, LETTERS - 1)] };
};

// --- Small matrix helpers for the backward pass.
const { multiply, add, softmax, gelu } = NanoGPT;
// grad += transpose(a) . d
const accumulate = (grad, a, d) => {
    for (let t = 0; t < a.length; t++) for (let k = 0; k < a[t].length; k++) {
        const v = a[t][k];
        if (v !== 0) for (let j = 0; j < d[t].length; j++) grad[k][j] += v * d[t][j];
    }
};
// d . transpose(w)
const backThrough = (d, w) => d.map((row) => w.map((wRow) => { let s = 0; for (let j = 0; j < row.length; j++) s += row[j] * wRow[j]; return s; }));
const norm = (a) => {
    const spread = [];
    const y = a.map((row) => {
        const mean = row.reduce((s, v) => s + v, 0) / row.length;
        const sd = Math.sqrt(row.reduce((s, v) => s + (v - mean) ** 2, 0) / row.length + 1e-5);
        spread.push(sd);
        return row.map((v) => (v - mean) / sd);
    });
    return { y, spread };
};
const normBack = (dy, n) => dy.map((row, t) => {
    const y = n.y[t], size = row.length;
    const m1 = row.reduce((s, v) => s + v, 0) / size, m2 = row.reduce((s, v, c) => s + v * y[c], 0) / size;
    return row.map((v, c) => (v - m1 - y[c] * m2) / n.spread[t]);
});
const geluSlope = (u) => {
    const z = 0.7978845608 * (u + 0.044715 * u ** 3), th = Math.tanh(z);
    return 0.5 * (1 + th) + 0.5 * u * (1 - th * th) * 0.7978845608 * (1 + 3 * 0.044715 * u * u);
};

// Forward and backward for one example. Adds this example's gradient to `grads`
// (same shape as `weights`) and returns its loss.
const backprop = (ex, grads, share) => {
    const T = CONTEXT, headWidth = WIDTH / HEADS, root = Math.sqrt(headWidth);
    let x = ex.tokens.map((token, p) => weights.wte[token].map((v, c) => v + weights.wpe[p][c]));
    const saved = [];
    for (const layer of weights.layers) {
        const n1 = norm(x);
        const qkv = multiply(n1.y, layer.qkv);
        const mixed = zeros(T, WIDTH), shares = [];
        for (let h = 0; h < HEADS; h++) {
            const q0 = h * headWidth, k0 = WIDTH + q0, v0 = 2 * WIDTH + q0;
            shares.push(ex.tokens.map((_, i) => {
                const scores = [];
                for (let j = 0; j <= i; j++) { let dot = 0; for (let c = 0; c < headWidth; c++) dot += qkv[i][q0 + c] * qkv[j][k0 + c]; scores.push(dot / root); }
                const p = softmax(scores);
                for (let j = 0; j <= i; j++) for (let c = 0; c < headWidth; c++) mixed[i][q0 + c] += p[j] * qkv[j][v0 + c];
                return p;
            }));
        }
        const x1 = add(x, multiply(mixed, layer.out));
        const n2 = norm(x1);
        const sums = multiply(n2.y, layer.fc);
        const hidden = sums.map((row) => row.map(gelu));
        const x2 = add(x1, multiply(hidden, layer.proj));
        saved.push({ n1, qkv, mixed, shares, n2, sums, hidden });
        x = x2;
    }
    const nf = norm(x);
    const probabilities = multiply(nf.y, weights.head).map(softmax);

    // Loss: cross-entropy at the six answer positions.
    let loss = 0;
    const dLogits = zeros(T, VOCAB.length);
    for (let n = 0; n < LETTERS; n++) {
        const t = LETTERS - 1 + n, target = ex.sorted[n];
        loss -= Math.log(probabilities[t][target] + 1e-12);
        for (let v = 0; v < VOCAB.length; v++) dLogits[t][v] = (probabilities[t][v] - (v === target ? 1 : 0)) * share;
    }

    // --- Backward, last step first.
    accumulate(grads.head, nf.y, dLogits);
    let dx = normBack(backThrough(dLogits, weights.head), nf);
    for (let l = LAYERS - 1; l >= 0; l--) {
        const layer = weights.layers[l], g = grads.layers[l], s = saved[l];
        // x2 = x1 + hidden . proj
        accumulate(g.proj, s.hidden, dx);
        const dSums = backThrough(dx, layer.proj).map((row, t) => row.map((v, c) => v * geluSlope(s.sums[t][c])));
        accumulate(g.fc, s.n2.y, dSums);
        const dx1 = add(dx, normBack(backThrough(dSums, layer.fc), s.n2));
        // x1 = x + mixed . out
        accumulate(g.out, s.mixed, dx1);
        const dMixed = backThrough(dx1, layer.out);
        const dQkv = zeros(T, WIDTH * 3);
        for (let h = 0; h < HEADS; h++) {
            const q0 = h * headWidth, k0 = WIDTH + q0, v0 = 2 * WIDTH + q0;
            for (let i = 0; i < T; i++) {
                const p = s.shares[h][i];
                const dp = p.map((_, j) => { let d = 0; for (let c = 0; c < headWidth; c++) d += dMixed[i][q0 + c] * s.qkv[j][v0 + c]; return d; });
                const mean = dp.reduce((sum, v, j) => sum + v * p[j], 0);
                for (let j = 0; j <= i; j++) {
                    const dScore = p[j] * (dp[j] - mean) / root;
                    for (let c = 0; c < headWidth; c++) {
                        dQkv[j][v0 + c] += p[j] * dMixed[i][q0 + c];
                        dQkv[i][q0 + c] += dScore * s.qkv[j][k0 + c];
                        dQkv[j][k0 + c] += dScore * s.qkv[i][q0 + c];
                    }
                }
            }
        }
        accumulate(g.qkv, s.n1.y, dQkv);
        dx = add(dx1, normBack(backThrough(dQkv, layer.qkv), s.n1));
    }
    ex.tokens.forEach((token, p) => { for (let c = 0; c < WIDTH; c++) { grads.wte[token][c] += dx[p][c]; grads.wpe[p][c] += dx[p][c]; } });
    return loss / LETTERS;
};

const like = (make) => ({
    wte: make(weights.wte), wpe: make(weights.wpe),
    layers: weights.layers.map((layer) => ({ qkv: make(layer.qkv), out: make(layer.out), fc: make(layer.fc), proj: make(layer.proj) })),
    head: make(weights.head),
});
const blank = () => like((m) => zeros(m.length, m[0].length));
const listOf = (w) => [w.wte, w.wpe, ...w.layers.flatMap((layer) => [layer.qkv, layer.out, layer.fc, layer.proj]), w.head];

// The model writing its own answer, one letter at a time, as it would be used.
const write = (letters) => {
    const tokens = [...letters];
    for (let n = 0; n < LETTERS; n++) {
        const padded = [...tokens];
        while (padded.length < CONTEXT) padded.push(0);
        tokens.push(NanoGPT.forward(weights, padded, HEADS).prediction[tokens.length - 1]);
    }
    return tokens.slice(LETTERS);
};
const testSet = Array.from({ length: 300 }, example);
const accuracy = () => testSet.filter((ex) => write(ex.letters).join() === ex.sorted.join()).length / testSet.length;

// --- Check the hand-written gradient against a numerical one before trusting it.
{
    const ex = example(), grads = blank();
    backprop(ex, grads, 1 / LETTERS);
    const lossOf = () => backprop(ex, blank(), 1 / LETTERS);
    let worst = 0;
    for (const [m, g] of [[weights.layers[0].qkv, grads.layers[0].qkv], [weights.layers[1].fc, grads.layers[1].fc], [weights.wpe, grads.wpe], [weights.layers[0].out, grads.layers[0].out]]) {
        for (let n = 0; n < 6; n++) {
            const r = Math.floor(random() * m.length), c = Math.floor(random() * m[0].length), keep = m[r][c], h = 1e-5;
            m[r][c] = keep + h; const up = lossOf();
            m[r][c] = keep - h; const down = lossOf();
            m[r][c] = keep;
            worst = Math.max(worst, Math.abs((up - down) / (2 * h) - g[r][c]));
        }
    }
    console.log(`gradient check: largest difference from the numerical gradient ${worst.toExponential(2)}`);
    if (worst > 1e-5) throw new Error('the backward pass is wrong');
}

// --- Train, taking snapshots more often early on, when the weights change fastest.
const at = [...new Set(Array.from({ length: SNAPSHOTS }, (_, i) => Math.round(STEPS * (i / (SNAPSHOTS - 1)) ** 1.5)))];
const snapshots = [];
const bytes = [];
const record = (step, loss) => {
    const scales = [];
    for (const { m } of tensors) {
        let biggest = 1e-9;
        for (const row of m) for (const v of row) biggest = Math.max(biggest, Math.abs(v));
        scales.push(Number(biggest.toPrecision(6)));
        for (const row of m) for (const v of row) bytes.push(Math.round(v / biggest * 127));
    }
    const acc = accuracy();
    snapshots.push({ step, loss: Number(loss.toFixed(4)), accuracy: Number(acc.toFixed(3)), scales });
    console.log(`step ${String(step).padStart(4)}  loss ${loss.toFixed(3)}  sorted correctly ${(acc * 100).toFixed(0)}%`);
};

const m1 = blank(), m2 = blank();
let smoothed = Math.log(VOCAB.length);
const started = Date.now();
for (let step = 0; step <= STEPS; step++) {
    if (at.includes(step)) record(step, smoothed);
    if (step === STEPS) break;
    const grads = blank();
    let loss = 0;
    for (let b = 0; b < BATCH; b++) loss += backprop(example(), grads, 1 / (BATCH * LETTERS));
    smoothed = step === 0 ? loss / BATCH : 0.95 * smoothed + 0.05 * loss / BATCH;
    // Adam.
    const w = listOf(weights), g = listOf(grads), a = listOf(m1), v = listOf(m2), n = step + 1;
    for (let k = 0; k < w.length; k++) for (let r = 0; r < w[k].length; r++) for (let c = 0; c < w[k][r].length; c++) {
        const d = g[k][r][c];
        a[k][r][c] = 0.9 * a[k][r][c] + 0.1 * d;
        v[k][r][c] = 0.999 * v[k][r][c] + 0.001 * d * d;
        w[k][r][c] -= RATE * (a[k][r][c] / (1 - 0.9 ** n)) / (Math.sqrt(v[k][r][c] / (1 - 0.999 ** n)) + 1e-8);
    }
}
console.log(`trained in ${((Date.now() - started) / 1000).toFixed(0)}s`);

const folder = path.join(__dirname, '..', 'wwwroot', 'data');
fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(path.join(folder, 'nanogpt.bin'), Buffer.from(Int8Array.from(bytes).buffer));
fs.writeFileSync(path.join(folder, 'nanogpt.json'), JSON.stringify({
    vocab: VOCAB, letters: LETTERS, context: CONTEXT, width: WIDTH, heads: HEADS, layers: LAYERS, hidden: HIDDEN,
    tensors: tensors.map(({ name, m }) => ({ name, rows: m.length, cols: m[0].length })),
    snapshots,
}));
const count = tensors.reduce((sum, { m }) => sum + m.length * m[0].length, 0);
console.log(`${count} weights x ${snapshots.length} snapshots = ${bytes.length} bytes written to ${folder}`);
