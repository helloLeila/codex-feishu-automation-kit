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

function normalizeArticle(input = {}, existing = null) {
  const timestamp = now();
  const base = existing || {
    id: articleId(),
    title: '未命名文章',
    markdown: '# 新文章\n\n从这里开始写。',
    themeId: 'clear-reading',
    themeVersion: 1,
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
  const next = {
    ...base,
    ...input,
    id: base.id,
    title: String(input.title ?? base.title).trim().slice(0, 80) || '未命名文章',
    markdown: String(input.markdown ?? base.markdown),
    themeId: String(input.themeId ?? base.themeId ?? 'clear-reading'),
    themeVersion: Number.isInteger(input.themeVersion) ? input.themeVersion : (base.themeVersion || 1),
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

export function createArticleStore({ directory } = {}) {
  if (!directory) throw new Error('文章存储需要配置 directory');
  const path = join(directory, ARTICLE_FILE);

  return {
    directory,
    async list() {
      const articles = await readArticles(path);
      return articles.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },

    async get(id) {
      const articles = await readArticles(path);
      return articles.find((article) => article.id === id) || null;
    },

    async create(input = {}) {
      const articles = await readArticles(path);
      const article = normalizeArticle(input);
      await writeArticles(path, [article, ...articles]);
      return article;
    },

    async update(id, input = {}) {
      const articles = await readArticles(path);
      const index = articles.findIndex((article) => article.id === id);
      if (index === -1) return null;
      const article = normalizeArticle(input, articles[index]);
      articles[index] = article;
      await writeArticles(path, articles);
      return article;
    },

    async remove(id) {
      const articles = await readArticles(path);
      const next = articles.filter((article) => article.id !== id);
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
