import { build } from "esbuild";

await build({
  entryPoints: ["apps/wechat-editor/src/editor-codemirror.mjs"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  outfile: "apps/wechat-editor/dist/editor.js",
  sourcemap: false,
  legalComments: "none",
});

console.log("Built apps/wechat-editor/dist/editor.js");
