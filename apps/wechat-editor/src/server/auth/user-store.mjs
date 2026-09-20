import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const scrypt = promisify(scryptCallback);
const USERS_FILE = "users.json";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw Object.assign(new Error("邮箱格式不正确。"), { code: "EMAIL_INVALID", status: 400 });
  }
  return email;
}

async function passwordRecord(password) {
  const value = String(password || "");
  if (value.length < 12 || value.length > 256) throw Object.assign(new Error("密码至少需要 12 个字符。"), { code: "PASSWORD_WEAK", status: 400 });
  const salt = randomBytes(16);
  const derived = await scrypt(value, salt, 64);
  return `scrypt:${salt.toString("base64url")}:${Buffer.from(derived).toString("base64url")}`;
}

async function passwordMatches(password, record) {
  const [algorithm, saltText, hashText] = String(record || "").split(":");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = Buffer.from(await scrypt(String(password || ""), Buffer.from(saltText, "base64url"), expected.length));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readUsers(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeUsers(path, users) {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(users, null, 2)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
  await chmod(path, 0o600);
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export function createUserStore({ directory } = {}) {
  if (!directory) throw new Error("用户存储需要配置 directory");
  const path = join(directory, USERS_FILE);
  let lock = Promise.resolve();

  async function serial(operation) {
    const result = lock.then(operation, operation);
    lock = result.catch(() => {});
    return result;
  }

  return {
    async createPending({ email, password } = {}) {
      return serial(async () => {
        const normalized = validateEmail(email);
        const users = await readUsers(path);
        if (users.some((user) => user.email === normalized && user.status === "active")) throw Object.assign(new Error("该邮箱已经注册。"), { code: "EMAIL_EXISTS", status: 409 });
        const passwordHash = await passwordRecord(password);
        const existing = users.findIndex((user) => user.email === normalized);
        const timestamp = new Date().toISOString();
        const user = {
          id: existing >= 0 ? users[existing].id : `user-${randomUUID()}`,
          email: normalized,
          passwordHash,
          status: "pending",
          createdAt: existing >= 0 ? users[existing].createdAt : timestamp,
          updatedAt: timestamp,
          verifiedAt: null,
        };
        if (existing >= 0) users[existing] = user;
        else users.push(user);
        await writeUsers(path, users);
        return publicUser(user);
      });
    },
    async activate(email) {
      return serial(async () => {
        const normalized = validateEmail(email);
        const users = await readUsers(path);
        const index = users.findIndex((user) => user.email === normalized);
        if (index === -1) return null;
        const timestamp = new Date().toISOString();
        users[index] = { ...users[index], status: "active", verifiedAt: timestamp, updatedAt: timestamp };
        await writeUsers(path, users);
        return publicUser(users[index]);
      });
    },
    async verifyCredentials(email, password) {
      const normalized = normalizeEmail(email);
      const users = await readUsers(path);
      const user = users.find((item) => item.email === normalized && item.status === "active");
      if (!user || !await passwordMatches(password, user.passwordHash)) return null;
      return publicUser(user);
    },
    async getByEmail(email) {
      const users = await readUsers(path);
      return publicUser(users.find((item) => item.email === normalizeEmail(email)) || null);
    },
  };
}

export { normalizeEmail, passwordMatches, passwordRecord, USERS_FILE };
