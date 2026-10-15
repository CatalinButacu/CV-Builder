// Shows the whole site's visit count from GoatCounter in the footer, for every visitor.
// If the count cannot be read, the footer simply goes without it.
(() => {
    const slot = document.querySelector('.footer .visits');
    if (!slot) return;
    fetch('https://catalinbutacu.goatcounter.com/counter/TOTAL.json')
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
            if (!data?.count) return;
            slot.textContent = ` · visited ${data.count} times`;
            slot.hidden = false;
        })
        .catch(() => { });
})();
