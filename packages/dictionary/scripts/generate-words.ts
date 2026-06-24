#!/usr/bin/env tsx
/**
 * generate-words.ts
 *
 * Reads packages/dictionary/data/english-words.txt and writes
 * packages/dictionary/src/words.ts with a typed const array.
 *
 * Usage:
 *   npx tsx scripts/generate-words.ts
 *   # or add to package.json: "generate:words": "tsx scripts/generate-words.ts"
 *
 * Run this whenever words.txt changes. Commit the updated words.ts.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Adjust these paths relative to where this script lives.
// If the script is at packages/dictionary/scripts/generate-words.ts:
const DATA_FILE = resolve(__dirname, '../data/english-words.txt');
const OUT_FILE  = resolve(__dirname, '../src/words.ts');

// ── Read & normalise ──────────────────────────────────────────────────────────

const raw = readFileSync(DATA_FILE, 'utf-8');

const words = raw
  .split('\n')
  .map((line) => line.replace(/\r/g, '').trim().toLowerCase())
  .filter((line) => !line.startsWith('#') && /^[a-z]+$/.test(line)); // allow # comments in txt

// Validate: only plain alpha words (no punctuation, numbers, spaces)
const invalid = words.filter((w) => !/^[a-z]+$/.test(w));
if (invalid.length > 0) {
  console.error(`Found ${invalid.length} invalid word(s) in english-words.txt:`);
  console.error(invalid.join(', '));
  process.exit(1);
}

// Deduplicate and sort alphabetically for clean diffs
const unique = [...new Set(words)].sort();

if (unique.length === 0) {
  console.error('english-words.txt is empty or has no valid entries.');
  process.exit(1);
}

// ── Emit words.ts ─────────────────────────────────────────────────────────────

const banner = [
  '/**',
  ' * AUTO-GENERATED — do not edit by hand.',
  ' * Source: packages/dictionary/data/english-words.txt',
  ` * Words: ${unique.length}`,
  ` * Generated: ${new Date().toISOString()}`,
  ' *',
  ' * To add/remove words, edit english-words.txt then run:',
  ' *   npx tsx scripts/generate-words.ts',
  ' */',
].join('\n');

// Chunk into lines of ~10 words for readable diffs
const CHUNK = 10;
const chunks: string[] = [];
for (let i = 0; i < unique.length; i += CHUNK) {
  const slice = unique.slice(i, i + CHUNK);
  chunks.push(`  ${slice.map((w) => `'${w}'`).join(', ')},`);
}

const output = `${banner}

export const WORDS = [
${chunks.join('\n')}
] as const;

export type Word = (typeof WORDS)[number];
`;

writeFileSync(OUT_FILE, output, 'utf-8');
console.log(`Wrote ${unique.length} words to ${OUT_FILE}`);