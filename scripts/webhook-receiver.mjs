// TEST-ONLY webhook receiver for `make demo-webhooks`. Zero dependencies.
//
// Decoupled by construction: never imported by app code; not in the prod image
// (the multi-stage Dockerfile copies only apps/*); not referenced by any k8s
// manifest; runs solely under the compose `webhooks-demo` profile. It exists to
// exercise the real dispatcher/processor, nothing else.
//
// Two endpoints:
//   POST /ok    -> 200  (the delivery is marked `delivered`)
//   POST /fail  -> 503  (drives retries -> DLQ `dead` after 5 attempts)
// It recomputes the HMAC-SHA256 signature so you can SEE signed delivery working
// and that the event id is stable across redelivery.

import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.RECEIVER_PORT ?? 9099);
const SECRETS = { '/ok': process.env.OK_SECRET ?? '', '/fail': process.env.FAIL_SECRET ?? '' };

// count hits per webhook event id so the failing endpoint's attempts are visible
const attempts = new Map();

function verifySignature(path, rawBody, headers) {
  const secret = SECRETS[path];
  if (!secret) return 'no-secret';
  const ts = headers['x-webhook-timestamp'];
  const sig = headers['x-webhook-signature'];
  if (!ts || !sig) return 'missing-headers';
  const expected = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig)) ? 'VALID' : 'INVALID';
  } catch {
    return 'INVALID';
  }
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200).end('ok');
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const eventId = req.headers['x-webhook-id'] ?? '?';
    let eventType = '?';
    try { eventType = JSON.parse(rawBody).type ?? '?'; } catch { /* non-JSON */ }
    const attempt = (attempts.get(eventId) ?? 0) + 1;
    attempts.set(eventId, attempt);
    const signature = verifySignature(req.url, rawBody, req.headers);
    const status = req.url === '/fail' ? 503 : 200;
    console.log(JSON.stringify({
      at: new Date().toISOString(),
      path: req.url,
      status,
      eventId,        // stable across redelivery
      eventType,
      attempt,
      signature,
    }));
    res.writeHead(status, { 'content-type': 'text/plain' }).end(status === 200 ? 'ok' : 'boom');
  });
});

server.listen(PORT, () => {
  console.log(`webhook-receiver listening on :${PORT}  (/ok -> 200, /fail -> 503)`);
});
