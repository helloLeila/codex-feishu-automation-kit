import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function startServer(options = {}) {
  const { createEditorServer } = await import('../scripts/start-wechat-editor.mjs');
  return { editor: createEditorServer({ host: '127.0.0.1', port: 0, ...options }) };
}

async function stopServer(editor) {
  editor.server.close();
}

async function request(editor, path, options = {}) {
  const payload = options.body || '';
  const request = {
    method: options.method || 'GET',
    url: path,
    headers: { ...(payload ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (payload) yield Buffer.from(payload);
    },
  };
  const response = {
    status: null,
    headers: {},
    body: '',
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; return this; },
    end(body = '') { this.body = body; },
  };
  await editor.handleRequest(request, response);
  return {
    status: response.status,
    headers: new Headers(response.headers),
    async text() { return String(response.body); },
    async json() { return JSON.parse(String(response.body || '{}')); },
  };
}

test('guest mode keeps editor preview and local APIs available when auth is not configured', async () => {
  const { editor } = await startServer({ auth: { enabled: false } });
  try {
    const page = await request(editor, '/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /复制公众号格式/);

    const articles = await request(editor, '/api/articles');
    assert.equal(articles.status, 200);
  } finally {
    await stopServer(editor);
  }
});

test('email registration verifies a code, logs in, and isolates articles by owner', async () => {
  const { createEditorServer } = await import('../scripts/start-wechat-editor.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'open-wechat-registration-'));
  const sent = [];
  const { editor } = await startServer({
    configDirectory: directory,
    auth: { enabled: false, registrationEnabled: true, sessionSecret: 'registration-secret' },
    mailer: { sendVerificationCode: async (payload) => { sent.push(payload); } },
  });
  try {
    const requestCode = await request(editor, '/api/auth/register/request', { method: 'POST', body: JSON.stringify({ email: 'writer@example.com', password: 'correct horse battery staple' }) });
    assert.equal(requestCode.status, 202);
    assert.equal(sent.length, 1);
    const verified = await request(editor, '/api/auth/register/verify', { method: 'POST', body: JSON.stringify({ email: 'writer@example.com', code: sent[0].code }) });
    assert.equal(verified.status, 201);
    assert.equal((await verified.json()).user.email, 'writer@example.com');

    const login = await request(editor, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'writer@example.com', password: 'correct horse battery staple' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const created = await request(editor, '/api/articles', { method: 'POST', headers: { cookie }, body: JSON.stringify({ title: '私有文章', markdown: '# 私有' }) });
    assert.equal(created.status, 201);
    const listed = await request(editor, '/api/articles', { headers: { cookie } });
    assert.equal((await listed.json()).articles.length, 1);
  } finally {
    await new Promise((resolve) => editor.server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('auth mode protects server APIs while leaving the editor shell and health check public', async () => {
  const { editor } = await startServer({ auth: { username: 'owner', password: 'correct horse battery staple', sessionSecret: 'test-secret' } });
  try {
    assert.equal((await request(editor, '/')).status, 200);
    const health = await request(editor, '/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, authEnabled: true });

    const session = await request(editor, '/api/auth/session');
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), { ok: true, authenticated: false });

    const protectedResponse = await request(editor, '/api/articles');
    assert.equal(protectedResponse.status, 401);
    assert.equal((await protectedResponse.json()).code, 'AUTH_REQUIRED');
  } finally {
    await stopServer(editor);
  }
});

test('login sets an HttpOnly SameSite cookie, enables protected APIs, and logout revokes it', async () => {
  const { editor } = await startServer({ auth: { username: 'owner', password: 'correct horse battery staple', sessionSecret: 'test-secret' } });
  try {
    const failed = await request(editor, '/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'owner', password: 'wrong' }) });
    assert.equal(failed.status, 401);
    assert.deepEqual(await failed.json(), { ok: false, code: 'AUTH_INVALID', message: '用户名或密码不正确。' });

    const login = await request(editor, '/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'owner', password: 'correct horse battery staple' }) });
    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), { ok: true, authenticated: true, username: 'owner' });
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);

    const authorized = await request(editor, '/api/articles', { headers: { cookie } });
    assert.equal(authorized.status, 200);
    assert.equal((await authorized.json()).ok, true);

    const logout = await request(editor, '/api/auth/logout', { method: 'POST', headers: { cookie } });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);

    const revoked = await request(editor, '/api/articles', { headers: { cookie } });
    assert.equal(revoked.status, 401);
  } finally {
    await stopServer(editor);
  }
});

test('repeated invalid logins enter a short cooldown without revealing account details', async () => {
  const { editor } = await startServer({ auth: { username: 'owner', password: 'correct horse battery staple', sessionSecret: 'test-secret', maxAttempts: 2, cooldownMs: 1000, windowMs: 60000 } });
  try {
    for (let index = 0; index < 2; index += 1) {
      const response = await request(editor, '/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'someone-else', password: 'wrong' }) });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { ok: false, code: 'AUTH_INVALID', message: '用户名或密码不正确。' });
    }
    const throttled = await request(editor, '/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'owner', password: 'correct horse battery staple' }) });
    assert.equal(throttled.status, 429);
    assert.equal((await throttled.json()).code, 'AUTH_RATE_LIMITED');
  } finally {
    await stopServer(editor);
  }
});

test('rejects AppSecret submission over an insecure non-local HTTP request', async () => {
  const { editor } = await startServer({ auth: { username: 'owner', password: 'correct horse battery staple', sessionSecret: 'test-secret' } });
  try {
    const login = await request(editor, '/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'owner', password: 'correct horse battery staple' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const response = await request(editor, '/api/config', {
      method: 'PUT',
      headers: { cookie, host: '47.115.33.37:3210', 'x-forwarded-proto': 'http' },
      body: JSON.stringify({ credentials: { appId: 'wx-test', appSecret: 'secret-test' } }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'INSECURE_CREDENTIAL_TRANSPORT');
  } finally {
    await stopServer(editor);
  }
});

test('rejects cross-origin state-changing requests when an authenticated cookie is present', async () => {
  const { editor } = await startServer({ auth: { username: 'owner', password: 'correct horse battery staple', sessionSecret: 'test-secret' } });
  try {
    const login = await request(editor, '/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'owner', password: 'correct horse battery staple' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const response = await request(editor, '/api/articles', {
      method: 'POST',
      headers: { cookie, origin: 'http://attacker.example', host: '127.0.0.1:3210' },
      body: JSON.stringify({ title: '不应创建', markdown: '# 文章' }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'CSRF_ORIGIN_MISMATCH');
  } finally {
    await stopServer(editor);
  }
});
