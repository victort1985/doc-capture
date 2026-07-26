/**
 * Vixor ERP — load test (requirement #23, "производительность").
 *
 * This is a TOOL for YOU to run against your own server, not
 * something that can be "built" and declared done the way a feature
 * can — actual performance under load depends on your server's real
 * hardware, database size, and network, none of which exist in the
 * sandbox this was written in. Run it, look at the results, and come
 * back with what you find; that's the only way this requirement
 * actually gets verified.
 *
 * Install k6: https://k6.io/docs/get-started/installation/
 *   macOS:   brew install k6
 *   Ubuntu:  sudo apt install k6   (or see the installation link
 *            above if that package isn't available on your Ubuntu
 *            version — k6's own apt repo covers older releases too)
 *
 * Run:
 *   BASE_URL=https://test.doc-capture.app K6_USERNAME=admin K6_PASSWORD=yourpassword \
 *     k6 run server/scripts/load-test/k6-load-test.js
 *
 * Tune load with:
 *   k6 run --vus 20 --duration 2m server/scripts/load-test/k6-load-test.js
 *
 * IMPORTANT: point this at a TEST tenant, not a production one with
 * real customer data — it creates real quotes as part of the test
 * (see the "create quote" scenario below) and will leave that test
 * data behind. Use a disposable/staging database, or clean up
 * afterward.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const USERNAME = __ENV.K6_USERNAME || 'admin';
const PASSWORD = __ENV.K6_PASSWORD || '';

const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const listDuration = new Trend('list_duration');
const createDuration = new Trend('create_duration');

export const options = {
  // Default: ramp 0 -> 10 virtual users over 30s, hold for 2 minutes,
  // ramp back down — a reasonable starting point for "does this
  // survive normal-ish concurrent usage", not a stress test to
  // failure. Override with --vus/--duration or edit these stages for
  // a heavier run once the light one passes cleanly.
  stages: [
    { duration: '30s', target: 10 },
    { duration: '2m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // Fails the whole run (non-zero exit code) if either of these
    // isn't met — useful for CI, and for getting a clear yes/no
    // rather than having to eyeball a wall of numbers.
    http_req_duration: ['p(95)<1000'], // 95% of requests under 1s
    errors: ['rate<0.01'], // under 1% error rate
  },
};

function authenticatedHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

export default function () {
  // ── Login ────────────────────────────────────────────────────
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  loginDuration.add(loginRes.timings.duration);
  const loginOk = check(loginRes, {
    'login: status 200': (r) => r.status === 200,
    'login: got a token': (r) => !!r.json('token'),
  });
  errorRate.add(!loginOk);
  if (!loginOk) {
    sleep(1);
    return;
  }
  const token = loginRes.json('token');
  const headers = authenticatedHeaders(token);

  // ── List invoices (a representative "browse a document list" read) ──
  const listRes = http.get(`${BASE_URL}/api/invoices`, headers);
  listDuration.add(listRes.timings.duration);
  errorRate.add(!check(listRes, { 'list invoices: status 200': (r) => r.status === 200 }));

  // ── List financial reports (a representative aggregation-heavy read) ──
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const reportRes = http.get(`${BASE_URL}/api/financial-reports?from=${monthAgo}&to=${today}`, headers);
  errorRate.add(!check(reportRes, { 'financial report: status 200': (r) => r.status === 200 }));

  // ── Create a quote (a representative write) ─────────────────────
  const createRes = http.post(
    `${BASE_URL}/api/quotes`,
    JSON.stringify({
      clientName: `k6 load test ${Date.now()}`,
      items: [{ description: 'Load test item', quantity: 1, unitPrice: 100 }],
    }),
    headers,
  );
  createDuration.add(createRes.timings.duration);
  errorRate.add(!check(createRes, { 'create quote: status 200/201': (r) => r.status === 200 || r.status === 201 }));

  sleep(1);
}
