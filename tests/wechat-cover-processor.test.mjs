import assert from "node:assert/strict";
import test from "node:test";

test("cover processor rejects non-image content before optional sharp processing", async () => {
  const { createCoverProcessor } = await import("../apps/wechat-editor/src/server/media/cover-processor.mjs");
  const processor = createCoverProcessor({ fetchImpl: async () => new Response("text", { status: 200, headers: { "content-type": "text/plain" } }) });
  await assert.rejects(() => processor.processUrl("https://img.example/cover.txt"), (error) => error.code === "COVER_UNSUPPORTED_MIME");
});

test("cover processor limits remote downloads", async () => {
  const { createCoverProcessor } = await import("../apps/wechat-editor/src/server/media/cover-processor.mjs");
  const processor = createCoverProcessor({ maxBytes: 4, fetchImpl: async () => new Response(new Uint8Array([1, 2, 3, 4, 5]), { status: 200, headers: { "content-type": "image/png" } }) });
  await assert.rejects(() => processor.processUrl("https://img.example/cover.png"), (error) => error.code === "COVER_TOO_LARGE");
});
