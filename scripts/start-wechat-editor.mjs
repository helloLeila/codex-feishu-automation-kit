import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfigStore } from '../apps/wechat-editor/src/server/config-store.mjs';
import { createArticleStore } from '../apps/wechat-editor/src/server/article-store.mjs';
import { createWeChatClient } from '../apps/wechat-editor/src/server/wechat-client.mjs';
import { createThemeStore } from '../apps/wechat-editor/src/theme-schema.mjs';

const root = resolve(fileURLToPath(new URL('../apps/wechat-editor/', import.meta.url)));
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function readBody(request, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('请求体过大'), { code: 'PAYLOAD_TOO_LARGE' });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('请求体不是有效 JSON'), { code: 'INVALID_JSON' });
  }
}

function json(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

export function createEditorServer({ port = Number(process.env.PORT || 3210), host = process.env.HOST || '127.0.0.1', configDirectory, wechatClientFactory = createWeChatClient } = {}) {
  const configStore = configDirectory ? createConfigStore({ directory: configDirectory }) : createConfigStore();
  const articleStore = createArticleStore({ directory: configStore.directory });
  const themeStore = createThemeStore({ directory: configStore.directory, builtinDirectory: join(root, 'themes') });

  async function getClient() {
    const { settings, credentials } = await configStore.load();
    return wechatClientFactory({
      appId: credentials.appId,
      appSecret: credentials.appSecret,
      apiBaseUrl: settings.apiBaseUrl,
    });
  }

  async function updateArticleWechat(articleId, patch) {
    if (!articleId) return null;
    return articleStore.update(articleId, { wechat: patch });
  }

  async function updateArticlesByMediaId(mediaId, patch) {
    const articles = await articleStore.list();
    const matches = articles.filter((article) => article.wechat?.mediaId === mediaId);
    for (const article of matches) await articleStore.update(article.id, { wechat: patch });
    return matches.length;
  }

  function lifecycleErrorPatch(error) {
    return {
      status: 'sync-failed',
      lastSyncError: error?.message || '微信接口请求失败',
      retryable: true,
      failedAt: new Date().toISOString(),
    };
  }

  async function handleApi(request, response, pathname) {
    try {
      if (request.method === 'GET' && pathname === '/api/articles') {
        json(response, 200, { ok: true, articles: await articleStore.list() });
        return true;
      }

      if (request.method === 'POST' && pathname === '/api/articles') {
        const body = await readBody(request, 2 * 1024 * 1024);
        const article = await articleStore.create(body);
        json(response, 201, { ok: true, article });
        return true;
      }

      const articleMatch = pathname.match(/^\/api\/articles\/([^/]+)$/);
      if (articleMatch) {
        const articleId = decodeURIComponent(articleMatch[1]);
        if (request.method === 'GET') {
          const article = await articleStore.get(articleId);
          if (!article) {
            json(response, 404, { ok: false, code: 'ARTICLE_NOT_FOUND', message: '文章不存在。' });
            return true;
          }
          json(response, 200, { ok: true, article });
          return true;
        }
        if (request.method === 'PUT') {
          const body = await readBody(request, 2 * 1024 * 1024);
          const article = await articleStore.update(articleId, body);
          if (!article) {
            json(response, 404, { ok: false, code: 'ARTICLE_NOT_FOUND', message: '文章不存在。' });
            return true;
          }
          json(response, 200, { ok: true, article });
          return true;
        }
        if (request.method === 'DELETE') {
          const removed = await articleStore.remove(articleId);
          if (!removed) {
            json(response, 404, { ok: false, code: 'ARTICLE_NOT_FOUND', message: '文章不存在。' });
            return true;
          }
          json(response, 200, { ok: true, id: articleId });
          return true;
        }
      }

      if (request.method === 'GET' && pathname === '/api/config') {
        json(response, 200, await configStore.getPublicConfig());
        return true;
      }

      if (request.method === 'GET' && pathname === '/api/themes') {
        json(response, 200, { ok: true, themes: await themeStore.list() });
        return true;
      }

      if (request.method === 'POST' && pathname === '/api/themes') {
        const body = await readBody(request, 128 * 1024);
        const theme = await themeStore.create(body.theme || body);
        json(response, 201, { ok: true, theme });
        return true;
      }

      const themeMatch = pathname.match(/^\/api\/themes\/([^/]+)$/);
      if (themeMatch) {
        const themeId = decodeURIComponent(themeMatch[1]);
        if (request.method === 'GET') {
          const theme = await themeStore.get(themeId);
          if (!theme) {
            json(response, 404, { ok: false, code: 'THEME_NOT_FOUND', message: '主题不存在。' });
            return true;
          }
          json(response, 200, { ok: true, theme });
          return true;
        }
        if (request.method === 'PUT' || request.method === 'PATCH') {
          const body = await readBody(request, 128 * 1024);
          const theme = await themeStore.update(themeId, body.theme || body);
          if (!theme) {
            json(response, 404, { ok: false, code: 'THEME_NOT_FOUND', message: '主题不存在。' });
            return true;
          }
          json(response, 200, { ok: true, theme });
          return true;
        }
        if (request.method === 'DELETE') {
          const removed = await themeStore.remove(themeId);
          if (!removed) {
            json(response, 404, { ok: false, code: 'THEME_NOT_FOUND', message: '主题不存在。' });
            return true;
          }
          json(response, 200, { ok: true, id: themeId });
          return true;
        }
      }

      if (request.method === 'PUT' && pathname === '/api/config') {
        const body = await readBody(request, 128 * 1024);
        const saved = await configStore.save({ settings: body.settings || {}, credentials: body.credentials || {} });
        json(response, 200, {
          settings: saved.settings,
          credentials: { appId: saved.credentials.appId, secretConfigured: Boolean(saved.credentials.appSecret) },
        });
        return true;
      }

      if (request.method === 'POST' && pathname === '/api/wechat/diagnose') {
        const client = await getClient();
        const result = await client.diagnose();
        json(response, 200, { ok: true, ...result, message: '微信接口连接成功；如果后台仍提示 40164，请把本机出口公网 IP 加入白名单。' });
        return true;
      }

      if (request.method === 'POST' && pathname === '/api/wechat/images/inspect') {
        const body = await readBody(request, 2 * 1024 * 1024);
        const content = body.content ?? body.html ?? '';
        const result = await (await getClient()).inspectImages(content);
        json(response, 200, result);
        return true;
      }

      if (request.method === 'POST' && pathname === '/api/wechat/draft/add') {
        const body = await readBody(request);
        if (!body.article?.title || !body.article?.content) {
          json(response, 400, { ok: false, code: 'ARTICLE_REQUIRED', message: '创建草稿前需要标题和正文。' });
          return true;
        }
        const articleId = body.articleId || body.article?.id;
        await updateArticleWechat(articleId, {
          status: 'creating',
          lastSyncError: null,
          retryable: false,
        });
        try {
          const result = await (await getClient()).addDraft(body.article);
          if (!result?.media_id) throw Object.assign(new Error('微信未返回草稿 media_id。'), { code: 'DRAFT_MEDIA_ID_MISSING' });
          await updateArticleWechat(articleId, {
            mediaId: result.media_id,
            index: Number.isInteger(body.index) ? body.index : 0,
            status: 'synced',
            lastSyncError: null,
            retryable: false,
            syncedAt: new Date().toISOString(),
          });
          json(response, 200, { ok: true, mediaId: result.media_id, articleId: articleId || null });
        } catch (error) {
          await updateArticleWechat(articleId, lifecycleErrorPatch(error));
          throw error;
        }
        return true;
      }

      if (request.method === 'POST' && pathname === '/api/wechat/draft/update') {
        const body = await readBody(request);
        if (!body.mediaId || !body.article?.title || !body.article?.content) {
          json(response, 400, { ok: false, code: 'DRAFT_UPDATE_REQUIRED', message: '更新草稿需要 media_id、标题和正文。' });
          return true;
        }
        const articleId = body.articleId || body.article?.id;
        await updateArticleWechat(articleId, {
          mediaId: body.mediaId,
          index: Number.isInteger(body.index) ? body.index : 0,
          status: 'syncing',
          lastSyncError: null,
          retryable: false,
        });
        try {
          await (await getClient()).updateDraft(body.mediaId, body.article, Number.isInteger(body.index) ? body.index : 0);
          await updateArticleWechat(articleId, {
            mediaId: body.mediaId,
            index: Number.isInteger(body.index) ? body.index : 0,
            status: 'synced',
            lastSyncError: null,
            retryable: false,
            syncedAt: new Date().toISOString(),
          });
          json(response, 200, { ok: true, mediaId: body.mediaId, articleId: articleId || null });
        } catch (error) {
          await updateArticleWechat(articleId, {
            mediaId: body.mediaId,
            index: Number.isInteger(body.index) ? body.index : 0,
            ...lifecycleErrorPatch(error),
          });
          throw error;
        }
        return true;
      }

      const getDraftMatch = pathname.match(/^\/api\/wechat\/draft\/([^/]+)$/);
      if (request.method === 'DELETE' && getDraftMatch) {
        const mediaId = decodeURIComponent(getDraftMatch[1]);
        const body = await readBody(request, 32 * 1024);
        try {
          await (await getClient()).deleteDraft(mediaId);
        } catch (error) {
          const patch = { mediaId, ...lifecycleErrorPatch(error) };
          if (body.articleId) await updateArticleWechat(body.articleId, patch);
          else await updateArticlesByMediaId(mediaId, patch);
          throw error;
        }
        const patch = {
          mediaId: null,
          index: 0,
          status: 'deleted',
          lastSyncError: null,
          retryable: false,
          deletedAt: new Date().toISOString(),
        };
        if (body.articleId) await updateArticleWechat(body.articleId, patch);
        else await updateArticlesByMediaId(mediaId, patch);
        json(response, 200, { ok: true, mediaId, articleId: body.articleId || null });
        return true;
      }

      if (request.method === 'GET' && getDraftMatch) {
        const mediaId = decodeURIComponent(getDraftMatch[1]);
        const result = await (await getClient()).getDraft(mediaId);
        json(response, 200, { ok: true, draft: result, mediaId });
        return true;
      }

      return false;
    } catch (error) {
      const status = error.status || (error.code === 'THEME_INVALID' ? 400 : error.code === 'THEME_ALREADY_EXISTS' ? 409 : 502);
      json(response, status, {
        ok: false,
        code: error.code || 'WECHAT_REQUEST_FAILED',
        message: error.message || '微信接口请求失败',
      });
      return true;
    }
  }

  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    if (pathname.startsWith('/api/')) {
      if (await handleApi(request, response, pathname)) return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = normalize(join(root, relative));
    if (!filePath.startsWith(root)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    try {
      const body = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });

  return { server, host, port, configStore, articleStore, themeStore, handleApi };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, host, port } = createEditorServer();
  server.listen(port, host, () => {
    const displayHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
    console.log(`Open WeChat Editor preview: http://${displayHost}:${port}/`);
  });
}
