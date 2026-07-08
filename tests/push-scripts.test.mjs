import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test("GBA push scripts use the configured region in notification titles", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "push-scripts-"));

  try {
    await writeFile(path.join(dir, "tech-events-assistant.config.json"), `${JSON.stringify({
      eventSearch: {
        regionName: "长三角",
      },
      push: {
        feishu: true,
        serverChan: true,
      },
    }, null, 2)}\n`);

    const feishu = spawnSync(process.execPath, [
      path.join(rootDir, "skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs"),
      path.join(rootDir, "examples/gba-events-example.md"),
    ], {
      cwd: dir,
      env: {
        ...process.env,
        FEISHU_DRY_RUN: "1",
        FEISHU_WEBHOOK_URL: "dry-run-webhook-url",
      },
      encoding: "utf8",
    });

    const serverChan = spawnSync(process.execPath, [
      path.join(rootDir, "skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs"),
      path.join(rootDir, "examples/gba-events-example.md"),
    ], {
      cwd: dir,
      env: {
        ...process.env,
        SERVERCHAN_DRY_RUN: "1",
        SERVERCHAN_SENDKEY: "dry-run-sendkey",
      },
      encoding: "utf8",
    });

    assert.equal(feishu.status, 0);
    assert.equal(feishu.stderr, "");
    assert.equal(JSON.parse(feishu.stdout).card.header.title.content, "长三角活动｜检索结果");

    assert.equal(serverChan.status, 0);
    assert.equal(serverChan.stderr, "");
    assert.equal(JSON.parse(serverChan.stdout).payload.title, "Codex｜长三角活动");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
