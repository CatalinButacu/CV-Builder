// Animated background: a swarm of linked nodes drawn on a canvas.
//
// Every position is a pure function of UTC time (Date.now()), never of when
// the page loaded. A refresh, or another visitor anywhere, sees the same swarm
// at the same moment.
//
// Chaos: each node wanders on its own path, a sum of slow sine waves with
// unrelated speeds, so the swarm never visibly repeats.
// Order: at the top of every UTC minute the nodes pull together into a shape
// (ring, spiral, grid, wave, in turn), hold it for a moment, then scatter.
(() => {
    const canvas = document.querySelector('.backdrop canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const root = document.documentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const MAX_NODES = 90;
    const LINK = 150;        // px: nodes closer than this are joined
    const GATHER = 9;        // seconds either side of the minute spent forming up
    const FRAME = 1000 / 30; // draw at most 30 times a second

    // Fixed seed: every visitor gets the same swarm.
    const random = (() => {
        let a = 0x5eed1234;
        return () => {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    })();

    const between = (low, high) => low + random() * (high - low);
    const wave = () => ({ speed: between(0.05, 0.26) * (random() < 0.5 ? -1 : 1), phase: between(0, Math.PI * 2) });

    const nodes = Array.from({ length: MAX_NODES }, (_, index) => ({
        index,
        homeX: random(),
        homeY: random(),
        x1: wave(), x2: wave(), y1: wave(), y2: wave(),
        size: between(1.4, 3.4),
        ring: random() < 0.14,
    }));

    let width = 0, height = 0, count = 0, colours = ['#888', '#888'], lastDraw = 0;

    const resize = () => {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        width = innerWidth;
        height = innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        count = Math.max(28, Math.min(MAX_NODES, Math.round(width * height / 16000)));
    };

    // The palette's two colours, as currently resolved by the stylesheet.
    const readColours = () => {
        const style = getComputedStyle(root);
        colours = [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--counter').trim()];
    };

    // Where node i sits in formation number `shape`, as fractions of the viewport.
    const formation = (shape, i, n) => {
        const f = i / n;
        switch (((shape % 4) + 4) % 4) {
            case 0: { // ring
                const angle = f * Math.PI * 2;
                return [0.5 + 0.3 * Math.cos(angle) * height / width, 0.5 + 0.3 * Math.sin(angle)];
            }
            case 1: { // spiral
                const angle = f * Math.PI * 6;
                const radius = 0.06 + 0.32 * f;
                return [0.5 + radius * Math.cos(angle) * height / width, 0.5 + radius * Math.sin(angle)];
            }
            case 2: { // grid
                const columns = Math.ceil(Math.sqrt(n * width / height));
                const rows = Math.ceil(n / columns);
                return [(i % columns + 0.5) / columns, (Math.floor(i / columns) + 0.5) / rows];
            }
            default: // wave
                return [0.04 + 0.92 * f, 0.5 + 0.22 * Math.sin(f * Math.PI * 4)];
        }
    };

    const smooth = (x) => x * x * (3 - 2 * x);

    // Reflect a coordinate back into 0..1, so the swarm stays on screen.
    const fold = (v) => {
        const r = ((v % 2) + 2) % 2;
        return r <= 1 ? r : 2 - r;
    };

    const draw = () => {
        const t = Date.now() / 1000; // UTC seconds: the only input to the motion

        // 0 while wandering, 1 exactly on the minute.
        const second = t % 60;
        const toMinute = Math.min(second, 60 - second);
        const order = toMinute < GATHER ? smooth(1 - toMinute / GATHER) : 0;
        const shape = Math.round(t / 60);

        const points = [];
        for (let i = 0; i < count; i++) {
            const node = nodes[i];
            let x = node.homeX + 0.2 * Math.sin(t * node.x1.speed + node.x1.phase) + 0.09 * Math.sin(t * node.x2.speed * 2.3 + node.x2.phase);
            let y = node.homeY + 0.2 * Math.sin(t * node.y1.speed + node.y1.phase) + 0.09 * Math.sin(t * node.y2.speed * 2.3 + node.y2.phase);
            x = fold(x);
            y = fold(y);

            if (order > 0) {
                const [fx, fy] = formation(shape, i, count);
                x += (fx - x) * order;
                y += (fy - y) * order;
            }
            points.push([x * width, y * height, node]);
        }

        ctx.clearRect(0, 0, width, height);

        ctx.lineWidth = 1;
        for (let i = 0; i < count; i++) {
            for (let j = i + 1; j < count; j++) {
                const dx = points[i][0] - points[j][0];
                const dy = points[i][1] - points[j][1];
                const distance = Math.hypot(dx, dy);
                if (distance > LINK) continue;
                ctx.globalAlpha = 0.55 * (1 - distance / LINK);
                ctx.strokeStyle = colours[(i + j) % 2];
                ctx.beginPath();
                ctx.moveTo(points[i][0], points[i][1]);
                ctx.lineTo(points[j][0], points[j][1]);
                ctx.stroke();
            }
        }

        ctx.globalAlpha = 1;
        for (const [x, y, node] of points) {
            ctx.fillStyle = ctx.strokeStyle = colours[node.index % 2];
            ctx.beginPath();
            ctx.arc(x, y, node.size, 0, Math.PI * 2);
            ctx.fill();
            if (node.ring) {
                ctx.beginPath();
                ctx.arc(x, y, node.size + 5, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    };

    const loop = (now) => {
        if (still.matches) return;
        requestAnimationFrame(loop);
        if (now - lastDraw < FRAME) return;
        lastDraw = now;
        draw();
    };

    // With "reduce motion" on: one still frame, redrawn only when something changes.
    const start = () => {
        draw();
        if (!still.matches) requestAnimationFrame(loop);
    };

    addEventListener('resize', () => { resize(); draw(); });
    still.addEventListener('change', start);
    new MutationObserver(() => { readColours(); draw(); })
        .observe(root, { attributes: true, attributeFilter: ['data-mode', 'data-palette'] });

    resize();
    readColours();
    start();
})();
