import { createHash, randomInt } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const VERIFICATION_FILE = "email-verifications.json";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function codeHash(email, code) {
  return createHash("sha256").update(`${normalizeEmail(email)}:${String(code)}`).digest("hex");
}

async function readRecords(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

async function writeRecords(path, records) {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
  await chmod(path, 0o600);
}

export function createVerificationStore({ directory, ttlMs = 10 * 60 * 1000, maxAttempts = 5, codeGenerator = () => String(randomInt(100000, 1000000)), now = () => Date.now() } = {}) {
  if (!directory) throw new Error("验证码存储需要配置 directory");
  const path = join(directory, VERIFICATION_FILE);
  return {
    async issue(email) {
      const normalized = normalizeEmail(email);
      const code = String(codeGenerator()).padStart(6, "0").slice(0, 6);
      const records = await readRecords(path);
      records[normalized] = { hash: codeHash(normalized, code), attempts: 0, expiresAt: now() + ttlMs, createdAt: new Date(now()).toISOString() };
      await writeRecords(path, records);
      return { code, expiresAt: records[normalized].expiresAt };
    },
    async verify(email, code) {
      const normalized = normalizeEmail(email);
      const records = await readRecords(path);
      const record = records[normalized];
      if (!record) return { ok: false, code: "CODE_NOT_FOUND" };
      if (record.expiresAt <= now()) {
        delete records[normalized];
        await writeRecords(path, records);
        return { ok: false, code: "CODE_EXPIRED" };
      }
      if (record.attempts >= maxAttempts) return { ok: false, code: "CODE_ATTEMPTS_EXCEEDED" };
      if (record.hash !== codeHash(normalized, code)) {
        record.attempts += 1;
        await writeRecords(path, records);
        return { ok: false, code: record.attempts >= maxAttempts ? "CODE_ATTEMPTS_EXCEEDED" : "CODE_INVALID" };
      }
      delete records[normalized];
      await writeRecords(path, records);
      return { ok: true };
    },
  };
}

export { VERIFICATION_FILE };
