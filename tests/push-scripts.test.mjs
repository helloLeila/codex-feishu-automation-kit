import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const feishuGbaScript = path.join(rootDir, "skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs");
const serverChanGbaScript = path.join(rootDir, "skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs");

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
      feishuGbaScript,
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
      serverChanGbaScript,
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

test("GBA push scripts parse common markdown field variants", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "push-scripts-"));
  const markdownPath = path.join(dir, "variant-events.md");

  try {
    await writeFile(markdownPath, `# 检索结果
- **时间范围**：2026-07-08 00:00 至 2026-07-22 23:59
- **本次找到**：1 场符合条件的活动
- **城市分布**：上海 1
- **最值得优先看**：Agent 工程实践夜谈

# 快速卡片

## 活动 1｜Agent 工程实践夜谈
中文解释：面向 AI 工程师的线下 Agent 工程实践交流。
- **时间**：2026-07-12 19:30
- **城市**：上海
- **主题**：AI Agent 工程化
- **内容看点**：
  - 生产环境工具调用审计
  - Agent 失败恢复设计
- **值不值得去**：值得
- **一句话理由**：议题聚焦真实工程落地。
- 链接: https://example.com/agent-night

# 候补链接
- 候补活动｜上海｜时间待确认｜https://example.com/backup

# 备注
- 已剔除的典型原因：泛商业沙龙
`);

    const feishu = spawnSync(process.execPath, [
      feishuGbaScript,
      markdownPath,
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
      serverChanGbaScript,
      markdownPath,
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
    const feishuText = JSON.stringify(JSON.parse(feishu.stdout).card.elements);
    assert.equal(feishuText.includes("2026-07-12 19:30"), true);
    assert.equal(feishuText.includes("上海"), true);
    assert.equal(feishuText.includes("AI Agent 工程化"), true);
    assert.equal(feishuText.includes("生产环境工具调用审计"), true);
    assert.equal(feishuText.includes("值得"), true);
    assert.equal(feishuText.includes("议题聚焦真实工程落地"), true);
    assert.equal(feishuText.includes("官方未明确"), false);

    assert.equal(serverChan.status, 0);
    assert.equal(serverChan.stderr, "");
    const serverChanText = JSON.parse(serverChan.stdout).payload.desp;
    assert.equal(serverChanText.includes("2026-07-12 19:30"), true);
    assert.equal(serverChanText.includes("AI Agent 工程化"), true);
    assert.equal(serverChanText.includes("生产环境工具调用审计"), true);
    assert.equal(serverChanText.includes("议题聚焦真实工程落地"), true);
    assert.equal(serverChanText.includes("官方未明确"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
