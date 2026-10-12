// nano-GPT: the forward pass of a small GPT, written out step by step.
//
// Used in two places: the background animation (js/backdrop.js) runs it in the
// browser, and tools/train-nanogpt.js checks its own training code against it.
//
// The model follows Karpathy's nanoGPT, without biases or learned LayerNorm
// parameters to keep it small:
//
//   x = wte[token] + wpe[position]
//   for each layer:
//       x = x + Attention(LayerNorm(x))      causal: a token only sees earlier ones
//       x = x + MLP(LayerNorm(x))            MLP(a) = GELU(a . Wfc) . Wproj
//   probabilities = softmax(LayerNorm(x) . Whead)
//
// A matrix is an array of rows. Weights:
//   { wte, wpe, layers: [{ qkv, out, fc, proj }], head }
(function (global) {
    const multiply = (a, b) => a.map((row) => {
        const out = new Array(b[0].length).fill(0);
        for (let k = 0; k < row.length; k++) {
            const v = row[k], other = b[k];
            if (v !== 0) for (let j = 0; j < out.length; j++) out[j] += v * other[j];
        }
        return out;
    });
    const add = (a, b) => a.map((row, i) => row.map((v, j) => v + b[i][j]));
    const layerNorm = (a) => a.map((row) => {
        const mean = row.reduce((s, v) => s + v, 0) / row.length;
        const spread = Math.sqrt(row.reduce((s, v) => s + (v - mean) ** 2, 0) / row.length + 1e-5);
        return row.map((v) => (v - mean) / spread);
    });
    const softmax = (row) => {
        const top = Math.max(...row);
        const e = row.map((v) => Math.exp(v - top));
        const sum = e.reduce((s, v) => s + v, 0);
        return e.map((v) => v / sum);
    };
    const gelu = (v) => 0.5 * v * (1 + Math.tanh(0.7978845608 * (v + 0.044715 * v ** 3)));

    // Runs the model on a list of token ids. Returns every intermediate result,
    // so each step can be drawn.
    const forward = (weights, tokens, heads) => {
        const width = weights.wte[0].length, headWidth = width / heads;
        let x = tokens.map((token, position) => weights.wte[token].map((v, c) => v + weights.wpe[position][c]));
        const result = { embedded: x, layers: [] };

        for (const layer of weights.layers) {
            // --- Self-attention.
            const qkv = multiply(layerNorm(x), layer.qkv); // each row: query, key and value side by side
            const mixed = tokens.map(() => new Array(width).fill(0));
            const attention = [];
            for (let h = 0; h < heads; h++) {
                const q0 = h * headWidth, k0 = width + q0, v0 = 2 * width + q0;
                const head = tokens.map((_, i) => {
                    // Token i scores every token up to and including itself.
                    const scores = [];
                    for (let j = 0; j <= i; j++) {
                        let dot = 0;
                        for (let c = 0; c < headWidth; c++) dot += qkv[i][q0 + c] * qkv[j][k0 + c];
                        scores.push(dot / Math.sqrt(headWidth));
                    }
                    const share = softmax(scores);
                    for (let j = 0; j <= i; j++) for (let c = 0; c < headWidth; c++) mixed[i][q0 + c] += share[j] * qkv[j][v0 + c];
                    while (share.length < tokens.length) share.push(0); // later tokens are hidden
                    return share;
                });
                attention.push(head);
            }
            const afterAttention = add(x, multiply(mixed, layer.out));

            // --- Feed-forward.
            const hidden = multiply(layerNorm(afterAttention), layer.fc).map((row) => row.map(gelu));
            x = add(afterAttention, multiply(hidden, layer.proj));
            result.layers.push({ attention, afterAttention, hidden, out: x });
        }

        result.logits = multiply(layerNorm(x), weights.head);
        result.probabilities = result.logits.map(softmax);
        result.prediction = result.probabilities.map((row) => row.indexOf(Math.max(...row)));
        return result;
    };

    const api = { forward, multiply, add, layerNorm, softmax, gelu };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else global.NanoGPT = api;
})(typeof window !== 'undefined' ? window : globalThis);
