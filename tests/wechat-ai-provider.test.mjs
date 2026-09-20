import assert from "node:assert/strict";
import test from "node:test";

test("DeepSeek provider validates metadata JSON and keeps secret out of errors", async () => {
  const { createAiTextProvider } = await import("../apps/wechat-editor/src/server/ai/ai-text-provider.mjs");
  const provider = createAiTextProvider({ apiKey: "secret-key", fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: "标题", digest: "摘要", coverPrompt: "封面" }) } }] }), { status: 200 }) });
  const result = await provider.generateMetadata({ markdown: "# 正文" });
  assert.deepEqual(result, { title: "标题", digest: "摘要", coverPrompt: "封面", model: "deepseek-chat" });
  const bad = createAiTextProvider({ apiKey: "secret-key", fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 }) });
  await assert.rejects(() => bad.generateMetadata({ markdown: "# 正文" }), (error) => error.code === "AI_INVALID_JSON" && !error.message.includes("secret-key"));
});

test("DeepSeek provider preserves a user supplied title even when the model suggests another", async () => {
  const { createAiTextProvider } = await import("../apps/wechat-editor/src/server/ai/ai-text-provider.mjs");
  const provider = createAiTextProvider({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ title: "模型标题", digest: "摘要", coverPrompt: "封面提示词" }) } }],
    }), { status: 200 }),
  });
  const result = await provider.generateMetadata({ markdown: "# 正文", currentTitle: "用户标题" });
  assert.equal(result.title, "用户标题");
});

test("GLM image provider returns an image URL and rejects malformed responses", async () => {
  const { createAiImageProvider } = await import("../apps/wechat-editor/src/server/ai/ai-image-provider.mjs");
  const provider = createAiImageProvider({ apiKey: "secret-key", fetchImpl: async () => new Response(JSON.stringify({ data: [{ url: "https://img.example/cover.png" }], id: "req-1" }), { status: 200 }) });
  assert.deepEqual(await provider.generateCover({ prompt: "简洁封面" }), { url: "https://img.example/cover.png", requestId: "req-1", model: "cogview-3-flash" });
});
