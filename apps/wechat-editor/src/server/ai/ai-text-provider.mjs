const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

function safeText(value, max = 12000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max);
}

function providerError(message, code, status) {
  return Object.assign(new Error(message), { code, status });
}

async function readJson(response) {
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!response.ok) {
    const status = response.status;
    throw providerError(`文本模型请求失败（HTTP ${status}）`, status >= 500 ? "AI_TEMPORARY" : "AI_AUTH_FAILED", status);
  }
  return body;
}

function normalizeMetadata(value) {
  let object = value;
  if (typeof object === "string") {
    const cleaned = object.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    try { object = JSON.parse(cleaned); } catch { throw providerError("文本模型返回的元数据不是有效 JSON。", "AI_INVALID_JSON", 502); }
  }
  if (!object || typeof object !== "object") throw providerError("文本模型没有返回有效元数据。", "AI_INVALID_JSON", 502);
  const title = safeText(object.title, 80).trim();
  const digest = safeText(object.digest, 120).trim();
  const coverPrompt = safeText(object.coverPrompt || object.cover_prompt, 1000).trim();
  if (!title || !digest || !coverPrompt) throw providerError("文本模型返回的标题、摘要或封面提示词为空。", "AI_INVALID_JSON", 502);
  return { title, digest, coverPrompt };
}

export function createAiTextProvider({ apiKey = process.env.DEEPSEEK_API_KEY || "", baseUrl = process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL, model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL, fetchImpl = globalThis.fetch } = {}) {
  if (!fetchImpl) throw new Error("当前 Node.js 没有可用的 fetch");
  return {
    model,
    async generateMetadata({ markdown = "", currentTitle = "", tone = "克制、清晰、专业" } = {}) {
      if (!apiKey) throw providerError("尚未配置 DeepSeek API Key。", "AI_NOT_CONFIGURED", 503);
      const prompt = {
        title: "根据文章生成一个适合微信公众号的标题；如果已有标题则保留已有标题。",
        digest: "生成不超过 120 字的摘要。",
        coverPrompt: "生成适合公众号封面的中文图像提示词，描述主体、构图、色彩和氛围，不要包含文字。",
      };
      let response;
      try {
        response = await fetchImpl(`${String(baseUrl).replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            temperature: 0.4,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "你是微信公众号编辑助手，只返回 JSON，不要 markdown 代码围栏。字段必须是 title、digest、coverPrompt。" },
              { role: "user", content: JSON.stringify({ instructions: prompt, currentTitle: safeText(currentTitle, 80), tone, markdown: safeText(markdown) }) },
            ],
          }),
        });
      } catch (error) {
        throw providerError("文本模型暂时不可用。", "AI_TEMPORARY", 503);
      }
      const body = await readJson(response);
      const content = body?.choices?.[0]?.message?.content;
      const normalized = normalizeMetadata(content);
      const suppliedTitle = safeText(currentTitle, 80).trim();
      return { ...normalized, title: suppliedTitle || normalized.title, model };
    },
  };
}

export { normalizeMetadata };
