const crypto = require('crypto');

const PRIVATE_KEY_PEM = process.env.LICENSE_PRIVATE_KEY;
if (!PRIVATE_KEY_PEM) {
  throw new Error('LICENSE_PRIVATE_KEY is not set — run `npm run keygen` and put the private key in .env');
}
const privateKey = crypto.createPrivateKey(PRIVATE_KEY_PEM.replace(/\\n/g, '\n'));

/** Signs a JSON-serializable payload. Returns { payload, signature } where
 * signature is base64 over the exact JSON string of payload — the
 * client must re-serialize identically (we send the exact string back
 * too, so it never needs to re-derive it) and verify against the
 * baked-in public key before trusting anything in payload. */
function signPayload(payload) {
  const json = JSON.stringify(payload);
  const signature = crypto.sign(null, Buffer.from(json), privateKey);
  return { payloadJson: json, signature: signature.toString('base64') };
}

module.exports = { signPayload };
