const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Cambia este email por el de tu cuenta
const ADMIN_EMAIL = 'ericrando.singa@gmail.com';

async function setAdmin() {
  const user = await admin.auth().getUserByEmail(ADMIN_EMAIL);
  await admin.auth().setCustomUserClaims(user.uid, { admin: true });
  console.log(`✓ Admin claim asignado a ${ADMIN_EMAIL} (uid: ${user.uid})`);
  process.exit(0);
}

setAdmin().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
