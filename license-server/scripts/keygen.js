// Run once: node scripts/keygen.js
// Prints a fresh Ed25519 keypair. The PRIVATE key goes in this server's
// .env (LICENSE_PRIVATE_KEY) and must never leave this machine or be
// committed anywhere. The PUBLIC key gets baked into every Vixor ERP
// client install (server/src/modules/license/license.constants.ts) so
// it can verify this server's signed responses came from you and
// weren't forged by a fake/MITM license server.
const crypto = require('crypto');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

console.log('=== PUBLIC KEY (bake into the client app, safe to commit) ===');
console.log(publicKey.export({ type: 'spki', format: 'pem' }).toString());

console.log('=== PRIVATE KEY (put in THIS server\'s .env as LICENSE_PRIVATE_KEY — never share, never commit) ===');
console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
