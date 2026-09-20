const DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_MODEL = "cogview-3-flash";

function providerError(message, code, status) {
  return Object.assign(new Error(message), { code, status });
}

export function createAiImageProvider({ apiKey = process.env.GLM_IMAGE_API_KEY || "", baseUrl = process.env.GLM_IMAGE_BASE_URL || DEFAULT_BASE_URL, model = process.env.GLM_IMAGE_MODEL || DEFAULT_MODEL, fetchImpl = globalThis.fetch } = {}) {
  if (!fetchImpl) throw new Error("当前 Node.js 没有可用的 fetch");
  return {
    model,
    async generateCover({ prompt, size = process.env.GLM_IMAGE_SIZE || "900x383" } = {}) {
      if (!apiKey) throw providerError("尚未配置 GLM-Image API Key。", "AI_NOT_CONFIGURED", 503);
      if (!String(prompt || "").trim()) throw providerError("生成封面需要封面提示词。", "AI_PROMPT_REQUIRED", 400);
      let response;
      try {
        response = await fetchImpl(`${String(baseUrl).replace(/\/$/, "")}/images/generations`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, prompt: String(prompt).slice(0, 1000), size }),
        });
      } catch {
        throw providerError("图像模型暂时不可用。", "AI_TEMPORARY", 503);
      }
      let body;
      try { body = await response.json(); } catch { body = null; }
      if (!response.ok) throw providerError(`图像模型请求失败（HTTP ${response.status}）`, response.status >= 500 ? "AI_TEMPORARY" : "AI_AUTH_FAILED", response.status);
      const url = body?.data?.[0]?.url || body?.data?.[0]?.image_url || body?.url;
      if (!url || !/^https?:\/\//i.test(url)) throw providerError("图像模型没有返回可下载的封面地址。", "AI_INVALID_IMAGE_RESPONSE", 502);
      return { url, requestId: body?.id || body?.request_id || null, model };
    },
  };
}
