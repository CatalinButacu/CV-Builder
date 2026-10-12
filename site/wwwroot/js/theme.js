// Colour mode and palette. This script is placed inside every page's <head>,
// so the saved theme applies before first paint and the page never flashes
// the wrong colours. It also runs the theme menu in the header.
(() => {
    const root = document.documentElement;
    // The palette names, in rotation order, come from the page itself (Site.Palettes).
    const palettes = (root.dataset.palettes || '').split(',').filter(Boolean);
    const system = matchMedia('(prefers-color-scheme: dark)');

    const read = (key, fallback) => {
        try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
    };
    const write = (key, value) => {
        try { localStorage.setItem(key, value); } catch { }
    };

    // Round robin: each page load takes the palette after the last one used.
    const nextInRotation = () => {
        const index = (Number(read('theme-rotation', '-1')) + 1) % palettes.length;
        write('theme-rotation', String(index));
        return palettes[index];
    };

    const applyMode = (mode) => {
        const dark = mode === 'dark' || (mode === 'system' && system.matches);
        root.dataset.mode = dark ? 'dark' : 'light';
    };

    // `palette` is 'rotate' or the name of a pinned palette.
    let mode = read('theme-mode', 'system');
    let palette = read('theme-palette', 'rotate');
    applyMode(mode);
    root.dataset.palette = palettes.includes(palette) ? palette : nextInRotation();
    system.addEventListener('change', () => applyMode(mode));

    // --- The menu. Its markup arrives after this script, so wiring waits for the page.
    document.addEventListener('DOMContentLoaded', () => {
        const button = document.querySelector('.theme-button');
        const panel = document.getElementById('theme-panel');
        if (!button || !panel) return;

        const show = () => {
            for (const b of panel.querySelectorAll('[data-mode]')) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
            for (const b of panel.querySelectorAll('.swatch')) b.setAttribute('aria-checked', String(b.dataset.pick === root.dataset.palette));
            panel.querySelector('[data-pick="rotate"]').setAttribute('aria-pressed', String(palette === 'rotate'));
        };
        const open = (yes) => {
            panel.hidden = !yes;
            button.setAttribute('aria-expanded', String(yes));
        };

        button.addEventListener('click', () => { show(); open(panel.hidden); });
        panel.addEventListener('click', (event) => {
            const choice = event.target.closest('[data-mode], [data-pick]');
            if (!choice) return;
            if (choice.dataset.mode) {
                mode = choice.dataset.mode;
                write('theme-mode', mode);
                applyMode(mode);
            } else {
                // Picking a palette pins it; "rotate" keeps the current one until the next refresh.
                palette = choice.dataset.pick;
                write('theme-palette', palette);
                if (palette !== 'rotate') root.dataset.palette = palette;
            }
            show();
        });
        // Clicking elsewhere, or Escape, closes it.
        document.addEventListener('click', (event) => { if (!event.target.closest('.theme-menu')) open(false); });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !panel.hidden) { open(false); button.focus(); }
        });
    });
})();
