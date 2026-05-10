// Helper for safely replacing a course's sub-object inside a locale file.
// Usage: node scripts/update-course.mjs <localeFile> <courseId> <jsonFile>
//
// Reads `jsonFile` (a JSON file containing the new course object), parses
// the locale, replaces locale.owner.coursesPage.<courseId> with the new
// content, and writes back with stable 2-space indentation matching the
// existing locale style. UTF-8 safe; preserves NBSP and other unicode.

import { readFileSync, writeFileSync } from 'node:fs';
import { argv } from 'node:process';

const [,, localeFile, courseId, jsonFile] = argv;
if (!localeFile || !courseId || !jsonFile) {
  console.error('Usage: node update-course.mjs <localeFile> <courseId> <jsonFile>');
  process.exit(1);
}

const locale = JSON.parse(readFileSync(localeFile, 'utf8'));
const newCourse = JSON.parse(readFileSync(jsonFile, 'utf8'));

if (!locale.owner?.coursesPage) {
  console.error('locale.owner.coursesPage missing');
  process.exit(1);
}
locale.owner.coursesPage[courseId] = newCourse;

writeFileSync(localeFile, JSON.stringify(locale, null, 2) + '\n', 'utf8');
console.log(`OK: ${localeFile} ← ${courseId}`);
