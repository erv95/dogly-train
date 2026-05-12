import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Spin up a single in-memory Firestore emulator instance that all rule tests
 * share. The emulator is started by `npm run test:rules` (see package.json
 * scripts) — `firebase emulators:exec` boots it, runs jest, then tears down.
 */

let envInstance: RulesTestEnvironment | null = null;

export async function getTestEnv(): Promise<RulesTestEnvironment> {
  if (envInstance) return envInstance;
  envInstance = await initializeTestEnvironment({
    projectId: 'dogly-train-rules-test',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
  return envInstance;
}

export async function clearFirestore(): Promise<void> {
  const env = await getTestEnv();
  await env.clearFirestore();
}

export async function teardown(): Promise<void> {
  if (envInstance) {
    await envInstance.cleanup();
    envInstance = null;
  }
}

/** Build a user doc shape that satisfies isActive() helper. */
export function activeUser(extras: Record<string, unknown> = {}) {
  return {
    role: 'owner',
    status: 'active',
    isActive: true,
    verified: false,
    createdAt: new Date(),
    ...extras,
  };
}

export { assertFails, assertSucceeds };
