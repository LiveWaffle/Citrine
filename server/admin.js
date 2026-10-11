import { openDatabase } from './database.js';
import { createModeration } from './services/moderation.js';

const username = process.argv[2]?.trim();
if (!username || process.argv.length !== 3) {
  console.error('Usage: npm run account:admin -- <registered-username>');
  process.exitCode = 1;
} else {
  const database = openDatabase();
  try {
    const user = createModeration(database).promoteAdmin(username);
    console.log(`${user.username} is an admin. Sign in again to use moderation tools.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    database.db.close();
  }
}
