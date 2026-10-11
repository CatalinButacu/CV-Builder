// Animated background: a small spiking neural network drawn on a canvas.
//
// Everything on screen is a pure function of UTC time (Date.now()), never of
// when the page loaded. A refresh, or another visitor anywhere, sees the same
// network in the same state at the same moment.
//
// The network: 180 neurons in six layers. Each neuron listens to four neurons
// of the layer before it, a quarter of those connections being inhibitory.
// Time advances in ticks. A neuron fires when the spikes that reached it over
// the last two ticks, the older ones leaking away, add up past a threshold.
// The first layer fires on its own in slow rhythmic waves. A spike travels
// along its connection for one tick, drawn as a moving dot.
//
// Chaos: between formations the neurons drift apart, each on its own path.
// Order: every two UTC minutes they assemble, alternately into the layered
// architecture (where the spikes can be watched flowing left to right) and
// into a ring, spiral or grid, hold the shape, then drift apart again.
(() => {
    const canvas = document.querySelector('.backdrop canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const root = document.documentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    // --- Network. The firing constants were tuned together so that every
    // layer settles at roughly one neuron in nine firing per tick.
    const LAYERS = [20, 34, 38, 34, 30, 24];
    const FAN_IN = 4;
    const MEMORY = 2;       // ticks of incoming spikes a neuron still feels
    const LEAK = 0.6;       // how much of the older tick is left
    const INHIBIT = 0.25;   // share of connections that hold the target back
    const THRESHOLD = 1.3;
    const INPUT_RATE = 0.16;
    const NOISE = 0.012;    // chance of firing with no cause at all

    // --- Timing, all in seconds of UTC time.
    const TICK = 0.8;       // one step of the network
    const PERIOD = 120;     // a formation every two minutes
    const HOLD = 7;         // either side of the mark spent in formation
    const GATHER = 16;      // spent travelling to and from it

    // --- Drawing.
    const NEAR = 105;       // px: drifting neurons this close are joined
    const FRAME = 1000 / 30;

    const seeded = (seed) => () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // Repeatable "coin toss" for neuron a at tick b.
    const hash = (a, b) => {
        let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f);
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
        h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    };

    const start = [];
    const total = LAYERS.reduce((sum, size, layer) => (start[layer] = sum, sum + size), 0);

    // Fixed seeds: every visitor gets the same wiring and the same wandering.
    const wire = seeded(0x5eed1234);
    const inputs = LAYERS.map((size, layer) => Array.from({ length: size }, (_, i) => {
        if (layer === 0) return [];
        const before = LAYERS[layer - 1];
        const centre = (i + 0.5) / size * before;
        // Each neuron listens to a few neighbours roughly level with it.
        return Array.from({ length: FAN_IN }, () => ({
            from: Math.max(0, Math.min(before - 1, Math.round(centre + (wire() - 0.5) * 9))),
            weight: 0.5 + wire() * 0.5,
            inhibitory: wire() < INHIBIT,
        }));
    }));

    const random = seeded(0xc0ffee);
    const between = (low, high) => low + random() * (high - low);
    const wave = () => ({ speed: between(0.02, 0.1) * (random() < 0.5 ? -1 : 1), phase: between(0, Math.PI * 2) });

    const neurons = [];
    LAYERS.forEach((size, layer) => {
        for (let i = 0; i < size; i++) {
            neurons.push({
                id: start[layer] + i, layer, i,
                homeX: random(), homeY: random(),
                x1: wave(), x2: wave(), y1: wave(), y2: wave(),
                size: between(1.5, 3),
                x: 0, y: 0, shown: true,
            });
        }
    });

    const synapses = [];
    inputs.forEach((layer, l) => layer.forEach((list, i) => list.forEach((s) => {
        synapses.push({ pre: neurons[start[l - 1] + s.from], post: neurons[start[l] + i], inhibitory: s.inhibitory });
    })));

    // Which neurons of `layer` fire at tick k. Depends only on k: the first
    // layer on a coin toss, each later layer on the layer before it.
    const memo = new Map();
    const fired = (layer, k) => {
        const key = k * 8 + layer;
        let out = memo.get(key);
        if (out) return out;

        out = new Uint8Array(LAYERS[layer]);
        for (let i = 0; i < LAYERS[layer]; i++) {
            const id = start[layer] + i;
            if (layer === 0) {
                const rhythm = 0.5 + 0.5 * Math.sin(k / 9 + i * 0.7);
                out[i] = hash(id, k) < INPUT_RATE * (0.4 + 1.2 * rhythm) ? 1 : 0;
                continue;
            }
            let potential = 0;
            for (let age = 1, gain = 1; age <= MEMORY; age++, gain *= LEAK) {
                const before = fired(layer - 1, k - age);
                for (const s of inputs[layer][i]) potential += gain * (s.inhibitory ? -1.2 : 1) * s.weight * before[s.from];
            }
            out[i] = potential >= THRESHOLD || hash(id, k) < NOISE ? 1 : 0;
        }
        if (memo.size > 600) memo.clear();
        memo.set(key, out);
        return out;
    };

    let width = 0, height = 0, reach = 0, colours = ['#888', '#888'], lastDraw = 0;

    const resize = () => {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        width = innerWidth;
        height = innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        // Connections longer than this are not drawn. Wide enough to span the
        // gap between two columns of the layered formation.
        reach = Math.max(270, width * 0.3);

        // Small screens show every second or third neuron of each layer.
        const wanted = Math.max(45, Math.min(total, Math.round(width * height / 5500)));
        const step = Math.ceil(total / wanted);
        for (const n of neurons) n.shown = n.i % step === 0;
    };

    // The palette's two colours, as currently resolved by the stylesheet.
    const readColours = () => {
        const style = getComputedStyle(root);
        colours = [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--counter').trim()];
    };

    // Where a neuron sits in formation number `p`, as fractions of the viewport.
    const formation = (p, n) => {
        const f = n.id / total;
        const squash = height / width; // keeps circles round
        if (p % 2 === 0) { // the architecture: one column per layer
            return [0.07 + 0.86 * n.layer / (LAYERS.length - 1), 0.1 + 0.8 * (n.i + 0.5) / LAYERS[n.layer]];
        }
        switch (((p - 1) / 2 % 3 + 3) % 3) {
            case 0: { // ring
                const angle = f * Math.PI * 2;
                return [0.5 + 0.34 * Math.cos(angle) * squash, 0.5 + 0.34 * Math.sin(angle)];
            }
            case 1: { // spiral
                const angle = f * Math.PI * 8;
                const radius = 0.05 + 0.36 * f;
                return [0.5 + radius * Math.cos(angle) * squash, 0.5 + radius * Math.sin(angle)];
            }
            default: { // grid
                const columns = Math.ceil(Math.sqrt(total / squash));
                const rows = Math.ceil(total / columns);
                return [(n.id % columns + 0.5) / columns, (Math.floor(n.id / columns) + 0.5) / rows];
            }
        }
    };

    const smooth = (x) => x * x * (3 - 2 * x);

    // Reflect a coordinate back into 0..1, so the neurons stay on screen.
    const fold = (v) => {
        const r = ((v % 2) + 2) % 2;
        return r <= 1 ? r : 2 - r;
    };

    const draw = () => {
        const t = Date.now() / 1000; // UTC seconds: the only input

        // 0 while drifting, 1 while holding a formation.
        const into = t % PERIOD;
        const away = Math.min(into, PERIOD - into);
        const order = away < HOLD ? 1 : away < HOLD + GATHER ? smooth(1 - (away - HOLD) / GATHER) : 0;
        const shape = Math.round(t / PERIOD);

        for (const n of neurons) {
            let x = fold(n.homeX + 0.2 * Math.sin(t * n.x1.speed + n.x1.phase) + 0.09 * Math.sin(t * n.x2.speed * 2.3 + n.x2.phase));
            let y = fold(n.homeY + 0.2 * Math.sin(t * n.y1.speed + n.y1.phase) + 0.09 * Math.sin(t * n.y2.speed * 2.3 + n.y2.phase));
            if (order > 0) {
                const [fx, fy] = formation(shape, n);
                x += (fx - x) * order;
                y += (fy - y) * order;
            }
            n.x = x * width;
            n.y = y * height;
        }

        const k = Math.floor(t / TICK);
        const progress = t / TICK - k; // 0..1 through the current tick
        const firing = LAYERS.map((_, layer) => fired(layer, k));

        ctx.clearRect(0, 0, width, height);
        ctx.lineWidth = 1;

        // Loose links between neurons that happen to be near, fading out as order sets in.
        if (order < 1) {
            const shown = neurons.filter((n) => n.shown);
            for (let a = 0; a < shown.length; a++) {
                for (let b = a + 1; b < shown.length; b++) {
                    const distance = Math.hypot(shown[a].x - shown[b].x, shown[a].y - shown[b].y);
                    if (distance > NEAR) continue;
                    ctx.globalAlpha = 0.4 * (1 - distance / NEAR) * (1 - order);
                    ctx.strokeStyle = colours[(a + b) % 2];
                    ctx.beginPath();
                    ctx.moveTo(shown[a].x, shown[a].y);
                    ctx.lineTo(shown[b].x, shown[b].y);
                    ctx.stroke();
                }
            }
        }

        // The real connections, and the spikes travelling along them.
        for (const s of synapses) {
            if (!s.pre.shown || !s.post.shown) continue;
            const distance = Math.hypot(s.pre.x - s.post.x, s.pre.y - s.post.y);
            if (distance > reach) continue;
            const near = 1 - distance / reach;
            const colour = colours[s.inhibitory ? 1 : 0];

            ctx.globalAlpha = (0.35 + 0.65 * near) * (0.1 + 0.4 * order);
            ctx.strokeStyle = colour;
            ctx.beginPath();
            ctx.moveTo(s.pre.x, s.pre.y);
            ctx.lineTo(s.post.x, s.post.y);
            ctx.stroke();

            if (firing[s.pre.layer][s.pre.i]) {
                ctx.globalAlpha = Math.min(1, 0.35 + near);
                ctx.fillStyle = colour;
                ctx.beginPath();
                ctx.arc(s.pre.x + (s.post.x - s.pre.x) * progress, s.pre.y + (s.post.y - s.pre.y) * progress, 2.1, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // The neurons; one that fired this tick flashes and gives off a ring.
        for (const n of neurons) {
            if (!n.shown) continue;
            const colour = colours[n.id % 2];
            const flash = firing[n.layer][n.i] ? 1 - progress : 0;

            ctx.globalAlpha = 0.75 + 0.25 * flash;
            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.size + 2.6 * flash, 0, Math.PI * 2);
            ctx.fill();

            if (flash > 0) {
                ctx.globalAlpha = 0.7 * flash;
                ctx.strokeStyle = colour;
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.size + 3 + 11 * progress, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    };

    const loop = (now) => {
        if (still.matches) return;
        requestAnimationFrame(loop);
        if (now - lastDraw < FRAME) return;
        lastDraw = now;
        draw();
    };

    // With "reduce motion" on: one still frame, redrawn only when something changes.
    const begin = () => {
        draw();
        if (!still.matches) requestAnimationFrame(loop);
    };

    addEventListener('resize', () => { resize(); draw(); });
    still.addEventListener('change', begin);
    new MutationObserver(() => { readColours(); draw(); })
        .observe(root, { attributes: true, attributeFilter: ['data-mode', 'data-palette'] });

    resize();
    readColours();
    begin();
})();
