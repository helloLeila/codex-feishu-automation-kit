import { readFile } from "node:fs/promises";
import path from "node:path";

export const parseEnvFile = (content) => {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
};

export const loadLocalEnv = async () => {
  // 读取顺序：显式指定的 FEISHU_ENV_FILE / WECOM_ENV_FILE 优先，其次读取当前目录的 .env.local。
  // 这样同一份脚本可以同时适配本地目录、git worktree 和 CI。
  const envPaths = [
    process.env.FEISHU_ENV_FILE,
    process.env.WECOM_ENV_FILE,
    path.resolve(".env.local"),
  ].filter(Boolean);

  for (const envPath of envPaths) {
    try {
      return parseEnvFile(await readFile(envPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return {};
};
