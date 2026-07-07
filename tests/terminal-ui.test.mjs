import assert from "node:assert/strict";
import test from "node:test";

import {
  cartoonProgressLine,
  completionLine,
  stripAnsi,
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
