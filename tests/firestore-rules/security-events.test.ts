import { collection, getDocs, query, where, setDoc, doc } from 'firebase/firestore';
import {
  getTestEnv,
  clearFirestore,
  teardown,
  assertFails,
  assertSucceeds,
  activeUser,
} from './setup';

/**
 * security_events is the audit log for sensitive actions (dispute_opened,
 * revoke_all_sessions, data_export, account_deletion_*). Admin-only read —
 * a leak here would expose user behaviour patterns + IPs.
 */

describe('firestore.rules — security_events', () => {
  beforeAll(async () => { await getTestEnv(); });
  afterAll(async () => { await teardown(); });
  beforeEach(async () => { await clearFirestore(); });

  it('non-admin authenticated user cannot read security_events', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', 'owner1'), activeUser({ role: 'owner' }));
      await setDoc(doc(db, 'security_events', 'evt1'), {
        userId: 'owner1',
        type: 'data_export',
        createdAt: new Date(),
      });
    });
    const owner = env.authenticatedContext('owner1');
    await assertFails(
      getDocs(query(collection(owner.firestore(), 'security_events'), where('userId', '==', 'owner1'))),
    );
  });

  it('admin can read security_events', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'security_events', 'evt1'), {
        userId: 'owner1',
        type: 'data_export',
        createdAt: new Date(),
      });
    });
    const admin = env.authenticatedContext('admin1', { admin: true });
    await assertSucceeds(
      getDocs(query(collection(admin.firestore(), 'security_events'))),
    );
  });

  it('clients cannot write security_events', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'owner1'), activeUser({ role: 'owner' }));
    });
    const owner = env.authenticatedContext('owner1');
    await assertFails(setDoc(doc(owner.firestore(), 'security_events', 'fake'), {
      userId: 'owner1',
      type: 'data_export',
      createdAt: new Date(),
    }));
  });
});
