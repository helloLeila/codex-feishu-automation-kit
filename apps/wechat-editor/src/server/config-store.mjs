import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const DEFAULT_SETTINGS = {
  defaultAuthor: '',
  defaultTheme: 'clear-reading',
  defaultDigest: '',
  defaultThumbMediaId: '',
  needOpenComment: false,
  onlyFansCanComment: false,
  autoSync: false,
  syncDelayMs: 15000,
  syncPaused: false,
  apiBaseUrl: 'https://api.weixin.qq.com',
};

function defaultDirectory() {
  if (process.env.OPEN_WECHAT_EDITOR_CONFIG_DIR) return process.env.OPEN_WECHAT_EDITOR_CONFIG_DIR;
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', 'open-wechat-editor');
  if (platform() === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'open-wechat-editor');
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'open-wechat-editor');
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writePrivateJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(tempPath, 0o600);
  await rename(tempPath, path);
}

function envCredentials() {
  return {
    appId: process.env.WECHAT_APP_ID?.trim() || '',
    appSecret: process.env.WECHAT_APP_SECRET?.trim() || '',
  };
}

export function createConfigStore({ directory = defaultDirectory() } = {}) {
  const settingsPath = join(directory, 'settings.json');
  const credentialsPath = join(directory, 'credentials.json');

  return {
    directory,
    async load() {
      const [settings, fileCredentials] = await Promise.all([
        readJson(settingsPath, {}),
        readJson(credentialsPath, {}),
      ]);
      const env = envCredentials();
      return {
        settings: {
          ...DEFAULT_SETTINGS,
          ...settings,
          ...(process.env.WECHAT_API_BASE_URL ? { apiBaseUrl: process.env.WECHAT_API_BASE_URL } : {}),
          ...(process.env.WECHAT_DEFAULT_AUTHOR ? { defaultAuthor: process.env.WECHAT_DEFAULT_AUTHOR } : {}),
          ...(process.env.WECHAT_AUTO_SYNC ? { autoSync: process.env.WECHAT_AUTO_SYNC === '1' || process.env.WECHAT_AUTO_SYNC === 'true' } : {}),
        },
        credentials: {
          appId: env.appId || fileCredentials.appId || '',
          appSecret: env.appSecret || fileCredentials.appSecret || '',
        },
      };
    },
    async save({ settings = {}, credentials = {} } = {}) {
      const current = await this.load();
      const nextSettings = { ...current.settings, ...settings };
      const nextCredentials = {
        appId: credentials.appId?.trim() || current.credentials.appId,
        appSecret: credentials.appSecret?.trim() || current.credentials.appSecret,
      };
      await Promise.all([
        writePrivateJson(settingsPath, nextSettings),
        writePrivateJson(credentialsPath, nextCredentials),
      ]);
      return { settings: nextSettings, credentials: nextCredentials };
    },
    async getPublicConfig() {
      const current = await this.load();
      return {
        settings: current.settings,
        credentials: {
          appId: current.credentials.appId,
          secretConfigured: Boolean(current.credentials.appSecret),
        },
      };
    },
    async paths() {
      return { settingsPath, credentialsPath };
    },
  };
}

export { DEFAULT_SETTINGS, defaultDirectory };
