import assert from "node:assert/strict";
import test from "node:test";

import {
  cartoonProgressLine,
  completionLine,
  renderActionPanelLines,
  renderBannerLines,
  renderGuideActionPrompt,
  renderGuideCompletePrompt,
  renderGuideDashboardLines,
  renderLastRunLines,
  renderNeonCompletionLines,
  renderNeonProgressLine,
  renderSectionTitle,
  renderStepFlowLines,
  renderStepTransitionLines,
  stripAnsi,
  terminalCellWidth,
} from "../scripts/lib/terminal-ui.mjs";

const DIGITAL_COMPLETION = "完成  ██████████████████████ 100%";
const NEON_BAR = "█".repeat(22);
const NEON_64 = `${"█".repeat(14)}${"░".repeat(8)}`;

test("neon progress uses a long bar and neon colors", () => {
  const activeLine = stripAnsi(renderNeonProgressLine(64, { color: false }));
  const doneLines = renderNeonCompletionLines("tech-events-assistant.local.json 已保存", {
    color: false,
  }).map(stripAnsi);
  const coloredActiveLine = renderNeonProgressLine(64, { color: true });
  const coloredDoneLines = renderNeonCompletionLines("tech-events-assistant.local.json 已保存", {
    color: true,
  });

  assert.equal(activeLine, `保存中  ${NEON_64} 64%`);
  assert.deepEqual(doneLines, [
    `完成  ${NEON_BAR} 100%`,
    "      ✓ tech-events-assistant.local.json 已保存",
  ]);
  assert.equal(coloredActiveLine.includes("\x1b[36m"), true);
  assert.equal(coloredActiveLine.includes("\x1b[35m"), true);
  assert.equal(coloredDoneLines.join("\n").includes("\x1b[32m"), true);
});

test("cartoon progress uses robots for in-progress percentages", () => {
  const line = stripAnsi(cartoonProgressLine(50, { color: false }));

  assert.equal(line, "进度  🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖▫️▫️▫️▫️▫️▫️▫️▫️▫️▫️  50%");
});

test("completion state is a colored digital progress bar", () => {
  const line = stripAnsi(cartoonProgressLine(100, { color: false }));
  const coloredLine = cartoonProgressLine(100, { color: true });

  assert.equal(line, DIGITAL_COMPLETION);
  assert.equal(line.includes("100%"), true);
  assert.equal(line.includes("🎉"), false);
  assert.equal(coloredLine.includes("\x1b[32m完成"), true);
  assert.equal(coloredLine.includes("\x1b[32m██████████████████████"), true);
  assert.equal(coloredLine.includes("\x1b[32m100%"), true);
});

test("completionLine mirrors final progress state", () => {
  assert.equal(
    stripAnsi(completionLine({ color: false })),
    DIGITAL_COMPLETION,
  );
});

test("step flow renders an active step and final completed state", () => {
  const activeLines = renderStepFlowLines("配置推送", ["读取现有配置", "写入本地配置"], {
    activeIndex: 1,
    color: false,
  }).map(stripAnsi);
  const doneLines = renderStepFlowLines("配置推送", ["读取现有配置", "写入本地配置"], {
    complete: true,
    result: "tech-events-assistant.local.json 已保存",
    color: false,
  }).map(stripAnsi);

  assert.deepEqual(activeLines, [
    `${"━".repeat(17)} 🤖 配置推送 ${"━".repeat(18)}`,
    "│",
    "├─ ✓ 读取现有配置",
    "└─ ⠙ 写入本地配置",
  ]);
  assert.deepEqual(doneLines, [
    `${"━".repeat(17)} 🤖 配置推送 ${"━".repeat(18)}`,
    "│",
    "├─ ✓ 读取现有配置",
    "└─ ✓ 写入本地配置",
    "",
    `完成  ${NEON_BAR} 100%`,
    "      ✓ tech-events-assistant.local.json 已保存",
  ]);

  const coloredActive = renderStepFlowLines("配置推送", ["读取现有配置", "写入本地配置"], {
    activeIndex: 1,
    color: true,
  }).join("\n");
  assert.equal(coloredActive.includes("\x1b[95m⠙"), true);
  assert.equal(coloredActive.includes("\x1b[1m\x1b[95m写入本地配置"), true);
});

test("section title is visually heavier than plain text", () => {
  const lines = renderSectionTitle("状态检查", { color: false }).map(stripAnsi);

  assert.deepEqual(lines, [
    `${"━".repeat(17)} 🤖 状态检查 ${"━".repeat(18)}`,
  ]);
});

test("step transition separates completed output from the next guide", () => {
  const lines = renderStepTransitionLines("状态检查", "导入 Codex 自动化配置", {
    nextStepNumber: 5,
    color: false,
  }).map(stripAnsi);

  assert.deepEqual(lines, [
    "",
    "下一步",
    "  5 导入 Codex 自动化配置",
    "",
  ]);

  const colored = renderStepTransitionLines("状态检查", "导入 Codex 自动化配置", {
    nextStepNumber: 5,
    color: true,
  }).join("\n");
  assert.equal(colored.includes("\x1b[36m下一步"), true);
});

test("guide action prompt renders a single gray command row", () => {
  const plain = stripAnsi(renderGuideActionPrompt(4, "状态检查", { color: false }));
  const colored = renderGuideActionPrompt(4, "状态检查", { color: true });

  assert.equal(plain, "\n> [Enter] 执行  4 状态检查 ");
  assert.equal(plain.includes("："), false);
  assert.equal(plain.includes("›"), false);
  assert.equal(plain.includes("当前操作"), false);
  assert.equal(plain.includes("╭"), false);
  assert.equal(plain.includes("│"), false);
  assert.equal(plain.includes("╰"), false);
  assert.equal(colored.includes("\x1b[100m"), true);
  assert.equal(colored.includes("\x1b[36m\x1b[100m[Enter]"), true);
  assert.equal(stripAnsi(colored), plain);
});

test("guide complete prompt renders a single gray command row", () => {
  const plain = stripAnsi(renderGuideCompletePrompt({ color: false }));
  const colored = renderGuideCompletePrompt({ color: true });

  assert.equal(plain, "\n> [Enter] 退出  [1-5] 重跑步骤 ");
  assert.equal(plain.includes("当前操作"), false);
  assert.equal(plain.includes("╭"), false);
  assert.equal(plain.includes("│"), false);
  assert.equal(plain.includes("╰"), false);
  assert.equal(colored.includes("\x1b[100m"), true);
  assert.equal(colored.includes("\x1b[36m\x1b[100m[Enter]"), true);
  assert.equal(stripAnsi(colored), plain);
});

test("action panel emphasizes title and key values", () => {
  const lines = renderActionPanelLines("你需要做的事情", [
    ["打开位置", "Codex 左侧的「自动化（已安排）」"],
    ["点击按钮", "通过聊天添加"],
    ["自动化名称", "线下技术活动情报晨报"],
  ], { color: false }).map(stripAnsi);

  assert.deepEqual(lines, [
    "你需要做的事情",
    "",
    "  1. 打开位置      Codex 左侧的「自动化（已安排）」",
    "  2. 点击按钮      通过聊天添加",
    "  3. 自动化名称    线下技术活动情报晨报",
  ]);

  const colored = renderActionPanelLines("你需要做的事情", [
    ["自动化名称", "线下技术活动情报晨报"],
  ], { color: true }).join("\n");
  assert.equal(colored.includes("\x1b[1m"), true);
  assert.equal(colored.includes("\x1b[36m"), true);
  assert.equal(colored.includes("\x1b[33m"), true);
  assert.equal(stripAnsi(colored).includes("你需要做的事情"), true);
});

test("guide dashboard renders a compact execution console overview", () => {
  const lines = renderGuideDashboardLines({
    completedSteps: new Set([0]),
    currentStep: 1,
    steps: [
      "安装 / 更新活动助手",
      "配置推送和偏好",
      "测试真实连接",
      "状态检查",
      "导入 Codex 自动化配置",
    ],
    shortLabels: ["安装", "配置", "测试", "状态", "自动化"],
    statusItems: [
      { state: "ok", label: "普通配置已存在" },
      { state: "warn", label: "飞书 webhook 未配置" },
      { state: "ok", label: "Server 酱 SendKey 已配置" },
    ],
    color: false,
  }).map(stripAnsi);

  assert.deepEqual(lines, [
    "╭─🤖──╮  技术活动助手 · 配置引导 2/5",
    "│ •ᴗ• │  ● 安装   ◉ 配置   ○ 测试   ○ 状态   ○ 自动化",
    "╰─────╯",
    "",
    "当前任务  配置推送和偏好",
    "",
    "已检测",
    "  ✓ 普通配置已存在",
    "  ! 飞书 webhook 未配置",
    "  ✓ Server 酱 SendKey 已配置",
    "",
    "[Enter] 执行当前步骤   [1-5] 跳转   [b] 菜单   [q] 退出",
  ]);

  const colored = renderGuideDashboardLines({
    completedSteps: new Set([0]),
    currentStep: 1,
    steps: [
      "安装 / 更新活动助手",
      "配置推送和偏好",
      "测试真实连接",
      "状态检查",
      "导入 Codex 自动化配置",
    ],
    shortLabels: ["安装", "配置", "测试", "状态", "自动化"],
    color: true,
  }).join("\n");
  assert.equal(colored.includes("\x1b[95m"), true);
  assert.equal(colored.includes("↑ 当前步骤"), false);
});

test("last run renders full execution details by default", () => {
  const run = {
    title: "1 安装 / 更新活动助手",
    steps: ["检查配置文件", "准备本地入口"],
    result: "活动助手已就绪",
  };
  const lines = renderLastRunLines(run, { color: false }).map(stripAnsi);

  assert.deepEqual(lines, [
    "",
    "最近执行",
    `${"━".repeat(11)} 🤖 1 安装 / 更新活动助手 ${"━".repeat(11)}`,
    "│",
    "├─ ✓ 检查配置文件",
    "└─ ✓ 准备本地入口",
    "",
    "结果  活动助手已就绪",
  ]);
  assert.equal(lines.includes("执行详情"), false);
  assert.equal(lines.some((line) => line.includes("按 d")), false);
  assert.equal(lines.some((line) => line.startsWith("完成  ")), false);
});

test("banner uses a generic assistant name and wraps every line", () => {
  const lines = renderBannerLines({ color: false }).map(stripAnsi);
  const widths = lines.map(terminalCellWidth);
  const titleOffset = terminalCellWidth(lines[1].slice(0, lines[1].indexOf("技术活动助手")));
  const taglineOffset = terminalCellWidth(lines[2].slice(0, lines[2].indexOf("找活动")));
  const helperOffset = terminalCellWidth(lines[3].slice(0, lines[3].indexOf("npm run gba")));

  assert.equal(lines.some((line) => line.includes("技术活动助手")), true);
  assert.equal(lines.some((line) => line.includes("大湾区")), false);
  assert.equal(new Set(widths).size, 1);
  assert.equal(titleOffset, taglineOffset);
  assert.equal(taglineOffset, helperOffset);
  assert.equal(lines[2].includes("│ •ᴗ• │"), true);
  assert.equal(lines[3].includes("╰─────╯"), true);
  assert.match(lines[2], /状态 {3}│$/);
  assert.match(lines[0], /^╭─+╮$/);
  assert.match(lines.at(-1), /^╰─+╯$/);
});

test("colored banner keeps the same layout as plain banner", () => {
  const plain = renderBannerLines({ color: false }).map(stripAnsi);
  const colored = renderBannerLines({ color: true }).map(stripAnsi);

  assert.deepEqual(colored, plain);
});
