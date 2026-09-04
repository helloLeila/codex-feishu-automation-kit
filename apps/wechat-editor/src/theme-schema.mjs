import { createHash } from "node:crypto";
import { chmod, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const THEME_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;

const DEFAULT_COLORS = Object.freeze({
  primary: "#176b5b",
  primaryDark: "#10483d",
  accent: "#79a691",
  text: "#252a2e",
  heading: "#1f2c28",
  muted: "#6b7280",
  surface: "#f6f8f7",
  border: "#e5e7eb",
  quoteBg: "#eef6f1",
  quoteText: "#52615a",
  quoteBorder: "#79a691",
  codeBg: "#f1f6f3",
  codeText: "#29463a",
  tableHead: "#eef6f1",
});

const DEFAULT_TYPOGRAPHY = Object.freeze({
  bodySize: 16,
  lineHeight: 1.8,
  h1Size: 25,
  h2Size: 20,
  h3Size: 17,
  captionSize: 13,
});

const DEFAULT_SPACING = Object.freeze({ paragraph: 16, section: 30, image: 20 });

const DEFAULT_COMPONENTS = Object.freeze({
  heading2: { style: "left-border", borderWidth: 4 },
  quote: { style: "soft-background" },
  image: { borderRadius: 4 },
});

const NUMBER_RULES = {
  bodySize: [12, 32, "字号"],
  lineHeight: [1.2, 2.6, "行高"],
  h1Size: [18, 48, "字号"],
  h2Size: [16, 36, "字号"],
  h3Size: [14, 30, "字号"],
  captionSize: [10, 20, "字号"],
  paragraph: [0, 64, "段落间距"],
  section: [0, 96, "章节间距"],
  image: [0, 96, "图片间距"],
};

const clone = (value) => JSON.parse(JSON.stringify(value));

function createThemeError(message, code = "THEME_INVALID", status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function flattenedValues(input, keys) {
  return keys.reduce((values, key) => {
    if (input?.[key] !== undefined) values[key] = input[key];
    return values;
  }, {});
}

/**
 * Convert both the on-disk nested format and the editor's flattened runtime
 * format into one stable JSON shape. Unknown top-level keys are intentionally
 * ignored so a theme can safely be imported from a newer editor version.
 */
export function normalizeTheme(input = {}, { id, version } = {}) {
  const source = input && typeof input === "object" ? input : {};
  const colors = {
    ...DEFAULT_COLORS,
    ...(source.colors && typeof source.colors === "object" ? source.colors : {}),
    ...flattenedValues(source, Object.keys(DEFAULT_COLORS)),
  };
  const typography = {
    ...DEFAULT_TYPOGRAPHY,
    ...(source.typography && typeof source.typography === "object" ? source.typography : {}),
    ...flattenedValues(source, Object.keys(DEFAULT_TYPOGRAPHY)),
  };
  const spacing = {
    ...DEFAULT_SPACING,
    ...(source.spacing && typeof source.spacing === "object" ? source.spacing : {}),
    ...flattenedValues(source, Object.keys(DEFAULT_SPACING)),
  };
  const components = {
    ...clone(DEFAULT_COMPONENTS),
    ...(source.components && typeof source.components === "object" ? source.components : {}),
  };
  if (source.imageRadius !== undefined) {
    components.image = { ...components.image, borderRadius: source.imageRadius };
  }

  const normalized = {
    id: String(id ?? source.id ?? "custom-theme").trim(),
    name: String(source.name ?? "自定义主题").trim().slice(0, 80),
    version: Number.isInteger(version) ? version : (Number.isInteger(source.version) ? source.version : 1),
    colors,
    typography,
    spacing,
    components,
  };
  assertValidTheme(normalized);
  return normalized;
}

export function validateTheme(theme = {}) {
  const errors = [];
  if (!theme || typeof theme !== "object" || Array.isArray(theme)) {
    return { valid: false, errors: ["主题必须是 JSON 对象"] };
  }
  if (typeof theme.id !== "string" || !THEME_ID.test(theme.id)) {
    errors.push("主题 id 只能包含小写字母、数字和连字符，长度为 2-64 个字符");
  }
  if (typeof theme.name !== "string" || !theme.name.trim()) errors.push("主题名称不能为空");
  if (theme.name?.length > 80) errors.push("主题名称不能超过 80 个字符");
  if (!Number.isInteger(theme.version) || theme.version < 1) errors.push("主题版本必须是正整数");

  if (!theme.colors || typeof theme.colors !== "object" || Array.isArray(theme.colors)) {
    errors.push("主题必须包含 colors 对象");
  } else {
    for (const [key, value] of Object.entries(theme.colors)) {
      if (!HEX_COLOR.test(String(value))) errors.push(`颜色 ${key} 必须是 6 位十六进制颜色`);
    }
  }

  if (!theme.typography || typeof theme.typography !== "object" || Array.isArray(theme.typography)) {
    errors.push("主题必须包含 typography 对象");
  } else {
    for (const key of ["bodySize", "lineHeight", "h1Size", "h2Size", "h3Size", "captionSize"]) {
      const [min, max, label] = NUMBER_RULES[key];
      if (!(key in theme.typography)) continue;
      const value = Number(theme.typography[key]);
      if (!Number.isFinite(value) || value < min || value > max) errors.push(`${label} ${key} 必须在 ${min}-${max} 范围内`);
    }
  }

  if (theme.spacing && typeof theme.spacing === "object") {
    for (const key of ["paragraph", "section", "image"]) {
      const [min, max, label] = NUMBER_RULES[key];
      const value = Number(theme.spacing[key]);
      if (!Number.isFinite(value) || value < min || value > max) errors.push(`${label} ${key} 必须在 ${min}-${max} 范围内`);
    }
  }

  const radius = Number(theme.components?.image?.borderRadius);
  if (!Number.isFinite(radius) || radius < 0 || radius > 32) errors.push("图片圆角必须在 0-32 范围内");
  const borderWidth = Number(theme.components?.heading2?.borderWidth);
  if (!Number.isFinite(borderWidth) || borderWidth < 0 || borderWidth > 12) errors.push("标题边框宽度必须在 0-12 范围内");
  return { valid: errors.length === 0, errors };
}

export function assertValidTheme(theme) {
  const result = validateTheme(theme);
  if (!result.valid) throw createThemeError(result.errors.join("；"));
  return theme;
}

export function nextThemeVersion(theme = {}) {
  const version = Number(theme.version);
  return Number.isInteger(version) && version > 0 ? version + 1 : 1;
}

/**
 * Adapt the persisted nested theme to the flattened token object consumed by
 * the current browser renderer. This keeps the file/API contract stable while
 * allowing the editor to use the same object shape as its built-in themes.
 */
export function toRuntimeTheme(theme = {}) {
  const normalized = normalizeTheme(theme);
  return {
    id: normalized.id,
    name: normalized.name,
    version: normalized.version,
    ...normalized.colors,
    ...normalized.typography,
    ...normalized.spacing,
    imageRadius: normalized.components.image.borderRadius,
    heading2Style: normalized.components.heading2.style,
    heading2BorderWidth: normalized.components.heading2.borderWidth,
    quoteStyle: normalized.components.quote.style,
  };
}

export function slugifyThemeName(name = "theme") {
  const normalized = String(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const ascii = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  if (ascii) return ascii;
  const digest = createHash("sha1").update(String(name)).digest("hex").slice(0, 10);
  return `theme-${digest}`;
}

function customThemeId(name, existingIds = new Set()) {
  const base = `custom-${slugifyThemeName(name)}`;
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) id = `${base}-${suffix++}`;
  return id;
}

async function writeThemeFile(path, theme) {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(theme, null, 2)}\n`, { mode: 0o600 });
  await chmod(tempPath, 0o600);
  await rename(tempPath, path);
  await chmod(path, 0o600);
}

function decorate(theme, source) {
  return { ...clone(theme), source, readOnly: source === "builtin" };
}

async function readThemeFile(path) {
  const parsed = JSON.parse(await readFile(path, "utf8"));
  return normalizeTheme(parsed);
}

export function createThemeStore({ directory, builtinDirectory } = {}) {
  if (!directory) throw new Error("主题存储需要配置 directory");
  if (!builtinDirectory) throw new Error("主题存储需要配置 builtinDirectory");
  const themesDirectory = join(directory, "themes");

  async function listBuiltins() {
    let entries;
    try {
      entries = await readdir(builtinDirectory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).sort((a, b) => a.name.localeCompare(b.name));
    return Promise.all(files.map(async (entry) => decorate(await readThemeFile(join(builtinDirectory, entry.name)), "builtin")));
  }

  async function listCustoms() {
    let entries;
    try {
      entries = await readdir(themesDirectory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).sort((a, b) => a.name.localeCompare(b.name));
    return Promise.all(files.map(async (entry) => decorate(await readThemeFile(join(themesDirectory, entry.name)), "custom")));
  }

  async function allThemes() {
    return [...await listBuiltins(), ...await listCustoms()];
  }

  return {
    directory,
    themesDirectory,

    async list() {
      return allThemes();
    },

    async get(id) {
      const normalizedId = String(id || "");
      const builtin = (await listBuiltins()).find((theme) => theme.id === normalizedId);
      if (builtin) return builtin;
      if (!THEME_ID.test(normalizedId)) return null;
      try {
        return decorate(await readThemeFile(join(themesDirectory, `${normalizedId}.json`)), "custom");
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },

    async create(input = {}) {
      const source = input?.theme && typeof input.theme === "object" ? input.theme : input;
      const existing = await allThemes();
      const existingIds = new Set(existing.map((theme) => theme.id));
      let id = String(source.id || "").trim();
      if (!id) id = customThemeId(source.name || "theme", existingIds);
      if (!id.startsWith("custom-")) id = `custom-${slugifyThemeName(id)}`;
      if (existingIds.has(id)) throw createThemeError(`主题 ${id} 已存在`, "THEME_ALREADY_EXISTS", 409);
      const theme = normalizeTheme({ ...source, id, version: 1 });
      await writeThemeFile(join(themesDirectory, `${theme.id}.json`), theme);
      return decorate(theme, "custom");
    },

    async update(id, input = {}) {
      const current = await this.get(id);
      if (!current) return null;
      if (current.source === "builtin") throw createThemeError("内置主题只读，不能修改", "BUILTIN_THEME_READ_ONLY", 403);
      const source = input?.theme && typeof input.theme === "object" ? input.theme : input;
      const merged = {
        ...current,
        ...source,
        id: current.id,
        version: nextThemeVersion(current),
        colors: { ...current.colors, ...(source.colors || {}) },
        typography: { ...current.typography, ...(source.typography || {}) },
        spacing: { ...current.spacing, ...(source.spacing || {}) },
        components: {
          ...current.components,
          ...(source.components || {}),
          heading2: { ...current.components.heading2, ...(source.components?.heading2 || {}) },
          quote: { ...current.components.quote, ...(source.components?.quote || {}) },
          image: { ...current.components.image, ...(source.components?.image || {}) },
        },
      };
      const theme = normalizeTheme(merged, { id: current.id, version: nextThemeVersion(current) });
      await writeThemeFile(join(themesDirectory, `${theme.id}.json`), theme);
      return decorate(theme, "custom");
    },

    async remove(id) {
      const current = await this.get(id);
      if (!current) return false;
      if (current.source === "builtin") throw createThemeError("内置主题只读，不能删除", "BUILTIN_THEME_READ_ONLY", 403);
      const { unlink } = await import("node:fs/promises");
      await unlink(join(themesDirectory, `${current.id}.json`));
      return true;
    },
  };
}

export { DEFAULT_COLORS, DEFAULT_COMPONENTS, DEFAULT_SPACING, DEFAULT_TYPOGRAPHY, HEX_COLOR, THEME_ID };
