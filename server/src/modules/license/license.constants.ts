/**
 * Public half of the license server's Ed25519 signing keypair — safe
 * to commit, only used to VERIFY responses actually came from your
 * license server (not a spoofed one). The private half never leaves
 * license-server/.env on your own machine.
 */
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA8yPDsKma7HmEpOVbRZDo5yDHyhG5pj1JFjT/STOpP1s=
-----END PUBLIC KEY-----
`;

/** Where this install calls home to verify its license. Override via
 * LICENSE_SERVER_URL in .env once you know where you're hosting it. */
export const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || 'http://localhost:4100';

/**
 * Grace-period timeline, measured from the last SUCCESSFUL
 * verification (not from key issuance). All in hours.
 *   0–48h since last check:  OK, full access
 *   48–72h:                  WARNING — admin panel shows a banner +
 *                            countdown, nothing blocked yet
 *   72–120h:                 ADMIN_LOCKED — admin panel blocked
 *                            entirely; mobile app keeps working but
 *                            shows a "48h until lockout" notice
 *   120h+:                   FULL_LOCKED — everything blocked,
 *                            including the mobile app / API
 * An explicit revocation from the license server skips straight to
 * FULL_LOCKED regardless of timing — a deliberate "turn it off now"
 * shouldn't wait out a grace period meant for network hiccups.
 */
export const LICENSE_WARNING_HOURS = 48;
export const LICENSE_ADMIN_LOCK_HOURS = 72;
export const LICENSE_FULL_LOCK_HOURS = 120;

/** How often the background check runs. Well under the shortest
 * threshold (48h) so a transient failure has many retries before it
 * matters. */
export const LICENSE_CHECK_INTERVAL_CRON = '0 */6 * * *'; // every 6 hours
