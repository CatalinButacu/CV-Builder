// Self-check for the visit counter, with GoatCounter replaced by a stub.
//   node aws/visit-counter/test.mjs
import assert from 'node:assert/strict';
import { handler } from './index.mjs';

process.env.GOATCOUNTER_SITE = 'https://example.goatcounter.com';
process.env.GOATCOUNTER_TOKEN = 'secret';
process.env.ALLOWED_ORIGIN = 'https://catalinbutacu.github.io';

const sent = [];
globalThis.fetch = async (url, options = {}) => {
    sent.push({ url, options });
    if (url.endsWith('/counter/TOTAL.json')) return new Response(JSON.stringify({ count: '1,234' }));
    return new Response('', { status: 202 });
};

const event = (method, path, body, origin = 'https://catalinbutacu.github.io') => ({
    headers: { origin, 'user-agent': 'Mozilla/5.0' },
    requestContext: { http: { method, path, sourceIp: '203.0.113.7', userAgent: 'Mozilla/5.0' } },
    body,
});

// A visit is forwarded with the visitor's address and browser, and the key.
let result = await handler(event('POST', '/count', JSON.stringify({ path: '/CV-Builder/', title: 'Home', ref: '' })));
assert.equal(result.statusCode, 202);
const hit = JSON.parse(sent[0].options.body).hits[0];
assert.deepEqual(hit, { path: '/CV-Builder/', title: 'Home', ref: '', ip: '203.0.113.7', user_agent: 'Mozilla/5.0' });
assert.equal(sent[0].options.headers.authorization, 'Bearer secret');

// The total comes back for the footer.
result = await handler(event('GET', '/total'));
assert.equal(result.statusCode, 200);
assert.deepEqual(JSON.parse(result.body), { count: '1,234' });

// Refused: other sites, malformed visits, unknown routes.
assert.equal((await handler(event('POST', '/count', '{"path":"/"}', 'https://evil.example'))).statusCode, 403);
assert.equal((await handler(event('POST', '/count', 'not json'))).statusCode, 400);
assert.equal((await handler(event('POST', '/count', JSON.stringify({ path: 'no-slash' })))).statusCode, 400);
assert.equal((await handler(event('POST', '/count', JSON.stringify({ path: '/' + 'x'.repeat(400) })))).statusCode, 400);
assert.equal((await handler(event('GET', '/nope'))).statusCode, 404);
assert.equal(sent.length, 2, 'refused requests must not reach GoatCounter');

console.log('visit counter: all checks passed');
