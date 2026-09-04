import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const AUTH_COOKIE_NAME = 'open_wechat_editor_session';

function envFlag(value) {
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left ?? ''));
  const b = Buffer.from(String(right ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => part.trim().split('=')));
}

export function getClientAddress(request) {
  // Do not trust a client-supplied X-Forwarded-For header unless a trusted
  // reverse proxy is explicitly configured in front of this service.
  return String(request.socket?.remoteAddress || 'unknown').trim() || 'unknown';
}

export function isSecureRequest(request) {
  const forwarded = request.headers?.['x-forwarded-proto'] || request.headers?.['X-Forwarded-Proto'];
  if (forwarded) return String(forwarded).split(',')[0].trim().toLowerCase() === 'https';
  return Boolean(request.socket?.encrypted);
}

export function createAuth(options = {}) {
  const hasOptionCredentials = options.username !== undefined || options.password !== undefined;
  const username = String(options.username ?? process.env.EDITOR_AUTH_USER ?? '').trim();
  const password = String(options.password ?? process.env.EDITOR_AUTH_PASSWORD ?? '');
  const explicitlyEnabled = options.enabled !== undefined
    ? Boolean(options.enabled)
    : process.env.EDITOR_AUTH_ENABLED !== undefined
      ? envFlag(process.env.EDITOR_AUTH_ENABLED)
      : hasOptionCredentials || Boolean(username && password);
  if (explicitlyEnabled && (!username || !password)) {
    throw new Error('启用编辑器登录需要同时配置 EDITOR_AUTH_USER 和 EDITOR_AUTH_PASSWORD。');
  }

  const sessionSecret = String(options.sessionSecret ?? process.env.EDITOR_SESSION_SECRET ?? randomBytes(32).toString('hex'));
  const sessionTtlMs = Number(options.sessionTtlMs || 8 * 60 * 60 * 1000);
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 5));
  const windowMs = Math.max(1000, Number(options.windowMs || 15 * 60 * 1000));
  const cooldownMs = Math.max(1000, Number(options.cooldownMs || 30 * 1000));
  const sessions = new Map();
  const attempts = new Map();

  function cleanup() {
    const now = Date.now();
    for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id);
    for (const [address, record] of attempts) {
      if (record.blockedUntil <= now && now - record.firstAt > windowMs) attempts.delete(address);
    }
  }

  function enabled() {
    return explicitlyEnabled;
  }

  function inspect(request) {
    if (!enabled()) return { authenticated: true, username: null };
    cleanup();
    const value = parseCookies(request.headers?.cookie || '')[AUTH_COOKIE_NAME];
    if (!value) return { authenticated: false, username: null };
    const [id, signature] = String(value).split('.');
    if (!id || !signature || !safeEqual(signature, sign(id, sessionSecret))) return { authenticated: false, username: null };
    const session = sessions.get(id);
    if (!session || session.expiresAt <= Date.now()) {
      sessions.delete(id);
      return { authenticated: false, username: null };
    }
    return { authenticated: true, username: session.username };
  }

  function cookieHeaders(request, value, maxAge) {
    const secure = isSecureRequest(request) ? '; Secure' : '';
    return `${AUTH_COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
  }

  function clearCookie(request) {
    return cookieHeaders(request, '', 0);
  }

  function rateLimit(address) {
    const now = Date.now();
    const existing = attempts.get(address);
    if (!existing || now - existing.firstAt > windowMs) {
      const next = { count: 0, firstAt: now, blockedUntil: 0 };
      attempts.set(address, next);
      return next;
    }
    return existing;
  }

  function login(request, suppliedUsername, suppliedPassword) {
    if (!enabled()) return { ok: true, authenticated: true, username: null, setCookie: null };
    const address = getClientAddress(request);
    const record = rateLimit(address);
    if (record.blockedUntil > Date.now()) {
      return { ok: false, status: 429, code: 'AUTH_RATE_LIMITED', message: '登录尝试过于频繁，请稍后再试。', retryAfter: Math.ceil((record.blockedUntil - Date.now()) / 1000) };
    }

    const valid = safeEqual(suppliedUsername, username) && safeEqual(suppliedPassword, password);
    if (!valid) {
      record.count += 1;
      if (record.count >= maxAttempts) record.blockedUntil = Date.now() + cooldownMs;
      return { ok: false, status: 401, code: 'AUTH_INVALID', message: '用户名或密码不正确。' };
    }

    attempts.delete(address);
    const id = randomBytes(32).toString('base64url');
    sessions.set(id, { username, expiresAt: Date.now() + sessionTtlMs });
    const value = `${id}.${sign(id, sessionSecret)}`;
    return { ok: true, authenticated: true, username, setCookie: cookieHeaders(request, value, Math.floor(sessionTtlMs / 1000)) };
  }

  function logout(request) {
    const value = parseCookies(request.headers?.cookie || '')[AUTH_COOKIE_NAME];
    const [id] = String(value || '').split('.');
    if (id) sessions.delete(id);
    return clearCookie(request);
  }

  return { enabled, inspect, login, logout, cookieName: AUTH_COOKIE_NAME };
}
