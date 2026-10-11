import { openDatabase } from './database.js';
import { createWorkspace } from './services/workspace.js';

const username = process.argv[2]?.trim();
const count = Number(process.argv[3] ?? 6);
if (!username || process.argv.length > 4 || !Number.isInteger(count) || count < 1 || count > 25) {
  console.error('Usage: npm run reports:demo -- <registered-username> [count: 1-25, default 6]');
  process.exitCode = 1;
} else {
  const database = openDatabase();
  try {
    const user = database.statements.getUserByName.get(username.toLowerCase());
    const result = createWorkspace(database).addDemoReports(user, count);
    console.log(`${user.username}: ${result.created} demo drafts created; ${result.skipped} already present. No points awarded. Source examples retained.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    database.db.close();
  }
}
