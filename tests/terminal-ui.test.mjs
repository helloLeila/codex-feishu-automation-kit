import assert from "node:assert/strict";
import test from "node:test";

import {
  cartoonProgressLine,
  completionLine,
  renderBannerLines,
  stripAnsi,
  terminalCellWidth,
} from "../scripts/lib/terminal-ui.mjs";

const DIGITAL_COMPLETION = "完成  ██████████████████████████████ 100%  已完成";

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
