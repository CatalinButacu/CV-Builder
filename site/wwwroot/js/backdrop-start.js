// Starts the animated background drawn by js/backdrop.js.
//
// The drawing is handed to a worker together with the canvas, so it runs on a
// thread of its own and can never hold up scrolling, typing or the first paint.
// This script only passes on what the worker cannot see for itself: the window
// size, the palette's colours and the visitor's motion setting. Browsers that
// cannot draw in a worker run the same scene on the page instead.
(() => {
    const canvas = document.querySelector('.backdrop canvas');
    if (!canvas) return;

    const scene = 'js/backdrop.js';
    const root = document.documentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    // A dim backdrop does not need every pixel of a dense screen.
    const size = () => [innerWidth, innerHeight, Math.min(devicePixelRatio || 1, 1.5)];
    // The palette's two colours, as currently resolved by the stylesheet.
    const look = () => {
        const style = getComputedStyle(root);
        return {
            colours: [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--counter').trim()],
            dark: root.dataset.mode === 'dark',
        };
    };

    // `tell` delivers a message to the scene, wherever it runs.
    const run = (tell, first = {}, transfer = []) => {
        tell({ ...first, size: size(), ...look(), still: still.matches }, transfer);
        addEventListener('resize', () => tell({ size: size() }));
        still.addEventListener('change', () => tell({ still: still.matches }));
        new MutationObserver(() => tell(look()))
            .observe(root, { attributes: true, attributeFilter: ['data-mode', 'data-palette'] });
    };

    const start = () => {
        if (window.Worker && canvas.transferControlToOffscreen) {
            const worker = new Worker(scene);
            const offscreen = canvas.transferControlToOffscreen();
            run((message, transfer = []) => worker.postMessage(message, transfer), { canvas: offscreen }, [offscreen]);
            return;
        }
        const script = document.createElement('script');
        script.src = scene;
        script.onload = () => run(backdropScene(canvas));
        document.head.append(script);
    };

    // Start only once the page has loaded and the browser has a quiet moment,
    // so the background never competes with showing the content.
    const whenIdle = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 600));
    if (document.readyState === 'complete') whenIdle();
    else addEventListener('load', whenIdle, { once: true });
})();
