import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  getTestEnv,
  clearFirestore,
  teardown,
  assertFails,
  assertSucceeds,
  activeUser,
} from './setup';

/**
 * Disputes are visible to the booking's participants + admin. Clients NEVER
 * write — the openDispute Cloud Function does it via Admin SDK.
 */

describe('firestore.rules — disputes', () => {
  beforeAll(async () => { await getTestEnv(); });
  afterAll(async () => { await teardown(); });
  beforeEach(async () => { await clearFirestore(); });

  it('participant can read their own dispute', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', 'owner1'), activeUser({ role: 'owner' }));
      await setDoc(doc(db, 'disputes', 'bk1_owner1'), {
        bookingId: 'bk1',
        ownerId: 'owner1',
        providerId: 'trainer1',
        openedBy: 'owner1',
        reason: 'no_show',
        description: '...',
        status: 'open',
        createdAt: new Date(),
      });
    });
    const owner = env.authenticatedContext('owner1');
    await assertSucceeds(getDoc(doc(owner.firestore(), 'disputes', 'bk1_owner1')));
  });

  it('non-participant cannot read someone else\'s dispute', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', 'stranger'), activeUser({ role: 'owner' }));
      await setDoc(doc(db, 'disputes', 'bk1_owner1'), {
        bookingId: 'bk1',
        ownerId: 'owner1',
        providerId: 'trainer1',
        openedBy: 'owner1',
        reason: 'no_show',
        description: 'private',
        status: 'open',
        createdAt: new Date(),
      });
    });
    const stranger = env.authenticatedContext('stranger');
    await assertFails(getDoc(doc(stranger.firestore(), 'disputes', 'bk1_owner1')));
  });

  it('clients cannot write disputes (server-only)', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'owner1'), activeUser({ role: 'owner' }));
    });
    const owner = env.authenticatedContext('owner1');
    await assertFails(setDoc(doc(owner.firestore(), 'disputes', 'bk1_owner1'), {
      bookingId: 'bk1',
      ownerId: 'owner1',
      providerId: 'trainer1',
      openedBy: 'owner1',
      reason: 'no_show',
      description: 'trying to bypass server',
      status: 'open',
      createdAt: new Date(),
    }));
  });
});
