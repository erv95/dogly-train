// Validates that the 5 locale JSON files (es/en/fr/pt/de) share the SAME
// key tree. Spots accidental drift where a translator forgot to mirror a
// new key in one of the languages.
//
// This is complementary to scripts/check-i18n.mjs (which validates that
// every t('foo.bar') call in the code has a matching key in every locale).
// This script catches the reverse problem: a key added in one locale that
// was never mirrored.
//
// Usage: node scripts/check-locale-parity.mjs
// Exit code: 1 if mismatches found, 0 otherwise (suitable for CI).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LANGS = ['es', 'en', 'fr', 'pt', 'de'];
const BASE = 'src/locales';

/** Walk the JSON tree producing flat dotted key paths for every leaf
 *  (strings, numbers, booleans). Arrays are flattened with [N] index. */
function* flatten(node, path = '') {
  if (node === null || typeof node !== 'object') {
    yield path;
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      yield* flatten(node[i], `${path}[${i}]`);
    }
    return;
  }
  for (const k of Object.keys(node)) {
    yield* flatten(node[k], path ? `${path}.${k}` : k);
  }
}

// Load and flatten each locale
const trees = {};
for (const lang of LANGS) {
  const file = join(BASE, `${lang}.json`);
  try {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    trees[lang] = new Set(flatten(json));
  } catch (err) {
    console.error(`✗ Failed to load ${file}: ${err.message}`);
    process.exit(1);
  }
}

// i18next pluralization and context suffixes can be intentionally
// asymmetric between languages. Example: Spanish needs `restoredBody_female`
// because "Bienvenido/Bienvenida" inflects by gender, but English doesn't
// (just "Welcome back"). Treat keys ending in any of these suffixes as
// "optional variants" — they don't need to exist in every locale to count
// as parity-clean. The base key (suffix-stripped) DOES still need to be
// present in every locale.
const CONTEXT_SUFFIXES = ['_female', '_male', '_other', '_one', '_zero', '_two', '_few', '_many', '_plural'];

function isVariant(key) {
  return CONTEXT_SUFFIXES.some((s) => key.endsWith(s));
}

function stripVariant(key) {
  for (const s of CONTEXT_SUFFIXES) if (key.endsWith(s)) return key.slice(0, -s.length);
  return key;
}

// Compare each pair against the union — report keys missing per locale
const union = new Set();
for (const lang of LANGS) for (const k of trees[lang]) union.add(k);

const report = {};
let totalMissing = 0;
for (const lang of LANGS) {
  const missing = [];
  for (const k of union) {
    if (trees[lang].has(k)) continue;
    // If this is a variant key (e.g. foo_female) and the base key (foo) is
    // present in this locale, we don't flag — the locale just doesn't need
    // the gender / plural distinction. The i18next fallback handles it.
    if (isVariant(k) && trees[lang].has(stripVariant(k))) continue;
    missing.push(k);
  }
  report[lang] = missing;
  totalMissing += missing.length;
}

console.log('=== Locale parity report ===\n');
for (const lang of LANGS) {
  const size = trees[lang].size;
  const missing = report[lang];
  console.log(`${lang}: ${size} keys${missing.length ? `   (missing ${missing.length})` : '   ✓'}`);
  if (missing.length) {
    for (const k of missing.slice(0, 50)) console.log(`    - ${k}`);
    if (missing.length > 50) console.log(`    … +${missing.length - 50} more`);
  }
}

if (totalMissing > 0) {
  console.log(`\n✗ Found ${totalMissing} missing keys across locales. Add them and re-run.`);
  process.exit(1);
}

console.log('\n✓ All 5 locales are in sync.');
