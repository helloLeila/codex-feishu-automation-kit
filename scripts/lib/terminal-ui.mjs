const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

const codes = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  black: "\x1b[30m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
  bgCyan: "\x1b[46m",
  bgGreen: "\x1b[42m",
};

function paint(text, colorName, enabled = !process.env.NO_COLOR) {
  if (!enabled) return text;
  return `${codes[colorName]}${text}${codes.reset}`;
}

function emphasize(text, colorName, enabled = !process.env.NO_COLOR) {
  if (!enabled) return text;
  return `${codes.bold}${codes[colorName]}${text}${codes.reset}`;
}

function callout(text, backgroundName, enabled = !process.env.NO_COLOR) {
  if (!enabled) return text;
  return `${codes.bold}${codes.black}${codes[backgroundName]} ${text} ${codes.reset}`;
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
  const width = options.width ?? 22;
  return [
    bold(paint("完成", "green", useColor), useColor),
    "  ",
    paint("█".repeat(width), "green", useColor),
    " ",
    paint("100%", "green", useColor),
  ].join("");
}

export function digitalProgressLine(percent, options = {}) {
  const width = options.width ?? 30;
  const label = options.label ?? "进度";
  const prefix = options.prefix ? `${options.prefix} ` : "";
  const useColor = options.color ?? !process.env.NO_COLOR;
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));

  if (safePercent >= 100 && label === "完成") return completionLine({ color: useColor, width });

  const filled = Math.floor((safePercent / 100) * width);
  const empty = width - filled;

  return [
    prefix ? paint(prefix, "cyan", useColor) : "",
    paint(`${label}  `, safePercent >= 100 ? "green" : "gray", useColor),
    paint("█".repeat(filled), safePercent >= 100 ? "green" : "cyan", useColor),
    paint("░".repeat(empty), "gray", useColor),
    paint(` ${safePercent}%`, "yellow", useColor),
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

export function renderNeonProgressLine(percent, options = {}) {
  const width = options.width ?? 22;
  const label = options.label ?? "保存中";
  const useColor = options.color ?? !process.env.NO_COLOR;
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = Math.floor((safePercent / 100) * width);
  const empty = width - filled;
  const isComplete = safePercent >= 100;
  const labelGap = "  ";

  if (isComplete) {
    return [
      bold(paint(label, "green", useColor), useColor),
      labelGap,
      paint("█".repeat(width), "green", useColor),
      " ",
      paint("100%", "green", useColor),
    ].join("");
  }

  const cyanCount = Math.ceil(filled / 2);
  const magentaCount = filled - cyanCount;

  return [
    paint(label, "cyan", useColor),
    labelGap,
    paint("█".repeat(cyanCount), "cyan", useColor),
    paint("█".repeat(magentaCount), "magenta", useColor),
    paint("░".repeat(empty), "gray", useColor),
    " ",
    paint(`${Math.round(safePercent)}%`, "magenta", useColor),
  ].join("");
}

export function renderNeonCompletionLines(result, options = {}) {
  const useColor = options.color ?? !process.env.NO_COLOR;
  const width = options.width ?? 22;
  return [
    renderNeonProgressLine(100, { label: "完成", width, color: useColor }),
    `      ${paint("✓", "green", useColor)} ${paint(result, "green", useColor)}`,
  ];
}

export function renderSectionTitle(title, options = {}) {
  const useColor = options.color ?? !process.env.NO_COLOR;
  const width = options.width ?? 48;
  const text = `━━ ${title} `;
  const line = `${text}${"━".repeat(Math.max(2, width - terminalCellWidth(text)))}`;
  return [bold(paint(line, "cyan", useColor), useColor)];
}

export function renderStepTransitionLines(completedStep, nextStep, options = {}) {
  const useColor = options.color ?? !process.env.NO_COLOR;
  const lines = [
    "",
    `${paint("✓", "green", useColor)} ${paint(`${completedStep}已完成`, "green", useColor)}`,
  ];

  if (nextStep) {
    const prefix = Number.isInteger(options.nextStepNumber)
      ? `${options.nextStepNumber} `
      : "";
    lines.push("");
    lines.push(bold(paint("下一步", "cyan", useColor), useColor));
    lines.push(`  ${paint(`${prefix}${nextStep}`, "gray", useColor)}`);
  } else if (options.completeMessage) {
    lines.push("");
    lines.push(`  ${paint(options.completeMessage, "gray", useColor)}`);
  }

  lines.push("");
  return lines;
}

export function renderGuideActionPrompt(stepNumber, stepTitle, options = {}) {
  const useColor = options.color ?? !process.env.NO_COLOR;
  const action = `${paint("[Enter]", "cyan", useColor)} ${paint("执行", "gray", useColor)}  ${paint(`${stepNumber} ${stepTitle}`, "cyan", useColor)}`;
  return [
    "",
    action,
    paint("› ", "cyan", useColor),
  ].join("\n");
}

export function renderGuideCompletePrompt(options = {}) {
  const useColor = options.color ?? !process.env.NO_COLOR;
  return [
    "",
    `${paint("[Enter]", "cyan", useColor)} ${paint("退出", "gray", useColor)}  ${paint("[1-5]", "cyan", useColor)} ${paint("重跑步骤", "gray", useColor)}`,
    paint("› ", "cyan", useColor),
  ].join("\n");
}

export function renderActionPanelLines(title, items, options = {}) {
  const useColor = options.color ?? !process.env.NO_COLOR;
  const safeItems = Array.isArray(items) ? items : [];
  const labelWidth = Math.max(
    0,
    ...safeItems.map((item) => terminalCellWidth(Array.isArray(item) ? item[0] : String(item))),
  );
  const labelColumnWidth = labelWidth + 4;
  const lines = [
    emphasize(title, "cyan", useColor),
    "",
  ];

  safeItems.forEach((item, index) => {
    const [label, value] = Array.isArray(item) ? item : [String(item), ""];
    const number = emphasize(`${index + 1}.`, "cyan", useColor);
    const labelText = paint(padToCellWidth(label, labelColumnWidth), value ? "gray" : "cyan", useColor);
    const valueTone = /名称|时间|运行/.test(label)
      ? "yellow"
      : /剪贴板/.test(label) && /已/.test(value)
        ? "green"
        : "cyan";
    const valueText = value
      ? emphasize(value, valueTone, useColor)
      : "";
    lines.push(`  ${number} ${labelText}${valueText}`);
  });

  return lines;
}

export function renderGuideDashboardLines(options = {}) {
  const useColor = options.color ?? !process.env.NO_COLOR;
  const steps = options.steps ?? [];
  const shortLabels = options.shortLabels ?? steps;
  const currentStep = Number.isInteger(options.currentStep) ? options.currentStep : null;
  const completedSteps = options.completedSteps instanceof Set
    ? options.completedSteps
    : new Set(options.completedSteps ?? []);
  const activeCount = currentStep === null ? steps.length : currentStep + 1;
  const title = options.title ?? "技术活动助手";
  const mode = options.mode ?? "配置引导";

  const railItems = shortLabels.map((label, index) => {
    if (completedSteps.has(index)) return `${paint("●", "green", useColor)} ${paint(label, "gray", useColor)}`;
    if (index === currentStep) return `${emphasize("◉", "magenta", useColor)} ${emphasize(label, "magenta", useColor)}`;
    return `${paint("○", "gray", useColor)} ${paint(label, "gray", useColor)}`;
  });
  const plainRailItems = shortLabels.map((label, index) => {
    if (completedSteps.has(index)) return `● ${label}`;
    if (index === currentStep) return `◉ ${label}`;
    return `○ ${label}`;
  });
  const lines = [
    `${emphasize(title, "cyan", useColor)} ${paint(`· ${mode}`, "gray", useColor)} ${emphasize(`${activeCount}/${steps.length}`, currentStep === null ? "green" : "magenta", useColor)}`,
    "",
    railItems.join("   "),
  ];

  if (currentStep !== null) {
    const preceding = plainRailItems.slice(0, currentStep).join("   ");
    const offset = terminalCellWidth(preceding) + (currentStep > 0 ? 4 : 1);
    lines.push(`${" ".repeat(offset)}${paint("↑ 当前步骤", "magenta", useColor)}`);
  } else {
    lines.push(paint("全部步骤已完成", "green", useColor));
  }

  const currentTitle = currentStep === null ? "全部步骤已完成" : steps[currentStep];
  lines.push(
    "",
    emphasize("当前任务", "cyan", useColor),
    `  ${bold(currentTitle, useColor)}`,
    "",
    emphasize("已检测", "cyan", useColor),
  );

  steps.forEach((step, index) => {
    if (completedSteps.has(index)) {
      lines.push(`  ${paint("✓", "green", useColor)} ${step}`);
    } else if (index === currentStep) {
      lines.push(`  ${emphasize("◉", "magenta", useColor)} ${emphasize(step, "magenta", useColor)}`);
    } else {
      lines.push(`  ${paint("·", "gray", useColor)} ${paint(step, "gray", useColor)}`);
    }
  });

  lines.push(
    "",
    `${paint("[Enter]", "cyan", useColor)} 执行当前步骤   ${paint("[1-5]", "cyan", useColor)} 跳转   ${paint("[d]", "cyan", useColor)} 详情   ${paint("[b]", "cyan", useColor)} 菜单   ${paint("[q]", "cyan", useColor)} 退出`,
  );

  return lines;
}

export function renderStepFlowLines(title, steps, options = {}) {
  const useColor = options.color ?? !process.env.NO_COLOR;
  const activeIndex = Number.isInteger(options.activeIndex) ? options.activeIndex : -1;
  const complete = Boolean(options.complete);
  const spinner = options.spinner ?? "⠙";
  const safeSteps = Array.isArray(steps) ? steps : [];
  const lines = [
    ...renderSectionTitle(title, { color: useColor }),
    paint("│", "gray", useColor),
  ];

  safeSteps.forEach((step, index) => {
    const connector = index === safeSteps.length - 1 ? "└─" : "├─";
    const marker = complete || index < activeIndex
      ? paint("✓", "green", useColor)
      : index === activeIndex
        ? paint(spinner, "magenta", useColor)
        : paint("·", "gray", useColor);
    const stepText = index === activeIndex && !complete
      ? emphasize(step, "magenta", useColor)
      : complete || index < activeIndex
        ? step
        : paint(step, "gray", useColor);
    lines.push(`${paint(connector, "gray", useColor)} ${marker} ${stepText}`);
  });

  if (complete && options.result) {
    lines.push("");
    lines.push(...renderNeonCompletionLines(options.result, {
      color: useColor,
      width: options.completionWidth,
    }));
  }

  return lines;
}

export function spinnerFrame(index, options = {}) {
  const useColor = options.color ?? !process.env.NO_COLOR;
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  return paint(frames[index % frames.length], "magenta", useColor);
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
