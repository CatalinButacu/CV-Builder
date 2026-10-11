// Applies the saved colour mode and accent before first paint, so the page
// never flashes the wrong theme. ThemeMenu.razor calls get() and set().
window.theme = (() => {
    const root = document.documentElement;
    const system = matchMedia('(prefers-color-scheme: dark)');

    const read = (key, fallback) => {
        try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
    };

    const get = () => ({ mode: read('theme-mode', 'system'), accent: read('theme-accent', 'blue') });

    const apply = ({ mode, accent }) => {
        const dark = mode === 'dark' || (mode === 'system' && system.matches);
        root.dataset.mode = dark ? 'dark' : 'light';
        root.dataset.accent = accent;
    };

    const set = (mode, accent) => {
        try {
            localStorage.setItem('theme-mode', mode);
            localStorage.setItem('theme-accent', accent);
        } catch { }
        apply({ mode, accent });
    };

    apply(get());
    system.addEventListener('change', () => apply(get()));

    return { get, set };
})();
