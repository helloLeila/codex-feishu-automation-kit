import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadLocalEnv } from "../skills/feishu-automation-reporter/scripts/lib/env.mjs";

test("loadLocalEnv reads push secrets from tech-events-assistant.local.json", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tech-events-env-"));

  try {
    await writeFile(
      path.join(dir, "tech-events-assistant.local.json"),
      JSON.stringify({
        push: {
          feishuWebhookUrl: "https://feishu.example/webhook",
          feishuWebhookSecret: "signing-secret",
          serverChanSendKey: "serverchan-key",
        },
      }),
    );

    const env = await loadLocalEnv(dir);

    assert.equal(env.FEISHU_WEBHOOK_URL, "https://feishu.example/webhook");
    assert.equal(env.FEISHU_WEBHOOK_SECRET, "signing-secret");
    assert.equal(env.SERVERCHAN_SENDKEY, "serverchan-key");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadLocalEnv ignores placeholder secrets from example env files", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tech-events-env-"));

  try {
    await writeFile(
      path.join(dir, ".env.local"),
      [
        "FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/replace-me",
        "FEISHU_WEBHOOK_SECRET=<FEISHU_WEBHOOK_SECRET>",
        "SERVERCHAN_SENDKEY=<SERVERCHAN_SENDKEY>",
      ].join("\n"),
    );

    const env = await loadLocalEnv(dir);

    assert.equal("FEISHU_WEBHOOK_URL" in env, false);
    assert.equal("FEISHU_WEBHOOK_SECRET" in env, false);
    assert.equal("SERVERCHAN_SENDKEY" in env, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
