// Validates that every t('foo.bar') call in app/ and src/ has a matching key
// in all 5 locale files. Reports keys missing per language.
//
// Usage: node scripts/check-i18n.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const LANGS = ['es', 'en', 'fr', 'pt', 'de'];
const SCAN_DIRS = ['app', 'src'];
const T_REGEX = /\bt\(\s*['"`]([a-zA-Z][\w.]*)['"`]/g;

// Recursively collect tsx/ts/jsx/js files
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.expo' || entry.startsWith('.')) continue;
      yield* walk(full);
    } else if (st.isFile()) {
      const ext = extname(full).toLowerCase();
      if (['.tsx', '.ts', '.jsx', '.js'].includes(ext)) yield full;
    }
  }
}

// Extract used keys
const usedKeys = new Map(); // key → array of file:line
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      let m;
      const re = new RegExp(T_REGEX.source, 'g');
      while ((m = re.exec(line))) {
        const key = m[1];
        // Skip dynamic suffixes (template literals not supported by static analysis)
        if (key.includes('${')) continue;
        if (!usedKeys.has(key)) usedKeys.set(key, []);
        usedKeys.get(key).push(`${file}:${i + 1}`);
      }
    });
  }
}

// Load locales
const locales = {};
for (const lang of LANGS) {
  locales[lang] = JSON.parse(readFileSync(`src/locales/${lang}.json`, 'utf8'));
}

function hasKey(obj, dotKey) {
  const parts = dotKey.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object' || !(p in cur)) return false;
    cur = cur[p];
  }
  return true;
}

// Check
const missing = []; // { key, langs[], usages[] }
for (const [key, usages] of usedKeys.entries()) {
  // Skip dynamic prefixes that are computed at runtime — heuristic:
  // a key with no dot is almost surely dynamic ("home", "active", "alert").
  if (!key.includes('.')) continue;
  const missingLangs = LANGS.filter((l) => !hasKey(locales[l], key));
  if (missingLangs.length > 0) {
    missing.push({ key, missingLangs, usages });
  }
}

console.log(`Total t() keys discovered: ${usedKeys.size}`);
console.log(`Keys missing in at least one locale: ${missing.length}`);
console.log('');
if (missing.length === 0) {
  console.log('All good ✓');
  process.exit(0);
}

// Group by missing-set so the report is compact
const grouped = new Map(); // langSet → keys[]
for (const m of missing) {
  const k = m.missingLangs.sort().join(',');
  if (!grouped.has(k)) grouped.set(k, []);
  grouped.get(k).push(m);
}

for (const [langSet, keys] of grouped.entries()) {
  console.log(`\nMissing in [${langSet}] (${keys.length} keys):`);
  for (const m of keys.slice(0, 50)) {
    console.log(`  ${m.key}`);
    console.log(`    used at: ${m.usages.slice(0, 2).join(', ')}${m.usages.length > 2 ? ' …' : ''}`);
  }
  if (keys.length > 50) console.log(`  … and ${keys.length - 50} more`);
}
