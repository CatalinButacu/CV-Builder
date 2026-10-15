// Counts this visit and shows the site's total in the footer. Both go through
// our own counter function (aws/visit-counter), which passes them to
// GoatCounter, so blockers that stop goatcounter.com stop neither.
(() => {
    const counter = 'https://REPLACE-WITH-FUNCTION-URL.lambda-url.eu-central-1.on.aws';

    // Not counted: automated browsers, and visitors who ask not to be tracked.
    const skip = navigator.webdriver || navigator.globalPrivacyControl || navigator.doNotTrack === '1';
    if (!skip) {
        // A plain-text body keeps this a simple request, with no CORS preflight.
        fetch(`${counter}/count`, {
            method: 'POST',
            keepalive: true,
            body: JSON.stringify({ path: location.pathname, title: document.title, ref: document.referrer }),
        }).catch(() => { });
    }

    // If the total cannot be read, the footer simply goes without it.
    const slot = document.querySelector('.footer .visits');
    if (!slot) return;
    fetch(`${counter}/total`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
            if (!data?.count) return;
            slot.textContent = ` · visited ${data.count} times`;
            slot.hidden = false;
        })
        .catch(() => { });
})();
