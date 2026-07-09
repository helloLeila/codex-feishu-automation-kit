import { access, chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const CONFIG_FILE = "tech-events-assistant.config.json";
export const LOCAL_CONFIG_FILE = "tech-events-assistant.local.json";
export const EXAMPLE_CONFIG_FILE = "tech-events-assistant.config.example.json";
export const APP_CONFIG_DIR = "codex-feishu-automation-kit";

export const defaultAssistantConfig = {
  assistantName: "技术活动助手",
  schedule: {
    timezone: "Asia/Shanghai",
    window: "run-day-00:00-plus-15-days",
  },
  output: {
    language: "zh-CN",
    preferChineseTitles: true,
    quickCardsIncludeContent: true,
    hideAlreadyStartedOrEndedEvents: true,
    omitUnknownFieldsInPushCards: true,
  },
  push: {
    feishu: true,
    serverChan: true,
  },
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge(...objects) {
  const result = {};
  for (const object of objects) {
    if (!isPlainObject(object)) continue;
    for (const [key, value] of Object.entries(object)) {
      if (isPlainObject(value) && isPlainObject(result[key])) {
        result[key] = deepMerge(result[key], value);
      } else if (isPlainObject(value)) {
        result[key] = deepMerge(value);
      } else if (Array.isArray(value)) {
        result[key] = [...value];
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

async function readJsonIfExists(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(`无法读取 JSON 配置：${filePath}\n${error.message}`);
  }
}

export function resolveUserConfigDir() {
  const xdgConfigHome = String(process.env.XDG_CONFIG_HOME ?? "").trim();
  const baseDir = xdgConfigHome || path.join(process.env.HOME || homedir(), ".config");
  return path.join(baseDir, APP_CONFIG_DIR);
}

export function resolveUserLocalConfigPath() {
  return path.join(resolveUserConfigDir(), LOCAL_CONFIG_FILE);
}

export function resolveCodexHomeLocalConfigPath() {
  const codexHome = String(process.env.CODEX_HOME ?? "").trim();
  if (!codexHome) return null;
  return path.join(codexHome, APP_CONFIG_DIR, LOCAL_CONFIG_FILE);
}

export async function loadAssistantConfig(rootDir = process.cwd()) {
  const publicConfig = await readJsonIfExists(path.join(rootDir, CONFIG_FILE));
  const localConfig = await readJsonIfExists(path.join(rootDir, LOCAL_CONFIG_FILE));
  return deepMerge(defaultAssistantConfig, publicConfig, localConfig);
}

function applySecretValue(target, key, value) {
  if (value === undefined || value === null) return;
  const trimmed = String(value).trim();
  if (trimmed === "") return;
  if (trimmed.toLowerCase() === "clear") {
    delete target[key];
    return;
  }
  target[key] = trimmed;
}

export function applySecretInputs(currentLocalConfig, inputs, options = {}) {
  if (options.save === false) {
    return {
      saved: false,
      config: structuredClone(currentLocalConfig),
    };
  }

  const config = deepMerge(currentLocalConfig);
  config.push = deepMerge(config.push ?? {});

  applySecretValue(config.push, "feishuWebhookUrl", inputs.feishuWebhookUrl);
  applySecretValue(config.push, "feishuWebhookSecret", inputs.feishuWebhookSecret);
  applySecretValue(config.push, "serverChanSendKey", inputs.serverChanSendKey);

  return {
    saved: true,
    config,
  };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function writeLocalConfig(rootDir, config) {
  const filePath = rootDir
    ? path.join(rootDir, LOCAL_CONFIG_FILE)
    : resolveUserLocalConfigPath();
  let backupPath = null;
  let backupCreated = false;

  if (await exists(filePath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupPath = `${filePath}.bak-${stamp}`;
    await copyFile(filePath, backupPath);
    backupCreated = true;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600);

  return {
    filePath,
    backupPath,
    backupCreated,
  };
}

export async function readLocalConfig(rootDir) {
  const filePath = rootDir
    ? path.join(rootDir, LOCAL_CONFIG_FILE)
    : resolveUserLocalConfigPath();
  return readJsonIfExists(filePath);
}

export function hasConfiguredPush(config) {
  return Boolean(
    config?.push?.feishuWebhookUrl ||
      config?.push?.serverChanSendKey ||
      process.env.FEISHU_WEBHOOK_URL ||
      process.env.SERVERCHAN_SENDKEY,
  );
}
