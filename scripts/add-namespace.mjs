// Adds a top-level namespace to each locale file from a single source file.
// Usage: node scripts/add-namespace.mjs <namespaceKey> <sourceJsonFile>
// sourceJsonFile must be { es: {...}, en: {...}, fr: {...}, pt: {...}, de: {...} }

import { readFileSync, writeFileSync } from 'node:fs';

const [,, key, srcFile] = process.argv;
if (!key || !srcFile) { console.error('Usage: node add-namespace.mjs <key> <src.json>'); process.exit(1); }

const all = JSON.parse(readFileSync(srcFile, 'utf8'));

for (const lang of ['es', 'en', 'fr', 'pt', 'de']) {
  const path = `src/locales/${lang}.json`;
  const locale = JSON.parse(readFileSync(path, 'utf8'));
  if (!(lang in all)) { console.warn(`No content for ${lang}`); continue; }
  locale[key] = all[lang];
  writeFileSync(path, JSON.stringify(locale, null, 2) + '\n', 'utf8');
  console.log(`OK: ${path} ← ${key}`);
}
