import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

// Retrying an increment after a lost response could count the same visit twice.
const database = new DynamoDBClient({ maxAttempts: 1 });

function jsonResponse(statusCode, body) {
    return {
        statusCode,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        body: JSON.stringify(body),
    };
}

function decodeBody(event) {
    const body = event.body ?? '';
    if (typeof body !== 'string' || body.length > 4000) return undefined;
    const json = event.isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
    return json.length <= 2000 ? json : undefined;
}

function parseBody(json) {
    if (json === undefined) return undefined;
    try {
        return JSON.parse(json);
    } catch {
        return undefined;
    }
}

function isPagePath(path) {
    return typeof path === 'string' && path.length <= 300
        && path.startsWith('/') && !/[?#\s]/.test(path);
}

function validateRequest(event, tableName, allowedOrigin) {
    if (!tableName || !allowedOrigin) {
        console.error('Visit counter: TABLE_NAME and ALLOWED_ORIGIN must be configured');
        return jsonResponse(500, { error: 'configuration' });
    }
    if (event.headers?.origin !== allowedOrigin) {
        return jsonResponse(403, { error: 'origin' });
    }
    const { method, path } = event.requestContext?.http ?? {};
    if (method !== 'POST' || path !== '/count') {
        return jsonResponse(404, { error: 'route' });
    }
}

function incrementCommand(tableName, pagePath) {
    return new UpdateItemCommand({
        TableName: tableName,
        Key: { path: { S: pagePath } },
        UpdateExpression: 'ADD visits :one',
        ExpressionAttributeValues: { ':one': { N: '1' } },
        ReturnValues: 'UPDATED_NEW',
    });
}

function readCount(result) {
    const count = result.Attributes?.visits?.N;
    if (typeof count !== 'string' || !/^\d+$/.test(count)) {
        throw new Error('Invalid stored visit count');
    }
    return count;
}

async function recordVisit(dynamoDb, tableName, pagePath) {
    try {
        const command = incrementCommand(tableName, pagePath);
        const result = await dynamoDb.send(command, { abortSignal: AbortSignal.timeout(3000) });
        return jsonResponse(200, { count: readCount(result) });
    } catch (error) {
        console.error('Visit counter database request failed:', error);
        return jsonResponse(503, { error: 'counter unavailable' });
    }
}

export const createHandler = (dynamoDb) => async (event) => {
    const { TABLE_NAME, ALLOWED_ORIGIN } = process.env;
    const error = validateRequest(event, TABLE_NAME, ALLOWED_ORIGIN);
    if (error) return error;

    const pagePath = parseBody(decodeBody(event))?.path;
    if (!isPagePath(pagePath)) return jsonResponse(400, { error: 'path' });
    return recordVisit(dynamoDb, TABLE_NAME, pagePath);
};

export const handler = createHandler(database);
