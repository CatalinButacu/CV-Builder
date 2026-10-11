// Animated background: generative art in the pattern of an artificial neural
// network.
//
// An organic web of neurons, loosely arranged in layers from left to right,
// each wired to a few neurons of the next layer. Every few seconds a wave of
// activity enters on the left and passes through: a share of each layer lights
// up in turn, and sparks run along the connections between the neurons that
// fired. Several waves overlap, in the palette's two colours.
//
// Nothing here is truly random. Which neurons fire in which wave is decided by
// a formula of the wave's number, and UTC time only says which wave we are in
// and how far along it is. Time is the playhead of a fixed, endless score, not
// an input to it. So a refresh, or another visitor on the same screen size,
// picks the pattern up exactly where it was.
(() => {
    const canvas = document.querySelector('.backdrop canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const root = document.documentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const EVERY = 2.6;   // seconds between one wave entering and the next
    const HOP = 0.6;     // seconds for a wave to cross from one layer to the next
    const FIRING = 0.34; // share of a layer that fires in a typical wave
    const FAN = 3;       // connections from each neuron to the next layer
    const FRAME = 1000 / 30;

    const seeded = (seed) => () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // A repeatable value between 0 and 1 for a pair of whole numbers.
    const hash = (a, b) => {
        let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f);
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
        h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    };

    let width = 0, height = 0, layers = 0, neurons = [], synapses = [];
    let colours = ['#888', '#888'], dark = true, lastDraw = 0;

    // Lays the web out for the current window: layers of neurons with a hand-placed
    // look, each wired to nearby neurons of the next layer. Same window, same web.
    const layout = () => {
        const random = seeded(0x51a7e);
        layers = Math.max(3, Math.min(11, Math.round(width / 165)));
        const perLayer = Math.max(8, Math.min(26, Math.round(height / 46)));

        neurons = [];
        for (let layer = 0; layer < layers; layer++) {
            for (let i = 0; i < perLayer; i++) {
                neurons.push({
                    id: neurons.length, layer,
                    homeX: (layer + 0.5 + (random() - 0.5) * 0.62) / layers * width,
                    homeY: (i + 0.5 + (random() - 0.5) * 0.9) / perLayer * height,
                    depth: 0.5 + random() * 0.5, // nearer ones are larger and brighter
                    size: 1.1 + random() * 2.1,
                    swayX: random() * 6.28, swayY: random() * 6.28,
                    paceX: 0.05 + random() * 0.1, paceY: 0.05 + random() * 0.1,
                    x: 0, y: 0, glow: 0, tone: 0,
                });
            }
        }

        synapses = [];
        for (const from of neurons) {
            if (from.layer === layers - 1) continue;
            const ahead = neurons.filter((n) => n.layer === from.layer + 1)
                .sort((p, q) => Math.hypot(p.homeX - from.homeX, p.homeY - from.homeY) - Math.hypot(q.homeX - from.homeX, q.homeY - from.homeY));
            // Mostly the closest ones, sometimes one a little further off.
            const picks = [ahead[0], ahead[1], ahead[2 + Math.floor(random() * 4)]].slice(0, FAN);
            for (const to of picks) if (to) synapses.push({ from, to, bend: (random() - 0.5) * 0.36 });
        }
    };

    const resize = () => {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        width = innerWidth;
        height = innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        layout();
    };

    // The palette's two colours, as currently resolved by the stylesheet.
    const readColours = () => {
        const style = getComputedStyle(root);
        colours = [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--counter').trim()];
        dark = root.dataset.mode === 'dark';
    };

    const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

    // --- The score. Wave number w enters at a fixed moment and fires a fixed set of neurons.
    const enters = (w) => w * EVERY + hash(w, 7) * 0.9;

    // Does this neuron fire in wave w? Firing is denser along a soft band that
    // slants across the layers, a different band for every wave, so each wave
    // traces its own path through the web.
    const fires = (n, w) => {
        const band = 0.5 + 0.5 * Math.sin(n.homeY / height * 5 + hash(w, 3) * 6.28 + n.layer * (hash(w, 5) - 0.5) * 3.6);
        return hash(n.id * 31 + 17, w) < FIRING * (0.4 + 1.2 * band);
    };

    // Brightness of a neuron `since` hops after the wave reached its layer: a quick flash, then a slow fade.
    const flash = (since) => {
        if (since < 0) return 0;
        return since < 0.15 ? since / 0.15 : Math.exp(-(since - 0.15) * 1.7);
    };

    // A point along a synapse, which is drawn as a gentle curve.
    const along = (s, u) => {
        const mx = (s.from.x + s.to.x) / 2 - (s.to.y - s.from.y) * s.bend;
        const my = (s.from.y + s.to.y) / 2 + (s.to.x - s.from.x) * s.bend;
        const v = 1 - u;
        return [v * v * s.from.x + 2 * v * u * mx + u * u * s.to.x, v * v * s.from.y + 2 * v * u * my + u * u * s.to.y, mx, my];
    };

    const trace = (s) => {
        const [, , mx, my] = along(s, 0.5);
        ctx.moveTo(s.from.x, s.from.y);
        ctx.quadraticCurveTo(mx, my, s.to.x, s.to.y);
    };

    // Waves that are still somewhere in the web at time t.
    const wavesAt = (t) => {
        const waves = [];
        const lifetime = layers * HOP + 3;
        for (let w = Math.floor(t / EVERY); enters(w) > t - lifetime; w--) {
            if (enters(w) <= t) waves.push({ w, at: (t - enters(w)) / HOP, tone: ((w % 2) + 2) % 2 });
        }
        return waves;
    };

    // Neurons breathe around their home position, and take their light from the brightest wave.
    const settle = (t, waves) => {
        for (const n of neurons) {
            n.x = n.homeX + Math.sin(t * n.paceX + n.swayX) * 11 * n.depth;
            n.y = n.homeY + Math.cos(t * n.paceY + n.swayY) * 11 * n.depth;
            n.glow = 0;
            for (const wave of waves) {
                const light = fires(n, wave.w) ? flash(wave.at - n.layer) : 0;
                if (light > n.glow) { n.glow = light; n.tone = wave.tone; }
            }
        }
    };

    // The resting web, in one stroke.
    const drawWeb = () => {
        ctx.globalAlpha = 0.085;
        ctx.strokeStyle = colours[0];
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const s of synapses) trace(s);
        ctx.stroke();
    };

    // One spark with its short tail, a fraction u of the way along a connection.
    const drawSpark = (s, u) => {
        for (let tail = 0; tail < 4; tail++) {
            const at = smooth(u) - tail * 0.045;
            if (at <= 0) return;
            const [x, y] = along(s, at);
            ctx.globalAlpha = (1 - tail * 0.24) * s.to.depth;
            ctx.beginPath();
            ctx.arc(x, y, 2.3 - tail * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    // A connection carries a spark when both of its ends fire in the same wave.
    // It lights up as the spark passes, then cools.
    const drawSparks = (wave) => {
        ctx.strokeStyle = ctx.fillStyle = colours[wave.tone];
        ctx.lineWidth = 1.2;
        for (const s of synapses) {
            const u = wave.at - s.from.layer; // 0..1 while the spark is on its way
            if (u <= 0 || u >= 1.7 || !fires(s.from, wave.w) || !fires(s.to, wave.w)) continue;
            const heat = u < 1 ? 0.12 + 0.5 * Math.sin(u * Math.PI) : 0.3 * (1 - (u - 1) / 0.7);
            ctx.globalAlpha = heat * s.to.depth;
            ctx.beginPath();
            trace(s);
            ctx.stroke();
            if (u < 1) drawSpark(s, u);
        }
    };

    // The neurons: a faint dot at rest, a bright core and a halo when firing.
    const drawNeurons = () => {
        for (const n of neurons) {
            ctx.fillStyle = colours[n.glow > 0.02 ? n.tone : n.id % 2];
            if (n.glow > 0.05) {
                ctx.globalAlpha = 0.16 * n.glow * n.depth;
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.size * (3.5 + 5 * n.glow), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = (0.2 + 0.8 * n.glow) * n.depth;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.size * (1 + 0.9 * n.glow), 0, Math.PI * 2);
            ctx.fill();
        }
    };

    const draw = () => {
        const t = Date.now() / 1000; // UTC seconds: the playhead
        const waves = wavesAt(t);
        settle(t, waves);

        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'; // overlapping lights add up
        ctx.lineCap = 'round';
        drawWeb();
        for (const wave of waves) drawSparks(wave);
        drawNeurons();
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
