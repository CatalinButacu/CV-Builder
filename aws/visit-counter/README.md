# AWS page counter

One `POST /count` with `{"path":"/about/"}` atomically increments a DynamoDB
counter and returns `{"count":"1"}` for the footer. Refreshes count as visits,
not unique people. No cookies, visitor profiles, GoatCounter, or API Gateway.

Automated browsers, Do Not Track, and Global Privacy Control use
`GET /total?path=%2Fabout%2F` to display the count without incrementing it.
Unvisited pages return `{"count":"0"}`. Both endpoints disable caching.
The 404 page is excluded. Errors are logged and the footer shows
"visit count unavailable"; the rest of the site keeps working. Neither the SDK
nor browser retries writes automatically.

## AWS setup

Use **eu-central-1** for both services.

1. **DynamoDB > Create table**:
   - Name `portfolio-visits`; partition key `path` (**String**); no sort key.
   - **Standard**, **Provisioned**, **5 read / 5 write** units.
   - Disable read/write auto scaling and leave optional paid features off.
2. **Lambda > Create function**:
   - Name `portfolio-visit-counter`; runtime **Node.js 22.x**.
   - Basic execution role, no VPC, **128 MB**, **5-second timeout**.
   - Paste [index.mjs](index.mjs) into the code editor and **Deploy**.
     The Lambda runtime includes AWS SDK v3.
3. **Configuration > Environment variables**:
   - `TABLE_NAME` = `portfolio-visits`
   - `ALLOWED_ORIGIN` = `https://catalinbutacu.github.io`
   - Remove any old `GOATCOUNTER_*` variables.
4. Open the Lambda execution role under **Configuration > Permissions**.
   Add an inline policy, replacing `YOUR_ACCOUNT_ID`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["dynamodb:UpdateItem", "dynamodb:GetItem"],
       "Resource": "arn:aws:dynamodb:eu-central-1:YOUR_ACCOUNT_ID:table/portfolio-visits"
     }]
   }
   ```

5. **Configuration > Function URL > Create**:
   - Auth **NONE**; grant public invocation in the console.
     Function URLs require `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction`.
   - Enable CORS: origin `https://catalinbutacu.github.io`, methods **GET**, **POST**.
     CORS headers are managed here, not in the handler.
6. In GitHub **Settings > Secrets and variables > Actions > Variables**, add
   `VISIT_COUNTER_URL` with the public Function URL. Run **Deploy site to GitHub Pages**.
   Without this variable, the site builds with the counter disabled.

GitHub Pages still hosts the site; only the counter runs on AWS. Counts start
at zero; existing GoatCounter data is not imported.

## Check and costs

Open the deployed site: each page load should make one `/count` request and
show its own count. Refresh to increment it. For local tests:

```powershell
cd aws\visit-counter
npm.cmd ci
npm.cmd test
```

Tests use a stub database, not AWS. Free allowances depend on eligibility and
other usage. Set a **$1 budget alert**, **7-day log retention**, and reserved
Lambda concurrency **2** if available. These are not spending caps. The public
endpoint can receive bot requests; CORS and Origin checks are not authentication.

For an existing deployment, redeploy the updated Lambda code, add
`dynamodb:GetItem` to its execution-role policy for the same table, and allow
GET alongside POST in Function URL CORS. Then publish the updated site script.
With a privacy preference enabled, refreshing should display the count without
increasing it. JavaScript and network access are required; browsers or extensions
that block the script or endpoint cannot be guaranteed to display a count.
