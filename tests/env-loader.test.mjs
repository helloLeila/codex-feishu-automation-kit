import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("loadLocalEnv reads push secrets from the user-level config", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "tech-events-home-"));
  const originalHome = process.env.HOME;
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  const originalCodexHome = process.env.CODEX_HOME;

  try {
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.CODEX_HOME;
    process.env.HOME = home;
    const userConfigDir = path.join(home, ".config", "codex-feishu-automation-kit");
    await mkdir(userConfigDir, { recursive: true });
    await writeFile(
      path.join(userConfigDir, "tech-events-assistant.local.json"),
      JSON.stringify({
        push: {
          feishuWebhookUrl: "https://user.example/webhook",
          feishuWebhookSecret: "user-secret",
          serverChanSendKey: "user-sendkey",
        },
      }),
    );

    const env = await loadLocalEnv(await mkdtemp(path.join(tmpdir(), "tech-events-env-")));

    assert.equal(env.FEISHU_WEBHOOK_URL, "https://user.example/webhook");
    assert.equal(env.FEISHU_WEBHOOK_SECRET, "user-secret");
    assert.equal(env.SERVERCHAN_SENDKEY, "user-sendkey");
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("workspace config overrides user-level push secrets", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "tech-events-home-"));
  const dir = await mkdtemp(path.join(tmpdir(), "tech-events-env-"));
  const originalHome = process.env.HOME;
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  const originalCodexHome = process.env.CODEX_HOME;

  try {
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.CODEX_HOME;
    process.env.HOME = home;
    const userConfigDir = path.join(home, ".config", "codex-feishu-automation-kit");
    await mkdir(userConfigDir, { recursive: true });
    await writeFile(
      path.join(userConfigDir, "tech-events-assistant.local.json"),
      JSON.stringify({
        push: {
          feishuWebhookUrl: "https://user.example/webhook",
          serverChanSendKey: "user-sendkey",
        },
      }),
    );
    await writeFile(
      path.join(dir, "tech-events-assistant.local.json"),
      JSON.stringify({
        push: {
          feishuWebhookUrl: "https://workspace.example/webhook",
        },
      }),
    );

    const env = await loadLocalEnv(dir);

    assert.equal(env.FEISHU_WEBHOOK_URL, "https://workspace.example/webhook");
    assert.equal(env.SERVERCHAN_SENDKEY, "user-sendkey");
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
    await rm(home, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});
