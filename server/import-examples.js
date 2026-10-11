import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { openDatabase } from './database.js';
import { exampleDataset } from './services/examples.js';
import { hashContent } from './services/scamAnalysis.js';

export function importExamples(database, bytes) {
  const checksum = createHash('sha256').update(bytes).digest('hex');
  if (checksum !== exampleDataset.sourceSha256) throw new Error('This file does not match Kaggle SMS Spam Collection version 1. No examples were imported.');
  // Kaggle v1 uses Latin-1. Preserve overflow text cells rather than silently dropping them.
  const [header, ...rows] = parse(bytes.toString('latin1'), { bom: true, skip_empty_lines: true, max_record_size: 20000 });
  if (header[0] !== 'v1' || header[1] !== 'v2') throw new Error('Expected the Kaggle v1/v2 CSV columns.');
  const examples = rows.map((row, index) => {
    if (!['spam', 'ham'].includes(row[0]) || !row[1]?.trim()) throw new Error(`Invalid source row ${index + 1}.`);
    const cells = row.slice(1);
    while (cells.length > 1 && cells.at(-1) === '') cells.pop();
    const content = cells.join(',');
    return { id: `${exampleDataset.id}:${index + 1}`, datasetId: exampleDataset.id,
      sourceRow: index + 1, label: row[0], content, contentHash: hashContent(content) };
  });
  database.db.transaction(() => {
    database.statements.upsertExampleDataset.run({ ...exampleDataset, importedAt: new Date().toISOString() });
    for (const example of examples) database.statements.insertExample.run(example);
  }).immediate();
  return { total: examples.length, spam: examples.filter(row => row.label === 'spam').length,
    ham: examples.filter(row => row.label === 'ham').length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let database;
  try {
    if (process.argv.length !== 3) throw new Error('Usage: npm run examples:import -- /absolute/path/to/spam.csv');
    const bytes = readFileSync(process.argv[2]);
    database = openDatabase();
    console.log('Reference examples imported:', importExamples(database, bytes));
    console.log('User reports, fingerprints, and points were not modified.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally { database?.db.close(); }
}
