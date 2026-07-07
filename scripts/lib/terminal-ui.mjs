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

function paint(text, colorName, enabled = true) {
  if (!enabled) return text;
  return `${codes[colorName]}${text}${codes.reset}`;
}

export function stripAnsi(text) {
  return String(text).replace(ANSI_PATTERN, "");
}

export function color(text, colorName, enabled = true) {
  return paint(text, colorName, enabled);
}

export function bold(text, enabled = true) {
  if (!enabled) return text;
  return `${codes.bold}${text}${codes.reset}`;
}

export function completionLine(options = {}) {
  const useColor = options.color ?? true;
  return [
    bold(paint("完成", "green", useColor), useColor),
    "  ✨🤖🎉🤖✨  ",
    paint("已完成", "green", useColor),
  ].join("");
}

export function cartoonProgressLine(percent, options = {}) {
  const width = options.width ?? 10;
  const useColor = options.color ?? true;
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
  const width = options.width ?? 10;
  const useColor = options.color ?? true;
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
  const useColor = options.color ?? true;
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  return paint(frames[index % frames.length], "cyan", useColor);
}

export function statusLine(label, state, options = {}) {
  const useColor = options.color ?? true;
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
