import { readFile } from "node:fs/promises";
import path from "node:path";

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const deepMerge = (...objects) => {
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
};

const readJsonIfExists = async (filePath) => {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(`无法读取 JSON 配置：${filePath}\n${error.message}`);
  }
};

export const loadReporterConfig = async (baseDir = process.cwd()) => {
  const publicConfig = await readJsonIfExists(path.join(baseDir, "tech-events-assistant.config.json"));
  const localConfig = await readJsonIfExists(path.join(baseDir, "tech-events-assistant.local.json"));
  return deepMerge(publicConfig, localConfig);
};

export const configuredRegionName = (config, fallback = "大湾区") => {
  const regionName = String(config?.eventSearch?.regionName ?? config?.regionName ?? "").trim();
  return regionName || fallback;
};

export const configuredEventTitle = (config, fallback = "大湾区活动") => {
  const regionName = configuredRegionName(config, fallback.replace(/活动$/, ""));
  return `${regionName}活动`;
};
