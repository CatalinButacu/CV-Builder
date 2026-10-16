import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHandler } from './index.mjs';

process.env.TABLE_NAME = 'portfolio-visits';
process.env.ALLOWED_ORIGIN = 'https://catalinbutacu.github.io';
const items = new Map();
const handler = createHandler({ async send({ input }) {
    assert.equal(input.TableName, 'portfolio-visits');
    assert.equal(input.UpdateExpression, 'ADD visits :one');
    assert.deepEqual(input.ExpressionAttributeValues, { ':one': { N: '1' } });
    assert.equal(input.ReturnValues, 'UPDATED_NEW');
    const path = input.Key.path.S;
    items.set(path, (items.get(path) ?? 0n) + 1n);
    return { Attributes: { visits: { N: String(items.get(path)) } } };
} });
const event = (path) => ({
    headers: { origin: process.env.ALLOWED_ORIGIN },
    requestContext: { http: { method: 'POST', path: '/count' } },
    body: JSON.stringify({ path }),
});
for (const [path, count] of [['/', '1'], ['/', '2'], ['/about/', '1']]) {
    const result = await handler(event(path));
    assert.equal(result.statusCode, 200);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(result.body), { count });
}
for (const body of ['null', 'bad json', '{}', '{"path":"no-slash"}', 'x'.repeat(4001)]) {
    assert.equal((await handler({ ...event('/'), body })).statusCode, 400);
}
assert.equal((await handler({ ...event('/'), headers: {} })).statusCode, 403);
assert.equal((await handler({ ...event('/'), requestContext: {} })).statusCode, 404);
const encoded = { ...event('/'), isBase64Encoded: true, body: Buffer.from('{"path":"/"}').toString('base64') };
assert.equal(JSON.parse((await handler(encoded)).body).count, '3');
assert.equal((await createHandler({ send: async () => { throw new Error('test failure'); } })(event('/'))).statusCode, 503);
assert.equal((await createHandler({ send: async () => ({}) })(event('/'))).statusCode, 503);

const script = await readFile(new URL('../../site/wwwroot/js/visits.js', import.meta.url), 'utf8');
for (const mode of ['success', 'failure', 'invalid', 'doNotTrack', 'globalPrivacyControl', 'webdriver']) {
    const slot = { hidden: true };
    const requests = [], warnings = [];
    vm.runInNewContext(script, {
        navigator: { [mode]: mode === 'doNotTrack' ? '1' : true },
        document: {
            currentScript: { dataset: { counter: 'https://counter.example', page: '/about/' } },
            querySelector: () => slot,
        },
        console: { warn: (...args) => warnings.push(args) },
        fetch: (url, options) => {
            requests.push({ url, options });
            return Promise.resolve(new Response(JSON.stringify({ count: mode === 'invalid' ? 'bad' : '1234' }),
                { status: mode === 'failure' ? 503 : 200 }));
        },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const skipped = ['doNotTrack', 'globalPrivacyControl', 'webdriver'].includes(mode);
    assert.equal(requests.length, skipped ? 0 : 1);
    assert.equal(slot.hidden, skipped);
    if (skipped) continue;
    assert.equal(requests[0].url, 'https://counter.example/count');
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.body, '{"path":"/about/"}');
    assert.equal(slot.textContent, mode === 'success' ? ' · 1,234 visits to this page' : ' · visit count unavailable');
    assert.equal(warnings.length, mode === 'success' ? 0 : 1);
}
console.log('visit counter: all checks passed');
