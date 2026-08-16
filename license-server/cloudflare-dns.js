// Automates what was previously a manual step in the Cloudflare
// dashboard: adding/removing a tenant's public hostname on the SAME
// shared tunnel that already serves app.doc-capture.app and
// license.doc-capture.app.
//
// CRITICAL: the tunnel configuration PUT endpoint replaces the ENTIRE
// ingress rule list — there's no "add one rule" API. Every function
// here does read -> modify in memory -> write back the full list, so
// existing hostnames are never touched by accident. The catch-all
// (http_status:404) rule is always kept last.

const CF_API = 'https://api.cloudflare.com/client/v4';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in .env — see license-server/README.md's Cloudflare automation section`);
  return v;
}

async function cf(path, opts = {}) {
  const token = requireEnv('CLOUDFLARE_API_TOKEN');
  const res = await fetch(`${CF_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const body = await res.json();
  if (!body.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(body.errors)}`);
  }
  return body.result;
}

/** A Cloudflare Zone ID is specific to exactly one registered domain
 * — it's not possible to manage vixor.app's DNS through doc-
 * capture.app's zone, or vice versa. If TENANT_BASE_DOMAIN gets
 * changed (e.g. to switch which domain new tenants are provisioned
 * under) without ALSO updating CLOUDFLARE_ZONE_ID to the matching
 * zone, addDnsRecord would either silently fail or — worse — succeed
 * against the wrong zone, creating a tenant that's completely
 * unreachable under the domain it was supposedly just set up on, with
 * no obvious error pointing at why. Checked once per DNS operation
 * (cheap - one extra API call) rather than only at startup, since
 * .env can change between calls to a long-running process only via a
 * restart anyway, but this stays correct even if that assumption
 * ever changes. */
async function assertZoneMatchesBaseDomain(baseDomain) {
  const zoneId = requireEnv('CLOUDFLARE_ZONE_ID');
  const zone = await cf(`/zones/${zoneId}`);
  if (zone.name !== baseDomain) {
    throw new Error(
      `CLOUDFLARE_ZONE_ID in .env points to the "${zone.name}" zone, but TENANT_BASE_DOMAIN is "${baseDomain}" — ` +
      `these must be the SAME domain (a Cloudflare zone only manages DNS for the one domain it belongs to). ` +
      `Update CLOUDFLARE_ZONE_ID to the zone ID for "${baseDomain}" (find it in the Cloudflare dashboard under ` +
      `that domain's Overview page, or via GET /zones?name=${baseDomain} with your API token) before provisioning.`
    );
  }
}

async function getIngressRules() {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID');
  const tunnelId = requireEnv('CLOUDFLARE_TUNNEL_ID');
  const result = await cf(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`);
  return (result?.config?.ingress) || [{ service: 'http_status:404' }];
}

async function putIngressRules(rules) {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID');
  const tunnelId = requireEnv('CLOUDFLARE_TUNNEL_ID');
  await cf(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
    method: 'PUT',
    body: JSON.stringify({ config: { ingress: rules } }),
  });
}

/** Adds (or updates, if already present) one hostname -> local port
 * rule, keeping every other existing rule untouched. Idempotent. */
async function addTunnelHostname(hostname, port) {
  const rules = await getIngressRules();
  const withoutThisHost = rules.filter((r) => r.hostname !== hostname && r.service !== 'http_status:404');
  const catchAll = rules.find((r) => r.service === 'http_status:404') || { service: 'http_status:404' };
  const newRule = { hostname, service: `http://localhost:${port}` };
  await putIngressRules([...withoutThisHost, newRule, catchAll]);
}

/** Removes one hostname's rule, keeping every other rule untouched. */
async function removeTunnelHostname(hostname) {
  const rules = await getIngressRules();
  const filtered = rules.filter((r) => r.hostname !== hostname);
  await putIngressRules(filtered);
}

async function addDnsRecord(hostname) {
  const zoneId = requireEnv('CLOUDFLARE_ZONE_ID');
  const tunnelId = requireEnv('CLOUDFLARE_TUNNEL_ID');
  try {
    await cf(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'CNAME',
        name: hostname,
        content: `${tunnelId}.cfargotunnel.com`,
        proxied: true,
      }),
    });
  } catch (err) {
    // Error code 81057 = "record already exists" — fine, not a failure
    // (e.g. re-running provisioning after a partial earlier attempt).
    if (!/81057/.test(err.message)) throw err;
  }
}

async function removeDnsRecord(hostname) {
  const zoneId = requireEnv('CLOUDFLARE_ZONE_ID');
  const records = await cf(`/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}`);
  for (const record of records) {
    await cf(`/zones/${zoneId}/dns_records/${record.id}`, { method: 'DELETE' });
  }
}

/** Full add: tunnel ingress rule + DNS record. Returns the public URL. */
async function provisionTenantHostname(slug, port) {
  const baseDomain = process.env.TENANT_BASE_DOMAIN || 'vixor.app';
  await assertZoneMatchesBaseDomain(baseDomain);
  const hostname = `${slug}.${baseDomain}`;
  await addTunnelHostname(hostname, port);
  await addDnsRecord(hostname);
  return `https://${hostname}`;
}

/** Full teardown: DNS record + tunnel ingress rule. */
async function deprovisionTenantHostname(slug) {
  const baseDomain = process.env.TENANT_BASE_DOMAIN || 'vixor.app';
  const hostname = `${slug}.${baseDomain}`;
  await removeDnsRecord(hostname);
  await removeTunnelHostname(hostname);
}

const cloudflareAutomationEnabled = () =>
  !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ZONE_ID && process.env.CLOUDFLARE_TUNNEL_ID);

module.exports = { provisionTenantHostname, deprovisionTenantHostname, cloudflareAutomationEnabled };
