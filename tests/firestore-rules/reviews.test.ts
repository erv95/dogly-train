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
 * Reviews collection — public read post-Fase D, but server-validated writes.
 * Critical: a typo here could leak every review's `comment` to the internet.
 */

describe('firestore.rules — reviews', () => {
  beforeAll(async () => {
    await getTestEnv();
  });
  afterAll(async () => { await teardown(); });
  beforeEach(async () => { await clearFirestore(); });

  it('any authenticated active user can read reviews', async () => {
    const env = await getTestEnv();

    // Seed: an owner and a trainer doc + one review
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', 'owner1'), activeUser({ role: 'owner' }));
      await setDoc(doc(db, 'users', 'trainer1'), activeUser({ role: 'trainer' }));
      await setDoc(doc(db, 'reviews', 'owner1_trainer1'), {
        fromUserId: 'owner1',
        toUserId: 'trainer1',
        rating: 5,
        comment: 'Great trainer',
        createdAt: new Date(),
        fromUserDisplayName: 'Owner',
      });
    });

    // Some third party authenticated user (caretaker) — must be able to read.
    const caretaker = env.authenticatedContext('caretaker1');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'caretaker1'), activeUser({ role: 'caretaker' }));
    });
    await assertSucceeds(getDoc(doc(caretaker.firestore(), 'reviews', 'owner1_trainer1')));
  });

  it('unauthenticated users cannot read reviews', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'reviews', 'a_b'), {
        fromUserId: 'a', toUserId: 'b', rating: 5, comment: '', createdAt: new Date(),
        fromUserDisplayName: 'A',
      });
    });
    const anon = env.unauthenticatedContext();
    await assertFails(getDoc(doc(anon.firestore(), 'reviews', 'a_b')));
  });

  it('reviewer must be the authenticated owner', async () => {
    const env = await getTestEnv();
    // Seed users
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', 'owner1'), activeUser({ role: 'owner', displayName: 'Owner' }));
      await setDoc(doc(db, 'users', 'trainer1'), activeUser({ role: 'trainer' }));
    });
    const owner = env.authenticatedContext('owner1');
    // Wrong fromUserId (someone else's uid) → rejected
    await assertFails(setDoc(doc(owner.firestore(), 'reviews', 'attacker_trainer1'), {
      fromUserId: 'attacker',
      toUserId: 'trainer1',
      rating: 5,
      comment: 'hi',
      createdAt: new Date(),
      fromUserDisplayName: 'Owner',
    }));
  });

  it('denormalised displayName must match user doc', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', 'owner1'), activeUser({ role: 'owner', displayName: 'RealName' }));
      await setDoc(doc(db, 'users', 'trainer1'), activeUser({ role: 'trainer' }));
    });
    const owner = env.authenticatedContext('owner1');
    // Trying to claim a different display name → rejected (anti-spoofing)
    await assertFails(setDoc(doc(owner.firestore(), 'reviews', 'owner1_trainer1'), {
      fromUserId: 'owner1',
      toUserId: 'trainer1',
      rating: 5,
      comment: 'hi',
      createdAt: new Date(),
      fromUserDisplayName: 'FakeName',
    }));
  });
});
