import assert from "node:assert/strict";
import test from "node:test";

import {
  cartoonProgressLine,
  completionLine,
  renderBannerLines,
  renderNeonCompletionLines,
  renderNeonProgressLine,
  renderSectionTitle,
  renderStepFlowLines,
  renderStepTransitionLines,
  stripAnsi,
  terminalCellWidth,
} from "../scripts/lib/terminal-ui.mjs";

const DIGITAL_COMPLETION = "完成  ██████████████████████████████ 100%  已完成";
const NEON_BAR = "█".repeat(56);
const NEON_64 = `${"█".repeat(35)}${"░".repeat(21)}`;

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
    `完成    ${NEON_BAR} 100%`,
    "        ✓ tech-events-assistant.local.json 已保存",
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
  assert.equal(coloredLine.includes("\x1b[32m██████████████████████████████"), true);
  assert.equal(coloredLine.includes("\x1b[33m100%"), true);
  assert.equal(coloredLine.includes("\x1b[32m已完成"), true);
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
    `━━ 配置推送 ${"━".repeat(36)}`,
    "│",
    "├─ ✓ 读取现有配置",
    "└─ ⠙ 写入本地配置",
  ]);
  assert.deepEqual(doneLines, [
    `━━ 配置推送 ${"━".repeat(36)}`,
    "│",
    "├─ ✓ 读取现有配置",
    "└─ ✓ 写入本地配置",
    "",
    `完成    ${NEON_BAR} 100%`,
    "        ✓ tech-events-assistant.local.json 已保存",
  ]);
});

test("section title is visually heavier than plain text", () => {
  const lines = renderSectionTitle("状态检查", { color: false }).map(stripAnsi);

  assert.deepEqual(lines, [
    `━━ 状态检查 ${"━".repeat(36)}`,
  ]);
});

test("step transition separates completed output from the next guide", () => {
  const lines = renderStepTransitionLines("检查状态", "创建 / 更新技术活动晨报自动化", {
    color: false,
  }).map(stripAnsi);

  assert.deepEqual(lines, [
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "✓ 检查状态 已完成",
    "→ 继续下一步：创建 / 更新技术活动晨报自动化",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
  ]);
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
