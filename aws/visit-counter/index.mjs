// Visit counter for the portfolio site, run as an AWS Lambda behind a Function URL.
//
// The site sends its visits here instead of straight to GoatCounter, so blockers
// that stop requests to goatcounter.com do not stop the count. The function
// forwards each visit to GoatCounter's API with the visitor's address and
// browser, which GoatCounter needs to tell one person from another, and hands
// the site's total back for the footer.
//
//   POST /count   body {"path", "title", "ref"} as text   -> 202
//   GET  /total                                           -> {"count": "1,234"}
//
// Settings (Lambda environment variables):
//   GOATCOUNTER_SITE    e.g. https://catalinbutacu.goatcounter.com
//   GOATCOUNTER_TOKEN   API key with the "Record pageviews" permission
//   ALLOWED_ORIGIN      e.g. https://catalinbutacu.github.io

const reply = (statusCode, body, headers = {}) => ({
    statusCode,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? '' : JSON.stringify(body),
});

// The visit as the page describes it. Anything malformed is refused, not repaired.
const readVisit = (event) => {
    let text = event.body ?? '';
    if (event.isBase64Encoded) text = Buffer.from(text, 'base64').toString('utf8');
    if (text.length > 2000) return null;
    let visit;
    try { visit = JSON.parse(text); } catch { return null; }
    const short = (value, max) => typeof value === 'string' && value.length <= max;
    if (!short(visit?.path, 300) || !visit.path.startsWith('/')) return null;
    if (visit.title !== undefined && !short(visit.title, 300)) return null;
    if (visit.ref !== undefined && !short(visit.ref, 500)) return null;
    return { path: visit.path, title: visit.title ?? '', ref: visit.ref ?? '' };
};

export const handler = async (event) => {
    const { GOATCOUNTER_SITE: site, GOATCOUNTER_TOKEN: token, ALLOWED_ORIGIN: allowed } = process.env;
    const http = event.requestContext?.http ?? {};

    // Browsers always send Origin on these cross-site calls; anything else is not the site.
    if ((event.headers?.origin ?? '') !== allowed) return reply(403, { error: 'origin' });

    if (http.method === 'POST' && http.path === '/count') {
        const visit = readVisit(event);
        if (!visit) return reply(400, { error: 'visit' });
        const response = await fetch(`${site}/api/v0/count`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({
                no_sessions: false,
                hits: [{ ...visit, ip: http.sourceIp, user_agent: http.userAgent ?? event.headers?.['user-agent'] ?? '' }],
            }),
        });
        if (!response.ok) {
            console.error('goatcounter count', response.status, await response.text());
            return reply(502, { error: 'upstream' });
        }
        return reply(202);
    }

    if (http.method === 'GET' && http.path === '/total') {
        const response = await fetch(`${site}/counter/TOTAL.json`);
        if (!response.ok) {
            console.error('goatcounter total', response.status);
            return reply(502, { error: 'upstream' });
        }
        const { count } = await response.json();
        // Browsers keep the total for five minutes, so busy pages do not call the function every time.
        return reply(200, { count }, { 'cache-control': 'public, max-age=300' });
    }

    return reply(404, { error: 'route' });
};
