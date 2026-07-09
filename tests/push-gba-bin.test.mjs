import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const binScript = path.join(rootDir, "bin/codex-feishu-push-gba-events.mjs");
const exampleMarkdown = path.join(rootDir, "examples/gba-events-example.md");

test("package exposes setup and global GBA push bin commands", async () => {
  const packageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));

  assert.equal(packageJson.bin["codex-feishu-automation-kit"], "scripts/gba.mjs");
  assert.equal(packageJson.bin["codex-feishu-setup"], "scripts/gba.mjs");
  assert.equal(packageJson.bin["codex-feishu-push-gba-events"], "bin/codex-feishu-push-gba-events.mjs");
});

test("codex-feishu-push-gba-events dry-run reads user-level push config", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "tech-events-home-"));
  const configDir = path.join(home, ".config", "codex-feishu-automation-kit");

  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, "tech-events-assistant.local.json"),
      JSON.stringify({
        push: {
          feishuWebhookUrl: "https://user.example/webhook",
          feishuWebhookSecret: "user-secret",
          serverChanSendKey: "SCT123",
        },
      }),
    );

    const result = spawnSync(process.execPath, [binScript, "--dry-run", exampleMarkdown], {
      cwd: await mkdtemp(path.join(tmpdir(), "tech-events-workspace-")),
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: "",
        CODEX_HOME: "",
        FEISHU_WEBHOOK_URL: "",
        FEISHU_WEBHOOK_SECRET: "",
        SERVERCHAN_SENDKEY: "",
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.includes("飞书 dry-run 预览"), true);
    assert.equal(result.stdout.includes("Server 酱 dry-run 预览"), true);
    assert.equal(result.stdout.includes("https://sctapi.ftqq.com/SCT123.send"), true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("codex-feishu-push-gba-events exits successfully when no push channel is configured", () => {
  const result = spawnSync(process.execPath, [binScript, "--dry-run", exampleMarkdown], {
    cwd: rootDir,
    env: {
      ...process.env,
      HOME: path.join(tmpdir(), "missing-tech-events-home"),
      XDG_CONFIG_HOME: "",
      CODEX_HOME: "",
      FEISHU_WEBHOOK_URL: "",
      FEISHU_WEBHOOK_SECRET: "",
      SERVERCHAN_SENDKEY: "",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes("未配置推送渠道"), true);
});
