import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("editor shell exposes CodeMirror mount and build entry while preserving textarea fallback", async () => {
  const html = await readFile(new URL("../apps/wechat-editor/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../apps/wechat-editor/src/app.mjs", import.meta.url), "utf8");
  const build = await readFile(new URL("../scripts/build-wechat-editor.mjs", import.meta.url), "utf8");
  const styles = await readFile(new URL("../apps/wechat-editor/styles.css", import.meta.url), "utf8");
  assert.match(html, /id="markdown-editor"/);
  assert.match(html, /id="markdown-input"/);
  assert.match(app, /mountCodeMirror/);
  assert.match(app, /dist\/editor\.js/);
  assert.match(build, /esbuild/);
  assert.match(styles, /\.editor-fallback-note\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
});
