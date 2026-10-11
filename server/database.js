import Database from 'better-sqlite3';
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseSettings, migrationQueries, queries } from './queries.js';

const defaultPath = fileURLToPath(new URL('./data/citrine.sqlite', import.meta.url));

export function openDatabase(filename = process.env.SQLITE_PATH || defaultPath) {
  const dataPath = filename === ':memory:' ? filename : resolve(filename);
  if (dataPath !== ':memory:') mkdirSync(dirname(dataPath), { recursive: true, mode: 0o700 });
  const db = new Database(dataPath);
  if (dataPath !== ':memory:') {
    if (dataPath === defaultPath) chmodSync(dirname(defaultPath), 0o700);
    for (const file of [dataPath, `${dataPath}-wal`, `${dataPath}-shm`]) {
      if (existsSync(file)) chmodSync(file, 0o600);
    }
  }
  db.exec(databaseSettings);
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  db.transaction(() => {
    if (!db.prepare(migrationQueries.reportColumns).all().some(column => column.name === 'owner_id')) {
      db.exec(migrationQueries.accounts);
    }
    if (!db.prepare(migrationQueries.reportColumns).all().some(column => column.name === 'source_example_id')) {
      db.exec(migrationQueries.demoReports);
    }
    db.exec(migrationQueries.finish);
  }).immediate();
  const statements = Object.fromEntries(
    Object.entries(queries).map(([name, sql]) => [name, db.prepare(sql)]),
  );
  return { db, statements, dataPath };
}
