# Visit counter

An AWS Lambda that sits between the portfolio site and GoatCounter, so visitors
with ad blockers are counted too and everyone sees the footer total. It stays in
Lambda's always-free allowance (1M requests a month) and needs no API Gateway.

```
site (js/visits.js) ──► Lambda Function URL ──► GoatCounter API
```

Check it locally: `node aws/visit-counter/test.mjs`

## Set up once, in the AWS console

1. **GoatCounter key.** In GoatCounter: Settings → API → New API key, tick
   *Record pageviews*. Also tick *Allow using the visitor counter* under
   Settings, which the footer total needs.
2. **Function.** Lambda → Create function → *Author from scratch*.
   Name `portfolio-visit-counter`, runtime **Node.js 22.x**, region
   **eu-central-1**. Replace the contents of `index.mjs` in the editor with
   [index.mjs](index.mjs) and click **Deploy**.
3. **Settings.** Configuration → Environment variables:
   - `GOATCOUNTER_SITE` = `https://catalinbutacu.goatcounter.com`
   - `GOATCOUNTER_TOKEN` = the key from step 1
   - `ALLOWED_ORIGIN` = `https://catalinbutacu.github.io`
4. **Address.** Configuration → Function URL → Create. Auth type **NONE**.
   Tick *Configure cross-origin resource sharing (CORS)*: allow origin
   `https://catalinbutacu.github.io`, allow methods `GET, POST`. Copy the URL;
   it goes into `site/wwwroot/js/visits.js`.
5. **Limits against a surprise bill.**
   - Configuration → Concurrency → Reserved concurrency **2**. If the account
     is new and the console refuses, skip it.
   - Billing → Budgets → a monthly cost budget of **$1** with an e-mail alert.

## Update the code later

Paste the new `index.mjs` into the console editor and click **Deploy**.
