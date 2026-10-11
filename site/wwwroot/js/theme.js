// Applies the saved colour mode and palette before first paint, so the page
// never flashes the wrong theme. ThemeMenu.razor calls get() and set().
window.theme = (() => {
    // One css/palettes/<name>.css file each, linked in index.html.
    const palettes = [
        'cobalt-magenta',
        'violet-cyan',
        'emerald-indigo',
        'tangerine-fuchsia',
        'crimson-amber',
        'teal-coral',
    ];

    const root = document.documentElement;
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

    // palette is 'rotate' or the name of a pinned palette.
    const get = () => ({
        mode: read('theme-mode', 'system'),
        palette: read('theme-palette', 'rotate'),
        active: root.dataset.palette,
        palettes,
    });

    const set = (mode, palette) => {
        write('theme-mode', mode);
        write('theme-palette', palette);
        applyMode(mode);
        if (palettes.includes(palette)) root.dataset.palette = palette;
    };

    const saved = get();
    applyMode(saved.mode);
    root.dataset.palette = palettes.includes(saved.palette) ? saved.palette : nextInRotation();
    system.addEventListener('change', () => applyMode(get().mode));

    return { get, set };
})();
