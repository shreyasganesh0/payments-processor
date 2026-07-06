// Load test for the payment API.
//   node scripts/loadtest.mjs post   # POST /v1/payments — real inserts, unique key per request
//   node scripts/loadtest.mjs get    # GET  /v1/payments — read path (autocannon)
// Env: API_BASE (default http://localhost:3000), DURATION (30), CONNECTIONS (10)
import autocannon from 'autocannon';

const mode = process.argv[2] ?? 'post';
const base = process.env.API_BASE ?? 'http://localhost:3000';
const duration = Number(process.env.DURATION ?? 30);
const connections = Number(process.env.CONNECTIONS ?? 10);

function report(label, total, latencies, errors) {
  latencies.sort((a, b) => a - b);
  const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;
  console.log(`\nload · ${label} · ${connections} conns · ${duration}s\n`);
  console.log(`requests   : ${total} total · ${Math.round(total / duration)} req/s`);
  console.log(
    `latency ms : p50 ${pct(0.5).toFixed(1)} · p90 ${pct(0.9).toFixed(1)} · ` +
      `p95 ${pct(0.95).toFixed(1)} · p99 ${pct(0.99).toFixed(1)} · max ${(latencies.at(-1) ?? 0).toFixed(1)}`,
  );
  console.log(`errors     : ${errors}`);
}

if (mode === 'get') {
  // autocannon is ideal for the read path (no per-request state needed)
  const r = await autocannon({ url: `${base}/v1/payments?limit=20`, duration, connections });
  const l = r.latency;
  console.log(`\nload · GET /v1/payments?limit=20 · ${connections} conns · ${duration}s\n`);
  console.log(`requests   : ${r.requests.total} total · ${Math.round(r.requests.average)} req/s`);
  console.log(`latency ms : p50 ${l.p50} · p90 ${l.p90} · p97.5 ${l.p97_5} · p99 ${l.p99} · max ${l.max}`);
  console.log(`errors     : non-2xx ${r.non2xx} · timeouts ${r.timeouts}`);
} else {
  // POST needs a UNIQUE idempotency key per request (else it measures replays, not
  // inserts). autocannon pre-serializes headers, so drive it with a fetch pool.
  const body = JSON.stringify({
    customerId: 'LOADC1',
    amount: '250.00',
    sourceAccount: 'VA10001',
    destinationAccount: 'EXT98765',
    reference: 'load',
  });
  const deadline = Date.now() + duration * 1000;
  const latencies = [];
  let n = 0;
  let errors = 0;

  async function worker() {
    while (Date.now() < deadline) {
      const key = `k-${process.pid}-${n++}-${Math.random().toString(36).slice(2)}`;
      const t = performance.now();
      try {
        const res = await fetch(`${base}/v1/payments`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': key },
          body,
        });
        await res.arrayBuffer();
        latencies.push(performance.now() - t);
        if (!res.ok) errors += 1;
      } catch {
        errors += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: connections }, worker));
  report('POST /v1/payments (inserts)', latencies.length, latencies, errors);
}
