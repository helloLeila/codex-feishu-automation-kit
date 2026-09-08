import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/deploy-wechat-editor.sh', import.meta.url);

test('deployment script supports clone, update, protected env, compose startup, and health check', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /git clone/);
  assert.match(source, /git -C .* pull/);
  assert.match(source, /chmod 600/);
  assert.match(source, /docker compose/);
  assert.match(source, /api\/health/);
  assert.match(source, /WECHAT_APP_SECRET/);
  assert.match(source, /EDITOR_SESSION_SECRET/);
});
