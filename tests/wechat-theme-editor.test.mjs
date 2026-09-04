import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

const validTheme = {
  name: "我的绿",
  colors: {
    primary: "#176b5b",
    text: "#252a2e",
  },
  typography: {
    bodySize: 16,
    lineHeight: 1.8,
  },
};

test("theme schema accepts a valid theme and rejects unsafe colors and typography", async () => {
  const { validateTheme, normalizeTheme, nextThemeVersion } = await import(
    "../apps/wechat-editor/src/theme-schema.mjs",
  );

  const normalized = normalizeTheme({ id: "custom-my-green", version: 1, ...validTheme });
  const result = validateTheme(normalized);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(normalized.colors.primary, "#176b5b");
  assert.equal(normalized.typography.bodySize, 16);
  assert.equal(normalized.typography.lineHeight, 1.8);
  assert.equal(nextThemeVersion(normalized), 2);

  const invalidColor = validateTheme({
    id: "custom-bad",
    name: "坏主题",
    colors: { primary: "javascript:alert(1)", text: "#252a2e" },
    typography: { bodySize: 16, lineHeight: 1.8 },
  });
  assert.equal(invalidColor.valid, false);
  assert.ok(invalidColor.errors.some((error) => error.includes("颜色")));

  const invalidType = validateTheme({
    id: "custom-bad",
    name: "坏主题",
    colors: { primary: "#176b5b", text: "#252a2e" },
    typography: { bodySize: 88, lineHeight: 0.2 },
  });
  assert.equal(invalidType.valid, false);
  assert.ok(invalidType.errors.some((error) => error.includes("字号")));
  assert.ok(invalidType.errors.some((error) => error.includes("行高")));
  assert.throws(
    () => normalizeTheme({ ...validTheme, colors: { ...validTheme.colors, primary: "#fff" } }),
    (error) => error.code === "THEME_INVALID",
  );
});

test("theme store lists built-ins as read-only and versions custom themes", async () => {
  const { createThemeStore } = await import(
    "../apps/wechat-editor/src/theme-schema.mjs",
  );
  const directory = await mkdtemp(join(tmpdir(), "open-wechat-themes-"));
  const builtinDirectory = join(process.cwd(), "apps", "wechat-editor", "themes");
  try {
    const store = createThemeStore({ directory, builtinDirectory });
    const builtIns = await store.list();
    const clearReading = builtIns.find((theme) => theme.id === "clear-reading");
    assert.ok(clearReading);
    assert.equal(clearReading.readOnly, true);
    assert.equal(clearReading.source, "builtin");

    const created = await store.create(validTheme);
    assert.match(created.id, /^custom-/);
    assert.equal(created.version, 1);
    assert.equal(created.readOnly, false);
    assert.equal(created.source, "custom");

    const file = await stat(join(directory, "themes", `${created.id}.json`));
    assert.equal(file.mode & 0o777, 0o600);
    assert.match(await readFile(join(directory, "themes", `${created.id}.json`), "utf8"), /"version": 1/);

    const updated = await store.update(created.id, {
      name: "我的绿 · 修改版",
      colors: { primary: "#2f8a5e" },
    });
    assert.equal(updated.version, 2);
    assert.equal(updated.colors.primary, "#2f8a5e");
    assert.equal((await store.get(created.id)).version, 2);

    await assert.rejects(
      () => store.update("clear-reading", { name: "不能改内置" }),
      (error) => error.code === "BUILTIN_THEME_READ_ONLY",
    );
    await assert.rejects(
      () => store.remove("clear-reading"),
      (error) => error.code === "BUILTIN_THEME_READ_ONLY",
    );

    assert.equal(await store.remove(created.id), true);
    assert.equal(await store.get(created.id), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("editor server exposes theme CRUD routes through its theme store", async () => {
  const { createEditorServer } = await import("../scripts/start-wechat-editor.mjs");
  const directory = await mkdtemp(join(tmpdir(), "open-wechat-theme-api-"));
  try {
    const { themeStore, handleApi } = createEditorServer({ port: 0, configDirectory: directory });
    assert.ok(themeStore);
    assert.equal(typeof themeStore.list, "function");
    assert.equal(typeof themeStore.create, "function");
    assert.equal(typeof themeStore.update, "function");
    assert.equal(typeof themeStore.remove, "function");

    async function call(method, pathname, body) {
      const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
      request.method = method;
      request.headers = {};
      const response = {
        status: null,
        payload: null,
        writeHead(status) { this.status = status; },
        end(payload = "") { this.payload = payload ? JSON.parse(payload) : {}; },
      };
      assert.equal(await handleApi(request, response, pathname), true);
      return response;
    }

    const listed = await call("GET", "/api/themes");
    assert.equal(listed.status, 200);
    assert.ok(listed.payload.themes.some((theme) => theme.id === "clear-reading"));

    const created = await call("POST", "/api/themes", validTheme);
    assert.equal(created.status, 201);
    assert.match(created.payload.theme.id, /^custom-/);
    const id = created.payload.theme.id;

    const fetched = await call("GET", `/api/themes/${id}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.payload.theme.version, 1);

    const updated = await call("PUT", `/api/themes/${id}`, { colors: { primary: "#2f8a5e" } });
    assert.equal(updated.status, 200);
    assert.equal(updated.payload.theme.version, 2);
    assert.equal(updated.payload.theme.colors.primary, "#2f8a5e");

    const invalid = await call("PUT", `/api/themes/${id}`, { colors: { primary: "#fff" } });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.payload.code, "THEME_INVALID");

    const builtinUpdate = await call("PUT", "/api/themes/clear-reading", { name: "不能改" });
    assert.equal(builtinUpdate.status, 403);
    assert.equal(builtinUpdate.payload.code, "BUILTIN_THEME_READ_ONLY");

    const removed = await call("DELETE", `/api/themes/${id}`);
    assert.equal(removed.status, 200);
    assert.equal((await call("GET", `/api/themes/${id}`)).status, 404);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
