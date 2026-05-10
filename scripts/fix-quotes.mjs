// Fixes JSON files where the agent forgot to escape internal double quotes.
// For each line that looks like `"key": "value with "internal" quotes"`,
// replaces the internal " with typographic quotes (“ ”).
//
// Usage: node scripts/fix-quotes.mjs <file>

import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('Usage: node fix-quotes.mjs <file>'); process.exit(1); }

const raw = readFileSync(file, 'utf8');
const lines = raw.split('\n');
let changed = 0;

function fixInternalQuotes(value) {
  let out = '';
  let openQuote = true;
  for (const ch of value) {
    if (ch === '"') {
      out += openQuote ? '“' : '”';
      openQuote = !openQuote;
    } else {
      out += ch;
    }
  }
  return out;
}

const fixedLines = lines.map((line) => {
  // Pattern A: `  "key": "..."[,]`  — object property with string value (greedy)
  let m = line.match(/^(\s*)"([a-zA-Z_]+)"(\s*:\s*")(.*)"(\s*,?\s*)$/);
  if (m) {
    const value = m[4];
    if (!value.includes('"')) return line;
    changed++;
    return m[1] + '"' + m[2] + '"' + m[3] + fixInternalQuotes(value) + '"' + m[5];
  }
  // Pattern B: `  "..."[,]`  — array element string (greedy)
  m = line.match(/^(\s*)"(.*)"(\s*,?\s*)$/);
  if (m) {
    const value = m[2];
    if (!value.includes('"')) return line;
    changed++;
    return m[1] + '"' + fixInternalQuotes(value) + '"' + m[3];
  }
  return line;
});

if (changed > 0) {
  writeFileSync(file, fixedLines.join('\n'), 'utf8');
  console.log(`Fixed ${changed} lines in ${file}`);
} else {
  console.log(`No fixes needed in ${file}`);
}
