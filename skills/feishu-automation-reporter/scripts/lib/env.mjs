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

const isPlaceholderValue = (value) => {
  const normalized = String(value ?? "").trim();
  return (
    normalized === "" ||
    /^<[^>]+>$/.test(normalized) ||
    normalized.toLowerCase().includes("replace-me")
  );
};

const removePlaceholderValues = (values) => {
  const clean = {};
  for (const [key, value] of Object.entries(values)) {
    if (!isPlaceholderValue(value)) clean[key] = value;
  }
  return clean;
};

export const parseAssistantLocalConfig = (content) => {
  const config = JSON.parse(content);
  const push = config.push ?? {};
  const values = {};

  if (push.feishuWebhookUrl) values.FEISHU_WEBHOOK_URL = push.feishuWebhookUrl;
  if (push.feishuWebhookSecret) values.FEISHU_WEBHOOK_SECRET = push.feishuWebhookSecret;
  if (push.serverChanSendKey) values.SERVERCHAN_SENDKEY = push.serverChanSendKey;

  return removePlaceholderValues(values);
};

const readConfigValues = async (filePath) => {
  const content = await readFile(filePath, "utf8");
  if (path.basename(filePath) === "tech-events-assistant.local.json") {
    return parseAssistantLocalConfig(content);
  }
  return removePlaceholderValues(parseEnvFile(content));
};

export const loadLocalEnv = async (baseDir = process.cwd()) => {
  // 读取顺序：.env.local 兼容旧用户，新 local JSON 覆盖旧值；显式指定的 env 文件优先级最高。
  const envPaths = [
    path.resolve(baseDir, ".env.local"),
    path.resolve(baseDir, "tech-events-assistant.local.json"),
    process.env.FEISHU_ENV_FILE,
    process.env.SERVERCHAN_ENV_FILE,
  ].filter(Boolean);

  const values = {};
  for (const envPath of envPaths) {
    try {
      Object.assign(values, await readConfigValues(envPath));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return values;
};
