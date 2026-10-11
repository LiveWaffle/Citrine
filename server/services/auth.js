import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError, requireValue } from './errors.js';

const derive = promisify(scrypt);
const passwordParameters = { algorithm: 'scrypt', N: 131072, r: 8, p: 1, keyLength: 64 };
const maxmem = 256 * 1024 * 1024;
const sessionLifetime = 12 * 60 * 60 * 1000;
const rateWindow = 15 * 60 * 1000;
const dummySalt = randomBytes(16).toString('hex');
let activeDerivations = 0;

export const digest = value => createHash('sha256').update(value).digest('hex');
export const publicUser = row => row ? ({
  id: row.id, username: row.username, role: row.role, status: row.status, createdAt: row.created_at,
}) : null;

export function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validatePassword(password) {
  requireValue(typeof password === 'string' && password.length >= 12 && password.length <= 128,
    400, 'INVALID_PASSWORD', 'Use a password between 12 and 128 characters.');
}

function validateUsername(username) {
  requireValue(typeof username === 'string' && /^[a-zA-Z0-9_.-]{3,32}$/.test(username.trim()),
    400, 'INVALID_USERNAME', 'Use 3 to 32 letters, numbers, dots, underscores, or hyphens for your username.');
  return username.trim();
}

async function derivePassword(password, salt) {
  // Bound simultaneous memory-hard hashes as well as per-IP/account attempts.
  requireValue(activeDerivations < 2, 429, 'AUTH_BUSY', 'Sign-in is busy. Please try again shortly.');
  activeDerivations += 1;
  try {
    return await derive(password, Buffer.from(salt, 'hex'), passwordParameters.keyLength, {
      N: passwordParameters.N, r: passwordParameters.r, p: passwordParameters.p, maxmem,
    });
  } finally {
    activeDerivations -= 1;
  }
}

async function hashPassword(password) {
  const passwordSalt = randomBytes(16).toString('hex');
  return {
    passwordHash: (await derivePassword(password, passwordSalt)).toString('hex'),
    passwordSalt,
    passwordParameters: JSON.stringify(passwordParameters),
  };
}

async function verifyPassword(password, row) {
  // Missing users incur the same scrypt work as an incorrect password.
  const result = await derivePassword(password, row?.password_salt || dummySalt);
  return Boolean(row && safeEqual(result.toString('hex'), row.password_hash));
}

export function createAuth({ db, statements: sql }) {
  const rateLimit = db.transaction((ip, username, action) => {
    const now = Date.now();
    sql.deleteExpiredRateLimits.run(now);
    const buckets = [[`${action}:ip:${ip}`, action === 'register' ? 10 : 50]];
    if (username) buckets.push([`${action}:account:${username.toLowerCase()}`, 10]);
    for (const [key, limit] of buckets) {
      const keyHash = digest(key);
      const current = sql.getRateLimit.get(keyHash);
      requireValue(!current || current.attempts < limit, 429, 'RATE_LIMITED', 'Too many attempts. Try again in 15 minutes.');
      sql.incrementRateLimit.run({ keyHash, expiresAt: now + rateWindow });
    }
  });

  function newSession(user) {
    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    const now = Date.now();
    sql.deleteExpiredSessions.run(now);
    sql.insertSession.run({ tokenHash: digest(token), userId: user.id, csrfToken, createdAt: now, expiresAt: now + sessionLifetime });
    return { token, csrfToken, user: publicUser(user), maxAge: sessionLifetime };
  }

  const registerUser = db.transaction((username, credentials) => {
    const usernameKey = username.toLowerCase();
    requireValue(!sql.getUserByName.get(usernameKey), 409, 'USERNAME_UNAVAILABLE', 'Username is unavailable.');
    const id = randomUUID();
    sql.insertUser.run({ id, username, usernameKey, ...credentials, createdAt: new Date().toISOString() });
    return newSession(sql.getUser.get(id));
  });

  const finishLogin = db.transaction(snapshot => {
    const current = sql.getUser.get(snapshot.id);
    requireValue(current?.status === 'active' && current.password_hash === snapshot.password_hash,
      401, 'INVALID_CREDENTIALS', 'Username or password is incorrect.');
    sql.deleteRateLimit.run(digest(`login:account:${current.username_key}`));
    return newSession(current);
  });

  const finishPasswordChange = db.transaction((snapshot, tokenHash, credentials) => {
    const current = sql.getUser.get(snapshot.id);
    const session = sql.getSession.get({ tokenHash, now: Date.now() });
    requireValue(session && current?.status === 'active' && current.password_hash === snapshot.password_hash,
      401, 'SESSION_EXPIRED', 'Please sign in again.');
    sql.updatePassword.run({ id: current.id, ...credentials });
    sql.deleteUserSessions.run(current.id);
    return newSession(current);
  });

  return {
    async register(input, ip) {
      const username = validateUsername(input?.username);
      validatePassword(input?.password);
      rateLimit.immediate(ip, username, 'register');
      requireValue(!sql.getUserByName.get(username.toLowerCase()), 409, 'USERNAME_UNAVAILABLE', 'Username is unavailable.');
      return registerUser.immediate(username, await hashPassword(input.password));
    },
    async login(input, ip) {
      const username = validateUsername(input?.username);
      requireValue(typeof input?.password === 'string' && input.password.length <= 128,
        401, 'INVALID_CREDENTIALS', 'Username or password is incorrect.');
      rateLimit.immediate(ip, username, 'login');
      const user = sql.getUserByName.get(username.toLowerCase());
      const valid = await verifyPassword(input.password, user);
      if (!valid || user.status !== 'active') throw new ApiError(401, 'INVALID_CREDENTIALS', 'Username or password is incorrect.');
      return finishLogin.immediate(user);
    },
    session(token) {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
      const tokenHash = digest(token);
      const row = sql.getSession.get({ tokenHash, now: Date.now() });
      return row ? { user: publicUser(row), csrfToken: row.csrf_token, tokenHash } : null;
    },
    logout(tokenHash) { sql.deleteSession.run(tokenHash); },
    async changePassword(session, input, ip) {
      requireValue(typeof input?.currentPassword === 'string' && input.currentPassword.length <= 128,
        400, 'INVALID_PASSWORD', 'Enter your current password.');
      validatePassword(input?.newPassword);
      rateLimit.immediate(ip, session.user.username, 'password');
      const current = sql.getUser.get(session.user.id);
      requireValue(await verifyPassword(input.currentPassword, current), 400, 'INVALID_PASSWORD', 'Current password is incorrect.');
      return finishPasswordChange.immediate(current, session.tokenHash, await hashPassword(input.newPassword));
    },
  };
}
