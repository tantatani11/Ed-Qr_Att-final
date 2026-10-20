const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  '@expo',
  'metro-config',
  'build',
  'serializer',
  'serializeChunks.js'
);

const oldCode =
  'if (chunk !== chunk2 && chunk.isAsync && chunk2.isAsync) {';
const newCode =
  'if (chunk !== chunk2 && chunk.isAsync && chunk2.isAsync && !chunk.isEntry && !chunk2.isEntry) {';

if (!fs.existsSync(target)) {
  console.warn('[patch-worker-chunks] target file not found, skipping:', target);
  process.exit(0);
}

const source = fs.readFileSync(target, 'utf8');

if (source.includes(newCode)) {
  console.log('[patch-worker-chunks] already patched:', target);
  process.exit(0);
}

if (!source.includes(oldCode)) {
  console.warn('[patch-worker-chunks] expected code not found, skipping:', target);
  process.exit(0);
}

fs.writeFileSync(target, source.split(oldCode).join(newCode), 'utf8');
console.log('[patch-worker-chunks] patched:', target);
