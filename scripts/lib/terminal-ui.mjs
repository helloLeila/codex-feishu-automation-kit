const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

const codes = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
};

function paint(text, colorName, enabled = !process.env.NO_COLOR) {
  if (!enabled) return text;
  return `${codes[colorName]}${text}${codes.reset}`;
}

export function stripAnsi(text) {
  return String(text).replace(ANSI_PATTERN, "");
}

export function color(text, colorName, enabled = !process.env.NO_COLOR) {
  return paint(text, colorName, enabled);
}

export function bold(text, enabled = !process.env.NO_COLOR) {
  if (!enabled) return text;
  return `${codes.bold}${text}${codes.reset}`;
}

export function terminalCellWidth(text) {
  let width = 0;
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    if (
      code === 0xfe0f ||
      (code >= 0x0300 && code <= 0x036f)
    ) {
      continue;
    }
    if (
      code >= 0x1100 &&
      (code <= 0x115f ||
        code === 0x2329 ||
        code === 0x232a ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe10 && code <= 0xfe19) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x1f300 && code <= 0x1faff))
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function padToCellWidth(text, targetWidth) {
  const missing = Math.max(0, targetWidth - terminalCellWidth(text));
  return `${text}${" ".repeat(missing)}`;
}

export function renderBannerLines(options = {}) {
  const useColor = options.color ?? !process.env.NO_COLOR;
  const title = options.title ?? "技术活动助手";
  const tagline = options.tagline ?? "找活动 · 配推送 · 查状态";
  const helper = options.helper ?? "npm run gba";
  const rows = [
    { avatar: "╭─🤖──╮", text: title, textColor: "bold" },
    { avatar: "│ •ᴗ• │", text: tagline, textColor: "yellow" },
    { avatar: "╰─────╯", text: helper, textColor: "gray" },
  ];
  const avatarWidth = Math.max(...rows.map((row) => terminalCellWidth(row.avatar)));
  const content = rows.map(
    (row) => `  ${padToCellWidth(row.avatar, avatarWidth)}  ${row.text}`,
  );
  const innerWidth = Math.max(...content.map(terminalCellWidth)) + 4;
  const top = `╭${"─".repeat(innerWidth)}╮`;
  const bottom = `╰${"─".repeat(innerWidth)}╯`;
  const body = content.map((line) => `│ ${padToCellWidth(line, innerWidth - 2)} │`);
  const rawLines = [top, ...body, bottom];

  if (!useColor) return rawLines;

  const coloredBody = rows.map((row, index) => {
    const rawContent = content[index];
    const trailing = " ".repeat(Math.max(0, innerWidth - 2 - terminalCellWidth(rawContent)));
    const avatar = paint(padToCellWidth(row.avatar, avatarWidth), "green", true);
    const text = row.textColor === "bold"
      ? bold(row.text, true)
      : paint(row.text, row.textColor, true);
    return `${paint("│", "cyan", true)}   ${avatar}  ${text}${trailing} ${paint("│", "cyan", true)}`;
  });

  return [paint(top, "cyan", true), ...coloredBody, paint(bottom, "cyan", true)];
}

export function completionLine(options = {}) {
  const useColor = options.color ?? !process.env.NO_COLOR;
  return [
    bold(paint("完成", "green", useColor), useColor),
    "  ✨🤖🎉🤖✨  ",
    paint("已完成", "green", useColor),
  ].join("");
}

export function cartoonProgressLine(percent, options = {}) {
  const width = options.width ?? 20;
  const useColor = options.color ?? !process.env.NO_COLOR;
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));

  if (safePercent >= 100) return completionLine({ color: useColor });

  const filled = Math.floor((safePercent / 100) * width);
  const empty = width - filled;
  const robots = "🤖".repeat(filled);
  const blanks = "▫️".repeat(empty);

  return [
    paint("进度  ", "gray", useColor),
    paint(robots, "cyan", useColor),
    paint(blanks, "gray", useColor),
    paint(`  ${safePercent}%`, "yellow", useColor),
  ].join("");
}

export function classicProgressLine(percent, options = {}) {
  const width = options.width ?? 20;
  const useColor = options.color ?? !process.env.NO_COLOR;
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));

  if (safePercent >= 100) return completionLine({ color: useColor });

  const filled = Math.floor((safePercent / 100) * width);
  const empty = width - filled;

  return [
    paint("进度  ", "gray", useColor),
    paint("█".repeat(filled), "cyan", useColor),
    paint("░".repeat(empty), "gray", useColor),
    paint(`  ${safePercent}%`, "yellow", useColor),
  ].join("");
}

export function spinnerFrame(index, options = {}) {
  const useColor = options.color ?? !process.env.NO_COLOR;
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  return paint(frames[index % frames.length], "cyan", useColor);
}

export function statusLine(label, state, options = {}) {
  const useColor = options.color ?? !process.env.NO_COLOR;
  const palette = {
    ok: "green",
    warn: "yellow",
    error: "red",
    info: "cyan",
  };
  const symbol = {
    ok: "✓",
    warn: "!",
    error: "×",
    info: "·",
  };
  const tone = palette[state] ?? "gray";
  return `${paint(symbol[state] ?? "·", tone, useColor)} ${label}`;
}
