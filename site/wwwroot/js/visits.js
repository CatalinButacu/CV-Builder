// One request records the visit and returns the updated DynamoDB count.
(() => {
    if (navigator.webdriver || navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
    const { counter, page } = document.currentScript.dataset;
    const slot = document.querySelector('.footer .visits');
    if (!slot) return;

    fetch(`${counter}/count`, {
        method: 'POST',
        keepalive: true,
        body: JSON.stringify({ path: page }),
    })
        .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then((data) => {
            if (typeof data?.count !== 'string' || !/^\d+$/.test(data.count)) throw new Error('Invalid visit count');
            const count = BigInt(data.count).toLocaleString('en-US');
            slot.textContent = ` · ${count} visits to this page`;
            slot.hidden = false;
        })
        .catch((error) => {
            console.warn('Page visit count unavailable:', error);
            slot.textContent = ' · visit count unavailable';
            slot.hidden = false;
        });
})();
