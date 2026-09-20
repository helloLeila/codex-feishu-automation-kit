const DEFAULT_MAX_BYTES = 12 * 1024 * 1024;
const SUPPORTED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function coverError(message, code, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

async function loadSharp(sharpImpl) {
  if (sharpImpl) return sharpImpl;
  try {
    const loaded = await import("sharp");
    return loaded.default || loaded;
  } catch {
    throw coverError("封面处理需要安装 sharp 依赖。", "SHARP_NOT_INSTALLED", 503);
  }
}

export function createCoverProcessor({ fetchImpl = globalThis.fetch, maxBytes = DEFAULT_MAX_BYTES, width = 900, height = 383, quality = 82, sharpImpl } = {}) {
  if (!fetchImpl) throw new Error("当前 Node.js 没有可用的 fetch");
  return {
    async processUrl(url) {
      if (!/^https?:\/\//i.test(String(url || ""))) throw coverError("封面地址必须是 HTTPS 或 HTTP 公网地址。", "COVER_URL_INVALID");
      let response;
      try { response = await fetchImpl(url, { redirect: "follow" }); } catch { throw coverError("封面下载失败。", "COVER_FETCH_FAILED", 502); }
      if (!response.ok) throw coverError(`封面下载失败（HTTP ${response.status}）。`, response.status >= 500 ? "COVER_FETCH_RETRYABLE" : "COVER_FETCH_FAILED", response.status);
      const mime = String(response.headers.get("content-type") || "").split(";", 1)[0].toLowerCase();
      if (!SUPPORTED_MIME.has(mime)) throw coverError(`封面格式不支持：${mime || "未知"}。`, "COVER_UNSUPPORTED_MIME");
      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > maxBytes) throw coverError("封面文件超过大小限制。", "COVER_TOO_LARGE");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > maxBytes) throw coverError("封面文件超过大小限制。", "COVER_TOO_LARGE");
      return this.processBuffer(bytes, { sourceUrl: url, sourceMime: mime });
    },
    async processBuffer(buffer, meta = {}) {
      const bytes = Buffer.from(buffer || []);
      if (!bytes.length || bytes.length > maxBytes) throw coverError("封面文件超过大小限制。", "COVER_TOO_LARGE");
      const sharp = await loadSharp(sharpImpl);
      let pipeline;
      try {
        pipeline = sharp(bytes, { failOn: "error" }).resize(width, height, { fit: "cover", position: "centre" }).jpeg({ quality, mozjpeg: true });
        const output = await pipeline.toBuffer({ resolveWithObject: true });
        const data = output.data || output;
        const info = output.info || {};
        if (!data.length || info.format && info.format !== "jpeg") throw coverError("封面转换失败。", "COVER_PROCESS_FAILED", 502);
        if (info.width && info.height && (info.width !== width || info.height !== height)) throw coverError("封面尺寸校验失败。", "COVER_DIMENSION_INVALID", 502);
        return { buffer: data, mime: "image/jpeg", width: info.width || width, height: info.height || height, size: data.length, sourceUrl: meta.sourceUrl || null };
      } catch (error) {
        if (error.code?.startsWith("COVER_")) throw error;
        throw coverError("封面裁剪或压缩失败。", "COVER_PROCESS_FAILED", 502);
      }
    },
  };
}

export { DEFAULT_MAX_BYTES, SUPPORTED_MIME };
