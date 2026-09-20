import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("user store hashes passwords and activates a verified email account", async () => {
  const { createUserStore } = await import("../apps/wechat-editor/src/server/auth/user-store.mjs");
  const directory = await mkdtemp(join(tmpdir(), "open-wechat-users-"));
  try {
    const store = createUserStore({ directory });
    await store.createPending({ email: "author@example.com", password: "correct horse battery staple" });
    assert.equal(await store.verifyCredentials("author@example.com", "correct horse battery staple"), null);
    const activated = await store.activate("author@example.com");
    assert.equal(activated.email, "author@example.com");
    assert.equal((await store.verifyCredentials("author@example.com", "correct horse battery staple")).email, "author@example.com");
    assert.equal(await store.verifyCredentials("author@example.com", "wrong"), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("verification store expires codes and limits attempts", async () => {
  const { createVerificationStore } = await import("../apps/wechat-editor/src/server/auth/email-verification.mjs");
  const directory = await mkdtemp(join(tmpdir(), "open-wechat-codes-"));
  try {
    let clock = 1000;
    const store = createVerificationStore({ directory, codeGenerator: () => "123456", ttlMs: 1000, maxAttempts: 2, now: () => clock });
    const issued = await store.issue("author@example.com");
    assert.equal(issued.code, "123456");
    assert.equal((await store.verify("author@example.com", "000000")).ok, false);
    assert.equal((await store.verify("author@example.com", "123456")).ok, true);
    const second = await store.issue("expired@example.com");
    assert.equal(second.code, "123456");
    clock += 1001;
    assert.equal((await store.verify("expired@example.com", "123456")).code, "CODE_EXPIRED");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("mailer can send verification messages through a configured HTTP mail gateway", async () => {
  const { createMailer } = await import("../apps/wechat-editor/src/server/email/mailer.mjs");
  const calls = [];
  const mailer = createMailer({
    sendUrl: "https://mail-gateway.example/send",
    sendToken: "gateway-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ok: true }), { status: 202 });
    },
  });
  const result = await mailer.sendVerificationCode({ email: "author@example.com", code: "123456", expiresAt: 123 });
  assert.equal(result.sent, true);
  assert.equal(calls[0].url, "https://mail-gateway.example/send");
  assert.match(calls[0].options.headers.authorization, /gateway-token/);
  assert.match(calls[0].options.body, /123456/);
});
