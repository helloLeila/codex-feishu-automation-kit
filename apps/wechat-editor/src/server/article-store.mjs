import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ARTICLE_FILE = 'articles.json';

function now() {
  return new Date().toISOString();
}

function articleId() {
  return `article-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

function normalizeArticle(input = {}, existing = null, { bumpRevision = true } = {}) {
  const timestamp = now();
  const base = existing || {
    id: articleId(),
    title: '未命名文章',
    markdown: '# 新文章\n\n从这里开始写。',
    themeId: 'clear-reading',
    themeVersion: 1,
    ownerId: null,
    revision: 1,
    metadata: {
      digest: '',
      coverPrompt: '',
      coverMediaId: '',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    wechat: {
      mediaId: null,
      index: 0,
      status: 'local-only',
      autoSync: false,
      paused: false,
    },
  };
  const contentChanged = Boolean(existing) && (
    (Object.prototype.hasOwnProperty.call(input, 'title') && String(input.title ?? base.title).trim() !== String(base.title || '').trim())
    || (Object.prototype.hasOwnProperty.call(input, 'markdown') && String(input.markdown ?? base.markdown) !== String(base.markdown || ''))
    || (Object.prototype.hasOwnProperty.call(input, 'themeId') && String(input.themeId ?? base.themeId) !== String(base.themeId || ''))
    || (Object.prototype.hasOwnProperty.call(input, 'themeVersion') && Number(input.themeVersion ?? base.themeVersion) !== Number(base.themeVersion || 1))
    || Object.prototype.hasOwnProperty.call(input, 'metadata')
  );
  const next = {
    ...base,
    ...input,
    id: base.id,
    title: String(input.title ?? base.title).trim().slice(0, 80) || '未命名文章',
    markdown: String(input.markdown ?? base.markdown),
    themeId: String(input.themeId ?? base.themeId ?? 'clear-reading'),
    themeVersion: Number.isInteger(input.themeVersion) ? input.themeVersion : (base.themeVersion || 1),
    ownerId: input.ownerId ?? base.ownerId ?? null,
    revision: contentChanged && bumpRevision ? Number(base.revision || 1) + 1 : Number(base.revision || 1),
    metadata: { ...(base.metadata || {}), ...(input.metadata || {}) },
    createdAt: base.createdAt,
    updatedAt: timestamp,
    wechat: { ...base.wechat, ...(input.wechat || {}) },
  };
  return next;
}

async function readArticles(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeArticles(path, articles) {
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(articles, null, 2)}\n`, { mode: 0o600 });
  await chmod(tempPath, 0o600);
  await rename(tempPath, path);
  await chmod(path, 0o600);
}

export function createArticleStore({ directory, ownerId: defaultOwnerId = undefined } = {}) {
  if (!directory) throw new Error('文章存储需要配置 directory');
  const path = join(directory, ARTICLE_FILE);

  return {
    directory,
    async list({ ownerId = defaultOwnerId } = {}) {
      const articles = await readArticles(path);
      const visible = ownerId === undefined ? articles : articles.filter((article) => (article.ownerId ?? null) === ownerId);
      return visible.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },

    async get(id, { ownerId = defaultOwnerId } = {}) {
      const articles = await readArticles(path);
      return articles.find((article) => article.id === id && (ownerId === undefined || (article.ownerId ?? null) === ownerId)) || null;
    },

    async create(input = {}, { ownerId = defaultOwnerId } = {}) {
      const articles = await readArticles(path);
      const article = normalizeArticle({ ...input, ...(ownerId !== undefined ? { ownerId } : {}) });
      await writeArticles(path, [article, ...articles]);
      return article;
    },

    async update(id, input = {}, { ownerId = defaultOwnerId, bumpRevision = true } = {}) {
      const articles = await readArticles(path);
      const index = articles.findIndex((article) => article.id === id && (ownerId === undefined || (article.ownerId ?? null) === ownerId));
      if (index === -1) return null;
      const article = normalizeArticle({ ...input, ...(ownerId !== undefined ? { ownerId } : {}) }, articles[index], { bumpRevision });
      articles[index] = article;
      await writeArticles(path, articles);
      return article;
    },

    async remove(id, { ownerId = defaultOwnerId } = {}) {
      const articles = await readArticles(path);
      const next = articles.filter((article) => !(article.id === id && (ownerId === undefined || (article.ownerId ?? null) === ownerId)));
      if (next.length === articles.length) return false;
      await writeArticles(path, next);
      return true;
    },

    async paths() {
      return { articlesPath: path };
    },
  };
}

export { ARTICLE_FILE, normalizeArticle };
