import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CONFIG_FILE,
  LOCAL_CONFIG_FILE,
  applySecretInputs,
  loadAssistantConfig,
  resolveUserLocalConfigPath,
  writeLocalConfig,
} from "../scripts/lib/tech-events-config.mjs";

test("applySecretInputs keeps old values on blank input and clears explicit clear", () => {
  const current = {
    push: {
      feishuWebhookUrl: "https://old.example/webhook",
      feishuWebhookSecret: "old-secret",
      serverChanSendKey: "old-sendkey",
    },
  };

  const result = applySecretInputs(current, {
    feishuWebhookUrl: "",
    feishuWebhookSecret: "new-secret",
    serverChanSendKey: "clear",
  });

  assert.equal(result.saved, true);
  assert.equal(result.config.push.feishuWebhookUrl, "https://old.example/webhook");
  assert.equal(result.config.push.feishuWebhookSecret, "new-secret");
  assert.equal("serverChanSendKey" in result.config.push, false);
});

test("applySecretInputs preserves original config when save is false", () => {
  const current = {
    push: {
      feishuWebhookUrl: "https://old.example/webhook",
    },
  };

  const result = applySecretInputs(
    current,
    { feishuWebhookUrl: "https://new.example/webhook" },
    { save: false },
  );

  assert.equal(result.saved, false);
  assert.deepEqual(result.config, current);
});

test("loadAssistantConfig merges public and local config without requiring either file", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tech-events-config-"));

  try {
    await writeFile(
      path.join(dir, CONFIG_FILE),
      JSON.stringify({ schedule: { timezone: "Asia/Shanghai" }, push: { feishu: true } }),
    );
    await writeFile(
      path.join(dir, LOCAL_CONFIG_FILE),
      JSON.stringify({ push: { feishuWebhookUrl: "https://hook.example" } }),
    );

    const config = await loadAssistantConfig(dir);

    assert.equal(config.schedule.timezone, "Asia/Shanghai");
    assert.equal(config.push.feishu, true);
    assert.equal(config.push.feishuWebhookUrl, "https://hook.example");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("writeLocalConfig creates a backup when replacing an existing local config", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tech-events-config-"));

  try {
    await writeFile(
      path.join(dir, LOCAL_CONFIG_FILE),
      JSON.stringify({ push: { feishuWebhookUrl: "https://old.example" } }),
    );

    const result = await writeLocalConfig(dir, {
      push: { feishuWebhookUrl: "https://new.example" },
    });
    const written = JSON.parse(await readFile(path.join(dir, LOCAL_CONFIG_FILE), "utf8"));

    assert.equal(written.push.feishuWebhookUrl, "https://new.example");
    assert.equal(result.backupCreated, true);
    assert.match(path.basename(result.backupPath), /^tech-events-assistant\.local\.json\.bak-/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("writeLocalConfig defaults to the user-level config path with private permissions", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "tech-events-home-"));
  const originalHome = process.env.HOME;
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

  try {
    delete process.env.XDG_CONFIG_HOME;
    process.env.HOME = home;

    const result = await writeLocalConfig(undefined, {
      push: { serverChanSendKey: "SCT123" },
    });
    const expectedPath = path.join(
      home,
      ".config",
      "codex-feishu-automation-kit",
      LOCAL_CONFIG_FILE,
    );
    const written = JSON.parse(await readFile(expectedPath, "utf8"));
    const mode = (await stat(expectedPath)).mode & 0o777;

    assert.equal(resolveUserLocalConfigPath(), expectedPath);
    assert.equal(result.filePath, expectedPath);
    assert.equal(written.push.serverChanSendKey, "SCT123");
    assert.equal(mode, 0o600);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    await rm(home, { recursive: true, force: true });
  }
});
