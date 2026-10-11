import { createApp } from './app.js';
import { openDatabase } from './database.js';
import { createServer } from 'node:http';

const database = openDatabase();
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3001);
const server = createServer(createApp(database));
server.listen(port, host, () => {
  console.log(`Citrine API: http://${host}:${server.address().port}`);
  console.log(`SQLite: ${database.dataPath}`);
});
server.on('error', error => {
  console.error(error.message);
  database.db.close();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => {
    database.db.close();
    process.exit(0);
  }));
}
