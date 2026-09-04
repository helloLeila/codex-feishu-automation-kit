import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('article store creates, lists, reads, updates, and deletes local articles', async () => {
  const { createArticleStore } = await import('../apps/wechat-editor/src/server/article-store.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'open-wechat-articles-'));
  try {
    const store = createArticleStore({ directory });
    const created = await store.create({ title: '第一篇', markdown: '# 正文', themeId: 'clear-reading' });

    assert.match(created.id, /^article-/);
    assert.equal(created.title, '第一篇');
    assert.equal(created.wechat.status, 'local-only');
    assert.equal((await store.list())[0].title, '第一篇');
    assert.equal((await store.get(created.id)).markdown, '# 正文');

    const updated = await store.update(created.id, { title: '改过的第一篇', markdown: '## 新正文' });
    assert.equal(updated.title, '改过的第一篇');
    assert.equal(updated.markdown, '## 新正文');
    assert.equal((await store.get(created.id)).updatedAt, updated.updatedAt);

    await store.remove(created.id);
    assert.equal(await store.get(created.id), null);
    assert.deepEqual(await store.list(), []);

    const file = await stat(join(directory, 'articles.json'));
    assert.equal(file.mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
