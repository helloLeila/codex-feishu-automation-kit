const DEFAULT_API_BASE_URL = 'https://api.weixin.qq.com';
const ERROR_HINTS = {
  40001: 'AppSecret 错误或 access_token 无效，请重新核对 AppID / AppSecret。',
  40005: '图片格式不受支持；正文图片请使用 JPG/PNG。',
  40009: '图片尺寸过大，请压缩后重试。',
  40125: 'AppSecret 不合法，请检查大小写和前后空格。',
  40164: '调用接口的出口 IP 不在微信 IP 白名单中。',
  45166: '正文 HTML 不符合微信草稿限制，请检查内容长度、标签和图片 URL。',
  IMAGE_URL_UNSUPPORTED: '正文图片必须使用 HTTPS 公网地址；请先把图片上传到 OSS 或其他图床。',
  IMAGE_FETCH_FAILED: '无法读取正文图片，请检查图片地址是否公开可访问。',
  IMAGE_UPLOAD_FAILED: '正文图片上传到微信失败，草稿尚未提交；请稍后重试。',
};

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_RETRY_DELAYS = [250, 750];

function encodeQuery(params) {
  return new URLSearchParams(params).toString();
}

async function readResponse(response) {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { errcode: response.ok ? 0 : -1, errmsg: text || response.statusText };
  }
  if (!response.ok || (typeof body.errcode === 'number' && body.errcode !== 0)) {
    const error = new Error(ERROR_HINTS[body.errcode] || body.errmsg || `微信接口请求失败（HTTP ${response.status}）`);
    error.code = body.errcode ?? response.status;
    error.response = body;
    throw error;
  }
  return body;
}

export function createWeChatClient({ appId, appSecret, apiBaseUrl = DEFAULT_API_BASE_URL, fetchImpl = globalThis.fetch } = {}) {
  if (!fetchImpl) throw new Error('当前 Node.js 没有可用的 fetch');
  let cachedToken = null;
  const imageCache = new Map();

  async function accessToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) return cachedToken.value;
    if (!appId || !appSecret) throw new Error('尚未配置微信公众号 AppID / AppSecret');
    const url = `${apiBaseUrl}/cgi-bin/token?${encodeQuery({ appid: appId, secret: appSecret, grant_type: 'client_credential' })}`;
    const body = await readResponse(await fetchImpl(url));
    cachedToken = { value: body.access_token, expiresAt: Date.now() + Math.max(60, Number(body.expires_in || 7200)) * 1000 };
    return cachedToken.value;
  }

  async function jsonPost(path, payload) {
    const token = await accessToken();
    const url = `${apiBaseUrl}${path}?access_token=${encodeURIComponent(token)}`;
    return readResponse(await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    }));
  }

  function isWechatHostedImage(source) {
    return /^https:\/\/mmbiz\d*\.qpic\.cn\//i.test(source);
  }

  function imageFilename(source, contentType) {
    try {
      const pathname = new URL(source).pathname;
      const name = pathname.split('/').filter(Boolean).pop() || 'article-image';
      if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
      return `${name}${contentType === 'image/png' ? '.png' : '.jpg'}`;
    } catch {
      return `article-image${contentType === 'image/png' ? '.png' : '.jpg'}`;
    }
  }

  async function uploadContentImage(source) {
    if (isWechatHostedImage(source)) return source;
    if (!/^https:\/\//i.test(source)) {
      throw Object.assign(new Error(ERROR_HINTS.IMAGE_URL_UNSUPPORTED), { code: 'IMAGE_URL_UNSUPPORTED' });
    }
    if (imageCache.has(source)) return imageCache.get(source);

    let response;
    let lastError;
    for (let attempt = 0; attempt <= IMAGE_RETRY_DELAYS.length; attempt += 1) {
      try {
        response = await fetchImpl(source, { redirect: 'follow' });
        if (response.ok) break;
        lastError = new Error(`HTTP ${response.status}`);
        if (response.status < 500 || attempt === IMAGE_RETRY_DELAYS.length) break;
      } catch (error) {
        lastError = error;
        if (attempt === IMAGE_RETRY_DELAYS.length) break;
      }
      await new Promise((resolve) => setTimeout(resolve, IMAGE_RETRY_DELAYS[attempt]));
    }
    if (!response?.ok) {
      throw Object.assign(new Error(`${ERROR_HINTS.IMAGE_FETCH_FAILED}（${lastError?.message || '请求失败'}）`), { code: 'IMAGE_FETCH_FAILED' });
    }
    const contentType = (response.headers.get('content-type') || '').split(';', 1)[0].toLowerCase();
    if (!SUPPORTED_IMAGE_TYPES.has(contentType)) {
      throw Object.assign(new Error(`${ERROR_HINTS.IMAGE_UPLOAD_FAILED}（仅支持 JPG/PNG，当前为 ${contentType || '未知类型'}）`), { code: 'IMAGE_UPLOAD_FAILED' });
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) {
      throw Object.assign(new Error(`${ERROR_HINTS.IMAGE_UPLOAD_FAILED}（图片大小必须在 10MB 以内）`), { code: 'IMAGE_UPLOAD_FAILED' });
    }

    const token = await accessToken();
    const form = new FormData();
    form.append('media', new Blob([bytes], { type: contentType }), imageFilename(source, contentType));
    let uploaded;
    try {
      const url = `${apiBaseUrl}/cgi-bin/media/uploadimg?${encodeQuery({ access_token: token })}`;
      uploaded = await readResponse(await fetchImpl(url, { method: 'POST', body: form }));
    } catch (error) {
      if (error.code === 'IMAGE_UPLOAD_FAILED') throw error;
      throw Object.assign(new Error(`${ERROR_HINTS.IMAGE_UPLOAD_FAILED}（${error.message}）`), { code: 'IMAGE_UPLOAD_FAILED' });
    }
    if (!uploaded.url) {
      throw Object.assign(new Error(ERROR_HINTS.IMAGE_UPLOAD_FAILED), { code: 'IMAGE_UPLOAD_FAILED' });
    }
    imageCache.set(source, uploaded.url);
    return uploaded.url;
  }

  function extractImageSources(content) {
    return [...String(content || '').matchAll(/<img\b[^>]*\bsrc=(['"])([^'"]+)\1/gi)]
      .map((match) => match[2].trim())
      .filter(Boolean);
  }

  async function inspectOneImage(source) {
    if (isWechatHostedImage(source)) return { source, status: 'already-hosted', message: '已是微信图片地址，无需上传。' };
    if (/^\/(?!\/)/.test(source) || /^\.\.?\//.test(source)) return { source, status: 'invalid', message: '本地图片路径无法被微信服务器访问。' };
    if (/^data:/i.test(source)) return { source, status: 'unsupported', message: '不支持 data: 内嵌图片，请使用 HTTPS 图片地址。' };
    if (!/^https:\/\//i.test(source)) return { source, status: 'unsupported', message: '图片必须使用 HTTPS 公网地址。' };
    let response;
    try {
      response = await fetchImpl(source, { method: 'HEAD', redirect: 'follow' });
    } catch (error) {
      return { source, status: 'unreachable', message: `${ERROR_HINTS.IMAGE_FETCH_FAILED}（${error.message}）` };
    }
    if (!response.ok) return { source, status: 'unreachable', message: `${ERROR_HINTS.IMAGE_FETCH_FAILED}（HTTP ${response.status}）` };
    const contentType = (response.headers.get('content-type') || '').split(';', 1)[0].toLowerCase();
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (!SUPPORTED_IMAGE_TYPES.has(contentType)) return { source, status: 'unsupported', contentType, message: '微信正文图片仅支持 JPG/PNG。' };
    if (contentLength > MAX_IMAGE_BYTES) return { source, status: 'invalid', contentType, bytes: contentLength, message: '图片大小必须在 10MB 以内。' };
    return { source, status: 'ready', contentType, bytes: contentLength || null, message: '图片可在同步时上传到微信。' };
  }

  async function inspectImages(content) {
    const sources = extractImageSources(content);
    const uniqueSources = [...new Set(sources)];
    const images = [];
    for (const source of uniqueSources) images.push(await inspectOneImage(source));
    const readyCount = images.filter((image) => image.status === 'ready' || image.status === 'already-hosted').length;
    const invalidCount = images.filter((image) => ['invalid', 'unreachable', 'unsupported'].includes(image.status)).length;
    return { ok: invalidCount === 0, count: sources.length, uniqueCount: uniqueSources.length, readyCount, invalidCount, pendingCount: 0, images };
  }

  async function prepareArticle(article) {
    const content = String(article?.content || '');
    const imageSources = [...content.matchAll(/<img\b[^>]*\bsrc=(['"])([^'"]+)\1/gi)].map((match) => match[2].trim());
    if (!imageSources.length) return article;
    const replacements = new Map();
    for (const source of new Set(imageSources)) replacements.set(source, await uploadContentImage(source));
    return {
      ...article,
      content: content.replace(/(<img\b[^>]*\bsrc=)(['"])([^'"]+)(\2)/gi, (full, prefix, quote, source) => `${prefix}${quote}${replacements.get(source.trim()) || source}${quote}`),
    };
  }

  return {
    async diagnose() {
      const token = await accessToken();
      return { ok: true, tokenCached: Boolean(token), apiBaseUrl };
    },
    async addDraft(article) {
      return jsonPost('/cgi-bin/draft/add', { articles: [{ article_type: 'news', ...(await prepareArticle(article)) }] });
    },
    async updateDraft(mediaId, article, index = 0) {
      return jsonPost('/cgi-bin/draft/update', { media_id: mediaId, index, articles: { article_type: 'news', ...(await prepareArticle(article)) } });
    },
    async deleteDraft(mediaId) {
      if (!mediaId) throw Object.assign(new Error('删除微信草稿需要 media_id。'), { code: 'DRAFT_MEDIA_ID_REQUIRED' });
      return jsonPost('/cgi-bin/draft/delete', { media_id: mediaId });
    },
    async getDraft(mediaId) {
      const token = await accessToken();
      const url = `${apiBaseUrl}/cgi-bin/draft/get?access_token=${encodeURIComponent(token)}`;
      return readResponse(await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ media_id: mediaId }),
      }));
    },
    inspectImages,
  };
}

export { readResponse };
