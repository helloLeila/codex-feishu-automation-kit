import assert from "node:assert/strict";
import test from "node:test";

import {
  cartoonProgressLine,
  completionLine,
  renderBannerLines,
  stripAnsi,
  terminalCellWidth,
} from "../scripts/lib/terminal-ui.mjs";

test("cartoon progress uses robots for in-progress percentages", () => {
  const line = stripAnsi(cartoonProgressLine(50, { color: false }));

  assert.equal(line, "进度  🤖🤖🤖🤖🤖▫️▫️▫️▫️▫️  50%");
});

test("completion state is green wording and does not show 100 percent", () => {
  const line = stripAnsi(cartoonProgressLine(100, { color: false }));

  assert.equal(line, "完成  ✨🤖🎉🤖✨  已完成");
  assert.equal(line.includes("100%"), false);
});

test("completionLine mirrors final progress state", () => {
  assert.equal(
    stripAnsi(completionLine({ color: false })),
    "完成  ✨🤖🎉🤖✨  已完成",
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
