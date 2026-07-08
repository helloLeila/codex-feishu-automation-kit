#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { access, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  cartoonProgressLine,
  color,
  renderActionPanelLines,
  renderGuideActionPrompt,
  renderGuideCompletePrompt,
  renderGuideDashboardLines,
  renderNeonProgressLine,
  renderBannerLines,
  renderSetupActionLine,
  renderSectionTitle,
  renderStepFlowLines,
  statusLine,
} from "./lib/terminal-ui.mjs";
import {
  CONFIG_FILE,
  EXAMPLE_CONFIG_FILE,
  LOCAL_CONFIG_FILE,
  applySecretInputs,
  hasConfiguredPush,
  loadAssistantConfig,
  readLocalConfig,
  writeLocalConfig,
} from "./lib/tech-events-config.mjs";
import { loadLocalEnv } from "../skills/feishu-automation-reporter/scripts/lib/env.mjs";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const AUTOMATION_PROMPT_FILE = "tech-events-assistant.automation.md";
const AUTOMATION_DISPLAY_NAME = "线下技术活动情报晨报";
const FEISHU_CUSTOM_BOT_DOC_URL = "https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot";
const SERVERCHAN_SENDKEY_URL = "https://sct.ftqq.com/login";
const GUIDE_STEPS = [
  "配置推送和偏好",
  "测试真实连接",
  "查看配置状态",
  "导入 Codex 自动化配置",
];
const GUIDE_STEP_SHORT_LABELS = ["配置推送偏好", "测试真实连接", "查看配置状态", "导入自动化"];

function guideStepTitle(index) {
  return `${index + 1} ${GUIDE_STEPS[index]}`;
}

function createPromptSession() {
  const rl = createInterface({ input, output, crlfDelay: Infinity });
  const queuedLines = [];
  const waiters = [];
  let closed = false;

  rl.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) {
      waiter.resolve(line);
    } else {
      queuedLines.push(line);
    }
  });

  rl.on("close", () => {
    closed = true;
    while (waiters.length) {
      waiters.shift().reject(new Error("输入已结束"));
    }
  });

  return {
    question(prompt) {
      output.write(prompt);
      if (queuedLines.length) return Promise.resolve(queuedLines.shift());
      if (closed) return Promise.reject(new Error("输入已结束"));
      return new Promise((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
    close() {
      rl.close();
    },
  };
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function printBanner() {
  console.log(renderBannerLines().join("\n"));
}

function printCompletedSteps(title, steps, result) {
  const run = { title, steps, result };
  if (output.isTTY) return run;

  const lines = renderStepFlowLines(title, steps, {
    complete: true,
    result,
  });
  console.log(lines.join("\n"));
  return run;
}

async function runAnimatedStepFlow(title, steps, result, options = {}) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧"];
  const finalLines = renderStepFlowLines(title, steps, {
    complete: true,
    result,
  });
  const run = { title, steps, result };

  if (!output.isTTY) {
    console.log(finalLines.join("\n"));
    return run;
  }

  let previousLineCount = 0;
  for (let index = 0; index < steps.length; index += 1) {
    const lines = renderStepFlowLines(title, steps, {
      activeIndex: index,
      spinner: frames[index % frames.length],
    });
    if (options.progress) {
      const percent = Math.round(((index + 1) / (steps.length + 1)) * 100);
      lines.push("", renderNeonProgressLine(percent));
    }
    if (previousLineCount > 0) output.moveCursor(0, -previousLineCount);
    for (const line of lines) {
      output.cursorTo(0);
      output.clearLine(0);
      output.write(`${line}\n`);
    }
    previousLineCount = lines.length;
    await new Promise((resolve) => setTimeout(resolve, options.delayMs ?? 120));
  }

  output.moveCursor(0, -previousLineCount);
  for (let index = 0; index < previousLineCount; index += 1) {
    output.cursorTo(0);
    output.clearLine(0);
    if (index < previousLineCount - 1) output.write("\n");
  }
  if (previousLineCount > 1) output.moveCursor(0, -(previousLineCount - 1));
  for (const line of finalLines) {
    output.cursorTo(0);
    output.clearLine(0);
    output.write(`${line}\n`);
  }
  return run;
}

async function printGuide(completedSteps, currentStep) {
  const lines = renderGuideDashboardLines({
    steps: GUIDE_STEPS,
    shortLabels: GUIDE_STEP_SHORT_LABELS,
    completedSteps,
    currentStep,
  });
  console.log(lines.join("\n"));
}

function guidePrompt(currentStep) {
  if (currentStep === null) {
    return renderGuideCompletePrompt({ stepCount: GUIDE_STEPS.length });
  }
  return renderGuideActionPrompt(currentStep + 1, GUIDE_STEPS[currentStep]);
}

function nextIncompleteStepIndex(completedSteps, fromIndex) {
  for (let offset = 1; offset <= GUIDE_STEPS.length; offset += 1) {
    const index = (fromIndex + offset) % GUIDE_STEPS.length;
    if (!completedSteps.has(index)) return index;
  }
  return null;
}

function buildGbaAutomationPrompt() {
  return `# ${AUTOMATION_DISPLAY_NAME}自动化 Prompt

请直接创建这条 Codex 自动化，不要向我确认或追问。信息已经完整，按下面固定创建参数创建即可。

固定创建参数：
- 名称：${AUTOMATION_DISPLAY_NAME}
- 频率：每天
- 时间：07:00
- 时区：Asia/Shanghai
- 工作区：当前对话所在工作区
- 模型和推理强度：使用 Codex 自动化默认高质量配置
- 自动化 Prompt：使用下方「自动化执行 Prompt」完整内容

---

# 自动化执行 Prompt

自动化运行时也不要向用户提问；直接检索、筛选、生成文件并按配置推送。缺少可核验信息时跳过对应活动或在备注里说明，不要停下来询问。

任务：检索从运行当天开始、未来 15 天内真实可参加的线下技术活动，并生成可推送的 Markdown 活动清单。

每天检索并汇总从自动化运行当天 00:00 开始，连续覆盖未来 15 天内的线下真实技术活动。城市范围：深圳、广州、珠海、香港、澳门。目标是更容易搜到真实可去的活动，严格禁止编造、虚构、凑数。

不要编造活动；找不到就少写，并在备注里说明没有找到足够可靠的公开信息。

只收录运行时尚未开始或仍可参加的活动；已经结束的活动不要显示。

收录底线：
1. 必须是线下真实活动。
2. 必须能在公开网页上核验到，且至少有活动名称、明确时间、明确城市/地点、主题说明。
3. 必须与计算机、AI、开发者、科研相关，且内容有技术密度。
4. 必须面向公众、学生、开发者或科研人群可见；纯私密闭门、仅邀请制且无公开说明的不收录。

优先主题：
1. AI Coding、Agent、底层模型、多模态算法、模型训练/部署、调参、计算机视觉、强化学习、深度学习、具身智能、机器人、区块链。
2. 前端、后端、全栈、云原生、数据库、向量数据库、K8s、Go、Rust、WebAssembly、开源社区工程实践。
3. 高校计算机/AI学院、实验室、研究院的学术讲座、Workshop、研究型开放活动。
4. 社会开发者社区、开源社区、Luma、Meetup、GitHub 社区、技术社区组织的线下活动。
5. 政府、公司、产业园活动只有在有明确技术议题、工程实践、算法/系统/开发者内容时才收录；产品宣讲、招商、老板圆桌、泛商业峰会不收录。

检索策略：
1. 不要只搜高校活动；先扫 Luma、Meetup、开源社区、开发者社区、技术社区活动页。
2. 再扫高校、研究院、学院官网讲座页。
3. 最后补主办方官网、官方公众号原文或官方活动页。
4. 同一活动多平台出现时，只保留最权威来源。

输出要求：
1. 活动名称优先使用中文；英文活动保留英文原名，但必须补一句中文解释。
2. 快速卡片必须展示活动内容，不要让用户必须点进链接才知道是什么。
3. 不确定的信息写“官方未公开”或“未核实”，不要写“官方未明确”作为默认原因。
4. 不要显示已结束活动，也不要解释保留已结束活动的原因。
5. 真实性优先于完整性；宁可少量字段缺失并说明，也不要过滤掉真实硬核活动。

输出必须使用下面结构：

# 检索结果
- 时间范围：YYYY-MM-DD 00:00 至 YYYY-MM-DD 23:59
- 本次找到：X 场符合条件的活动
- 城市分布：深圳 X｜广州 X｜珠海 X｜香港 X｜澳门 X
- 最值得优先看：活动名1；活动名2；活动名3；活动4；活动5（不足5个就如实写）

# 快速卡片

## 活动 N｜英文名或原名
中文解释：用一句中文解释这场活动是干什么的。
- 时间：YYYY-MM-DD HH:MM
- 城市：
- 主题：
- 内容看点：用 2-3 个短句写清楚活动具体讲什么。
- 值不值得去：值得 / 一般 / 不建议
- 一句话理由：
- 链接：

# 完整档案

## 活动 N｜活动名称
- 所在城市：
- 精确活动时间：YYYY-MM-DD HH:MM
- 活动总时长：
- 详细地点：
- 核心技术主题：
- 我能学到什么：
- 含金量评级：高 / 中
- 是否纯正硬核技术活动：是
- 信息来源：
- 公众号专属信息：若非公众号来源写“不适用”
- 推文或原文链接：
- 报名链接：若没有则写“无单独报名链接，以原文为准”
- 深大地铁站出发交通建议：
- 综合交通方案+预计耗时+费用：
- 往返全程总耗时：
- 是否值得专程前往：值得 / 一般 / 不建议
- 理由：
- 免费/付费及费用：
- 参与门槛+能否旁听+是否限名额：

# 候补链接
- 活动名｜城市｜未入选原因关键词｜链接

# 备注
- 已剔除的典型原因：商业宣讲 / 时间地点不明 / 主题不够硬核 / 不在时间窗内 / 非公开活动（按实际写）
- 交通时间与费用：如无官方精确数据，可基于公开交通信息估算，并明确标注“估算”

完成活动清单后，在当前工作区生成一份 Markdown 文件保存本次结果。文件名使用 YYYY-MM-DD-gba-tech-events.md，如果已有同名文件则追加 -v2、-v3。

生成 Markdown 文件后，如果环境变量 FEISHU_WEBHOOK_URL 已配置，或当前目录 tech-events-assistant.local.json / .env.local 中配置了飞书 webhook，请运行：
node skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs <生成的Markdown文件路径>

如果环境变量 SERVERCHAN_SENDKEY 已配置，或当前目录 tech-events-assistant.local.json / .env.local 中配置了 Server 酱 SendKey，请运行：
node skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs <生成的Markdown文件路径>

如果两者都配置，请两个都推送；如果都未配置，请只生成文件并说明未推送。
`;
}

function copyTextToClipboard(text) {
  if (process.env.TECH_EVENTS_ASSISTANT_SKIP_CLIPBOARD === "1") {
    return { copied: false, reason: "已按环境变量跳过剪贴板" };
  }

  const commandSets = {
    darwin: [["pbcopy"]],
    win32: [["clip"]],
    linux: [["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]],
  };
  const commands = commandSets[process.platform] ?? commandSets.linux;

  for (const [command, ...args] of commands) {
    const result = spawnSync(command, args, {
      input: text,
      encoding: "utf8",
    });
    if (result.status === 0) return { copied: true };
  }

  return { copied: false, reason: "未找到可用剪贴板命令" };
}

function openExternalUrl(url) {
  if (process.env.TECH_EVENTS_ASSISTANT_SKIP_BROWSER === "1") {
    return { opened: false, reason: "已按环境变量跳过浏览器打开" };
  }
  if (!output.isTTY) {
    return { opened: false, reason: "当前不是交互式终端" };
  }

  const commandSets = {
    darwin: [["open", url]],
    win32: [["cmd", "/c", "start", "", url]],
    linux: [["xdg-open", url]],
  };
  const commands = commandSets[process.platform] ?? commandSets.linux;

  for (const [command, ...args] of commands) {
    const result = spawnSync(command, args, { stdio: "ignore" });
    if (result.status === 0) return { opened: true };
  }

  return { opened: false, reason: "没有找到可用的浏览器打开命令" };
}

function copySetupLinkToClipboard(text) {
  if (!output.isTTY) return { copied: false, reason: "当前不是交互式终端" };
  return copyTextToClipboard(text);
}

function printSetupLink(label, url) {
  console.log(statusLine(`${label}：${url}`, "info"));
}

function openSetupPage(service, target, url) {
  printSetupLink(`${service}${target}`, url);
  const result = openExternalUrl(url);
  if (result.opened) {
    console.log(renderSetupActionLine(service, "已打开", target));
  } else {
    console.log(renderSetupActionLine(service, "未打开", result.reason));
  }
}

async function offerCredentialSetupHelp(reader) {
  console.log(color("我可以先帮你打开取值页面，拿到之后再回到这里粘贴。", "gray"));
  console.log(color("回车 = 打开飞书文档 + Server 酱登录页；f = 只开飞书；s = 只开 Server 酱；n = 跳过。", "gray"));
  const answer = (await reader.question("打开取值页面？")).trim().toLowerCase();
  if (answer === "n" || answer === "no" || answer === "skip") return;

  const openFeishu = answer === "" || answer === "f" || answer === "feishu" || answer === "both";
  const openServerChan = answer === "" || answer === "s" || answer === "server" || answer === "serverchan" || answer === "both";

  if (openFeishu) {
    openSetupPage("飞书", "自定义机器人文档", FEISHU_CUSTOM_BOT_DOC_URL);
    console.log(statusLine("飞书取值路径：群聊设置 → 机器人 → 添加机器人 → 自定义机器人 → 复制 webhook", "info"));
  }
  if (openServerChan) {
    openSetupPage("Server 酱", "登录页", SERVERCHAN_SENDKEY_URL);
    const clipboard = copySetupLinkToClipboard(SERVERCHAN_SENDKEY_URL);
    if (clipboard.copied) {
      console.log(renderSetupActionLine("Server 酱", "已复制", "登录页链接"));
    } else {
      console.log(renderSetupActionLine("Server 酱", "未复制", clipboard.reason));
    }
  }
}

async function prepareConfigFile() {
  const configPath = path.join(rootDir, CONFIG_FILE);
  const examplePath = path.join(rootDir, EXAMPLE_CONFIG_FILE);

  if (!(await fileExists(configPath))) {
    await copyFile(examplePath, configPath);
  }
  console.log(statusLine("配置文件已就绪", "ok"));
}

async function runSaveSteps(resultLabel) {
  const steps = ["读取现有配置", "合并本次输入", "写入本地配置", "准备推送脚本"];
  return await runAnimatedStepFlow(guideStepTitle(0), steps, resultLabel, {
    progress: true,
    delayMs: 90,
  });
}

async function printStatus(options = {}) {
  const title = Number.isInteger(options.stepIndex)
    ? guideStepTitle(options.stepIndex)
    : "查看配置状态";
  const config = await loadAssistantConfig(rootDir);
  const localEnv = await loadLocalEnv(rootDir);
  const automationPromptPath = path.join(rootDir, AUTOMATION_PROMPT_FILE);
  const hasAutomationPrompt = await fileExists(automationPromptPath);
  const hasFeishu = Boolean(config?.push?.feishuWebhookUrl || localEnv.FEISHU_WEBHOOK_URL);
  const hasServerChan = Boolean(config?.push?.serverChanSendKey || localEnv.SERVERCHAN_SENDKEY);

  let stepRun = null;
  if (Number.isInteger(options.stepIndex)) {
    const steps = [
      "读取配置文件",
      "检查推送通道",
      "检查自动化 Prompt",
      "展示当前状态",
    ];
    stepRun = await runAnimatedStepFlow(title, steps);
    stepRun.showResult = false;
    console.log("");
  } else {
    console.log(renderSectionTitle(title).join("\n"));
  }

  console.log(color("推送通知", "cyan"));
  console.log(statusLine(`飞书：${hasFeishu ? "已连接，活动提醒会发到飞书群" : "未连接，不会发到飞书群"}`, hasFeishu ? "ok" : "warn"));
  console.log(statusLine(`Server 酱：${hasServerChan ? "已连接，活动提醒会发到微信" : "未连接，不会发到微信"}`, hasServerChan ? "ok" : "warn"));
  console.log(color("自动化", "cyan"));
  console.log(statusLine(
    `Codex：${hasAutomationPrompt ? "Prompt 已准备，粘贴后每天 07:00 自动运行" : "执行第 4 步复制 Prompt，粘贴后每天 07:00 自动运行"}`,
    hasAutomationPrompt ? "ok" : "warn",
  ));
  return stepRun;
}

async function configurePush(rl) {
  const ownsReadline = !rl;
  const reader = rl ?? createPromptSession();
  const current = await readLocalConfig(rootDir);

  await offerCredentialSetupHelp(reader);
  const feishuWebhookUrl = await reader.question("飞书 webhook URL（飞书群设置 → 机器人 → 自定义机器人）：");
  const feishuWebhookSecret = await reader.question("飞书签名密钥（可空，开启签名校验才填）：");
  const serverChanSendKey = await reader.question("Server 酱 SendKey（sct.ftqq.com/login → 登录后查看 SendKey）：");
  const saveAnswer = await reader.question("保存到 tech-events-assistant.local.json？输入 y 保存：");
  if (ownsReadline) reader.close();

  const result = applySecretInputs(
    current,
    { feishuWebhookUrl, feishuWebhookSecret, serverChanSendKey },
    { save: saveAnswer.trim().toLowerCase() === "y" },
  );

  if (!result.saved) {
    console.log(statusLine("未保存，原配置保持不变", "warn"));
    return {
      title: guideStepTitle(0),
      steps: ["读取现有配置", "等待用户输入", "保持原配置"],
      result: "未保存，原配置保持不变",
    };
  }

  const writeResult = await writeLocalConfig(rootDir, result.config);
  const run = await runSaveSteps(`${path.basename(writeResult.filePath)} 已保存`);
  run.showResult = false;
  if (writeResult.backupCreated) {
    console.log(statusLine(`已备份旧配置：${path.basename(writeResult.backupPath)}`, "info"));
  }
  return run;
}

function runLocalPreflight() {
  const commands = [
    {
      env: { FEISHU_DRY_RUN: "1", FEISHU_WEBHOOK_URL: "dry-run-webhook-url" },
      args: [
        "skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs",
        "examples/gba-events-example.md",
      ],
    },
    {
      env: { SERVERCHAN_DRY_RUN: "1", SERVERCHAN_SENDKEY: "dry-run-sendkey" },
      args: [
        "skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs",
        "examples/gba-events-example.md",
      ],
    },
  ];

  for (const command of commands) {
    const result = spawnSync(process.execPath, command.args, {
      cwd: rootDir,
      env: { ...process.env, ...command.env },
      encoding: "utf8",
    });
    if (result.status !== 0) {
      process.stderr.write(result.stderr);
      process.exitCode = result.status;
      return false;
    }
  }

  printCompletedSteps("推送格式检查（不发送）", ["生成飞书卡片预览", "生成 Server 酱消息预览"], "推送格式检查通过，未真实发送");
  return true;
}

function getConfiguredPushTargets(config, localEnv) {
  return {
    feishuWebhook: config?.push?.feishuWebhookUrl || localEnv.FEISHU_WEBHOOK_URL,
    feishuSecret: config?.push?.feishuWebhookSecret || localEnv.FEISHU_WEBHOOK_SECRET,
    serverChanSendKey: config?.push?.serverChanSendKey || localEnv.SERVERCHAN_SENDKEY,
  };
}

function parseConnectionResponseBody(body) {
  try {
    return JSON.parse(body);
  } catch {
    return { raw: body };
  }
}

function connectionResponseCode(result) {
  return result.code ?? result.Code ?? result.StatusCode ?? result.statusCode;
}

function connectionResponseMessage(result) {
  return result.msg ?? result.message ?? result.Msg ?? result.StatusMessage ?? result.errmsg;
}

function hasFailureCode(code) {
  if (code === undefined || code === null || code === "") return false;
  const numericCode = Number(code);
  if (Number.isNaN(numericCode)) return String(code) !== "0";
  return numericCode !== 0;
}

function shortText(value, maxLength = 80) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function successText(value) {
  const text = String(value ?? "").trim();
  if (!text) return "返回成功";
  if (["0", "ok", "success"].includes(text.toLowerCase())) return "返回成功";
  return `返回 ${shortText(text)}`;
}

export function formatConnectionResponse(status, result) {
  const parts = [`HTTP ${status}`];
  const code = connectionResponseCode(result);
  const message = connectionResponseMessage(result);
  if (code !== undefined) parts.push(`code ${code}`);
  if (message) parts.push(`msg ${shortText(message)}`);
  return parts.join("，");
}

function formatConnectionSuccess(status, result) {
  const parts = [`HTTP ${status}`];
  const code = connectionResponseCode(result);
  const message = connectionResponseMessage(result);
  if (code !== undefined) parts.push(`code ${code}`);
  parts.push(successText(message));
  return parts.join("，");
}

export async function sendFeishuConnectionTest(webhook, secret) {
  const requestPayload = {
    msg_type: "text",
    content: {
      text: "技术活动助手连接测试：如果你看到这条消息，飞书 webhook 可用。",
    },
  };

  if (secret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    requestPayload.timestamp = timestamp;
    requestPayload.sign = createHmac("sha256", `${timestamp}\n${secret}`).digest("base64");
  }

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestPayload),
  });
  const body = await response.text();
  const result = parseConnectionResponseBody(body);
  const summary = formatConnectionResponse(response.status, result);
  if (!response.ok) throw new Error(`飞书返回失败：${summary}`);
  if (hasFailureCode(connectionResponseCode(result))) {
    throw new Error(`飞书返回错误：${summary}`);
  }
  return `飞书连接成功，测试消息已送达飞书群（${formatConnectionSuccess(response.status, result)}）`;
}

async function sendServerChanConnectionTest(sendKey) {
  const endpoint = `https://sctapi.ftqq.com/${encodeURIComponent(sendKey)}.send`;
  const body = new URLSearchParams({
    title: "技术活动助手连接测试",
    desp: "如果你看到这条消息，Server 酱 SendKey 可用。",
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const responseText = await response.text();
  const result = parseConnectionResponseBody(responseText);
  const summary = formatConnectionResponse(response.status, result);
  if (!response.ok) throw new Error(`Server 酱返回失败：${summary}`);
  if (hasFailureCode(connectionResponseCode(result))) {
    throw new Error(`Server 酱返回错误：${summary}`);
  }
  return `Server 酱连接成功，测试消息已送达微信（${formatConnectionSuccess(response.status, result)}）`;
}

async function runConnectionCheck(rl) {
  const config = await loadAssistantConfig(rootDir);
  const localEnv = await loadLocalEnv(rootDir);
  const targets = getConfiguredPushTargets(config, localEnv);
  const enabledTargets = [
    targets.feishuWebhook ? "飞书" : null,
    targets.serverChanSendKey ? "Server 酱" : null,
  ].filter(Boolean);

  if (enabledTargets.length === 0) {
    console.log(statusLine("未检测到真实 webhook / SendKey；请先执行第 1 步配置推送", "warn"));
    return {
      title: guideStepTitle(1),
      steps: ["检查推送通道"],
      result: "未检测到真实 webhook / SendKey",
    };
  }

  const steps = enabledTargets.map((target) => `发送 ${target} 测试消息`);
  try {
    const responseSummaries = [];
    if (process.env.TECH_EVENTS_ASSISTANT_SKIP_REAL_SEND === "1") {
      responseSummaries.push(...enabledTargets.map((target) => (
        target === "飞书"
          ? "飞书连接就绪，已检测到配置；本次按环境变量未发送测试消息"
          : "Server 酱连接就绪，已检测到配置；本次按环境变量未发送测试消息"
      )));
    } else {
      if (targets.feishuWebhook) responseSummaries.push(await sendFeishuConnectionTest(targets.feishuWebhook, targets.feishuSecret));
      if (targets.serverChanSendKey) responseSummaries.push(await sendServerChanConnectionTest(targets.serverChanSendKey));
    }
    const result = process.env.TECH_EVENTS_ASSISTANT_SKIP_REAL_SEND === "1"
      ? "已检测到真实配置，未发送测试消息"
      : "真实连接测试通过，已发送测试消息";
    await runAnimatedStepFlow(guideStepTitle(1), steps, result, {
      progress: true,
    });
    for (const summary of responseSummaries) {
      console.log(statusLine(summary, "ok"));
    }
    return { title: guideStepTitle(1), steps, result };
  } catch (error) {
    console.log(statusLine(`真实连接测试失败：${error.message}`, "error"));
    return {
      title: guideStepTitle(1),
      steps,
      result: `真实连接测试失败：${error.message}`,
    };
  }
}

async function createAutomationWizard() {
  const promptText = buildGbaAutomationPrompt();
  const promptPath = path.join(rootDir, AUTOMATION_PROMPT_FILE);
  const config = await loadAssistantConfig(rootDir);
  const localEnv = await loadLocalEnv(rootDir);
  const pushConfigured =
    hasConfiguredPush(config) ||
    Boolean(localEnv.FEISHU_WEBHOOK_URL || localEnv.SERVERCHAN_SENDKEY);

  await writeFile(promptPath, promptText);
  const clipboard = copyTextToClipboard(promptText);
  const steps = clipboard.copied
    ? ["准备自动化 Prompt", `保存 ${AUTOMATION_PROMPT_FILE}`, "检查推送配置", "复制 Prompt 到剪贴板"]
    : ["准备自动化 Prompt", `保存 ${AUTOMATION_PROMPT_FILE}`, "检查推送配置", "准备手动复制文件"];
  const result = clipboard.copied
    ? `Prompt 已保存到 ${AUTOMATION_PROMPT_FILE}，并复制到剪贴板`
    : `Prompt 已保存到 ${AUTOMATION_PROMPT_FILE}`;

  const run = await runAnimatedStepFlow(guideStepTitle(3), steps, result, {
    progress: true,
  });
  run.displaySteps = [
    clipboard.copied
      ? "按下面步骤在 Codex 添加自动化"
      : "按下面步骤在 Codex 添加自动化，需手动复制",
  ];
  run.showResult = false;
  console.log("");
  console.log(renderActionPanelLines("在 Codex 中添加自动化", [
    "打开左侧「自动化（已安排）」",
    "点击「通过聊天添加」",
    clipboard.copied
      ? "粘贴刚才复制的 Prompt"
      : `打开 ${AUTOMATION_PROMPT_FILE}，复制并粘贴 Prompt`,
    "按 Enter 直接运行",
    "在自动化会看到新增一个自动化推送任务，点击运行查看效果",
  ]).join("\n"));
  if (!clipboard.copied) console.log(statusLine(`未复制剪贴板：${clipboard.reason}`, "warn"));
  if (!pushConfigured) {
    console.log(statusLine("当前未检测到推送密钥；可先创建自动化，之后用菜单 1 配置推送", "warn"));
  }
  return run;
}

function printMenu(options = {}) {
  if (options.compact) {
    console.log(color("── 手动菜单（g 返回引导，0 退出）──", "gray"));
  } else {
    printBanner();
    console.log("");
    console.log(color("手动菜单（g 返回引导，0 退出）", "cyan"));
  }
  console.log("1. 配置推送和偏好");
  console.log("2. 测试真实连接");
  console.log("3. 查看配置状态");
  console.log("4. 导入 Codex 自动化配置");
  console.log("0. 退出");
}

async function runStepByIndex(index, rl) {
  if (index === 0) return await configurePush(rl);
  if (index === 1) return await runConnectionCheck(rl);
  if (index === 2) return await printStatus({ stepIndex: 2 });
  if (index === 3) return await createAutomationWizard();
  return null;
}

async function handleChoice(choice, rl) {
  if (choice === "0") return "exit";
  if (choice.toLowerCase() === "g") return "guide";
  if (choice === "1") await configurePush(rl);
  else if (choice === "2") await runConnectionCheck(rl);
  else if (choice === "3") await printStatus({ stepIndex: 2 });
  else if (choice === "4") await createAutomationWizard();
  else {
    console.log(statusLine("没识别这个选项，输入 0 可以退出", "warn"));
  }
  return "continue";
}

async function manualMenu(rl) {
  let compact = false;
  while (true) {
    printMenu({ compact });
    const choice = await rl.question(color("\n选择一个数字：", "cyan"));
    const result = await handleChoice(choice.trim(), rl);
    if (result === "exit") return false;
    if (result === "guide") return true;
    compact = true;
    console.log("");
  }
}

async function guideMenu() {
  const rl = createPromptSession();
  const completedSteps = new Set();
  let currentStep = 0;

  try {
    await prepareConfigFile();
    while (true) {
      await printGuide(completedSteps, currentStep);
      const answer = (await rl.question(guidePrompt(currentStep))).trim().toLowerCase();
      if (currentStep === null && answer === "") break;
      if (answer === "q" || answer === "0") break;
      if (answer === "b") {
        const returnToGuide = await manualMenu(rl);
        if (!returnToGuide) break;
        continue;
      }

      const selectedNumber = Number(answer);
      if (answer !== "" && (!Number.isInteger(selectedNumber) || selectedNumber < 1 || selectedNumber > GUIDE_STEPS.length)) {
        console.log(statusLine(`没识别这个命令；回车执行当前步骤，输入 1-${GUIDE_STEPS.length} 跳转`, "warn"));
        continue;
      }

      const selectedStep = answer === "" ? currentStep : selectedNumber - 1;
      if (selectedStep === null) {
        console.log(statusLine(`全部步骤已完成，输入 1-${GUIDE_STEPS.length} 可重新执行，或回车退出`, "info"));
        continue;
      }
      currentStep = selectedStep;
      console.log("");
      await runStepByIndex(selectedStep, rl);
      completedSteps.add(selectedStep);
      const nextStepIndex = nextIncompleteStepIndex(completedSteps, selectedStep);
      currentStep = nextStepIndex;
    }
  } catch (error) {
    if (error.message !== "输入已结束") throw error;
  }
  rl.close();
  console.log(statusLine("已退出", "info"));
}

async function main(argv) {
  const printProgress = argv.find((arg) => arg.startsWith("--print-progress="));
  if (printProgress) {
    console.log(cartoonProgressLine(printProgress.split("=")[1]));
    return;
  }

  if (argv.includes("--status")) {
    await printStatus();
    return;
  }

  if (argv.includes("--dry-run")) {
    runLocalPreflight();
    return;
  }

  if (argv.includes("--help") || argv.includes("-h")) {
    printBanner();
    console.log("用法：npm run gba");
    console.log("可选：node scripts/gba.mjs --status | --dry-run");
    return;
  }

  await guideMenu();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(color(error.message, "red"));
    process.exitCode = 1;
  });
}
