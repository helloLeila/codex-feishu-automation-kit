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
  renderNeonProgressLine,
  renderBannerLines,
  renderStepFlowLines,
  spinnerFrame,
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
const GUIDE_STEPS = [
  "安装 / 更新活动助手",
  "配置推送和偏好",
  "本地预检 / 测试真实推送",
  "检查状态",
  "创建 / 更新活动搜寻自动化",
];

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
  console.log(renderStepFlowLines(title, steps, {
    complete: true,
    result,
  }).join("\n"));
}

function printGuide(completedSteps, currentStep) {
  printBanner();
  console.log("");
  console.log(color("引导配置", "cyan"));
  console.log(color("回车执行当前步骤；输入 1-5 直接执行某步；b 返回上一层；q 退出引导。", "gray"));
  console.log("");
  GUIDE_STEPS.forEach((step, index) => {
    const number = index + 1;
    if (completedSteps.has(index)) {
      console.log(color(`${number}. ${step}  ✓ 已完成`, "green"));
    } else if (index === currentStep) {
      console.log(color(`${number}. ${step}  ▶ 当前`, "cyan"));
    } else {
      console.log(color(`${number}. ${step}  · 待执行`, "gray"));
    }
  });
}

function buildGbaAutomationPrompt() {
  return `# 活动搜寻自动化 Prompt

把下面内容完整粘贴到 Codex Automation 的 prompt。建议自动化名称保存为：活动搜寻。

建议在 Codex Automation 的时间设置里选择：每天 07:00（Asia/Shanghai），也就是每天早上 7 点运行。

---

任务：检索未来两周内真实可参加的线下技术活动，并生成可推送的 Markdown 活动清单。

每天检索并汇总从当前时间往后、未来两周内（从本周一 00:00 至下周日 23:59）的线下真实技术活动。城市范围：深圳、广州、珠海、香港、澳门。目标是更容易搜到真实可去的活动，严格禁止编造、虚构、凑数。

不要编造活动；找不到就少写，并在备注里说明没有找到足够可靠的公开信息。

只收录当前时间之后尚未开始或仍可参加的活动；已经结束的活动不要显示，即使它仍在本周检索窗口内。

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
4. 不要显示“活动已结束；保留是因为它仍在本周检索窗口内”。
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

async function installOrUpdate() {
  const configPath = path.join(rootDir, CONFIG_FILE);
  const examplePath = path.join(rootDir, EXAMPLE_CONFIG_FILE);

  console.log(`${spinnerFrame(0)} 检查配置文件`);
  if (!(await fileExists(configPath))) {
    await copyFile(examplePath, configPath);
    console.log(statusLine(`已从 ${EXAMPLE_CONFIG_FILE} 创建 ${CONFIG_FILE}`, "ok"));
  } else {
    console.log(statusLine(`${CONFIG_FILE} 已存在，保留当前配置`, "ok"));
  }

  printCompletedSteps("安装 / 更新活动助手", ["检查配置文件", "准备本地入口"], "活动助手已就绪");
}

async function runSaveSteps(resultLabel) {
  const steps = ["读取现有配置", "合并本次输入", "写入本地配置", "准备推送脚本"];
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧"];
  const finalLines = renderStepFlowLines("配置推送", steps, {
    complete: true,
    result: resultLabel,
  });

  if (!output.isTTY) {
    console.log(finalLines.join("\n"));
    return;
  }

  let previousLineCount = 0;
  for (let index = 0; index < steps.length; index += 1) {
    const percent = Math.round(((index + 1) / (steps.length + 1)) * 100);
    const lines = [
      ...renderStepFlowLines("配置推送", steps, {
        activeIndex: index,
        spinner: frames[index % frames.length],
      }),
      "",
      renderNeonProgressLine(percent),
    ];
    if (previousLineCount > 0) output.moveCursor(0, -previousLineCount);
    for (const line of lines) {
      output.cursorTo(0);
      output.clearLine(0);
      output.write(`${line}\n`);
    }
    previousLineCount = lines.length;
    await new Promise((resolve) => setTimeout(resolve, 90));
  }

  output.moveCursor(0, -previousLineCount);
  for (const line of finalLines) {
    output.cursorTo(0);
    output.clearLine(0);
    output.write(`${line}\n`);
  }
}

async function printStatus() {
  const config = await loadAssistantConfig(rootDir);
  const localEnv = await loadLocalEnv(rootDir);
  const publicConfigPath = path.join(rootDir, CONFIG_FILE);
  const localConfigPath = path.join(rootDir, LOCAL_CONFIG_FILE);
  const automationPromptPath = path.join(rootDir, AUTOMATION_PROMPT_FILE);
  const hasPublicConfig = await fileExists(publicConfigPath);
  const hasLocalConfig = await fileExists(localConfigPath);
  const hasAutomationPrompt = await fileExists(automationPromptPath);
  const hasFeishu = Boolean(config?.push?.feishuWebhookUrl || localEnv.FEISHU_WEBHOOK_URL);
  const hasServerChan = Boolean(config?.push?.serverChanSendKey || localEnv.SERVERCHAN_SENDKEY);

  console.log(color("状态检查", "cyan"));
  console.log(statusLine(`普通配置：${hasPublicConfig ? `${CONFIG_FILE} 已存在` : "缺失，建议先执行第 1 步"}`, hasPublicConfig ? "ok" : "warn"));
  console.log(statusLine(`本机私密配置：${hasLocalConfig ? `${LOCAL_CONFIG_FILE} 已存在` : "未配置，可执行第 2 步"}`, hasLocalConfig ? "ok" : "warn"));
  console.log(statusLine(`飞书推送：${hasFeishu ? "已配置 webhook" : "未配置 webhook"}`, hasFeishu ? "ok" : "warn"));
  console.log(statusLine(`Server 酱推送：${hasServerChan ? "已配置 SendKey" : "未配置 SendKey"}`, hasServerChan ? "ok" : "warn"));
  console.log(statusLine(`自动化 Prompt：${hasAutomationPrompt ? `${AUTOMATION_PROMPT_FILE} 已生成` : "未生成，可执行第 5 步"}`, hasAutomationPrompt ? "ok" : "warn"));
  console.log("");
  if (hasFeishu || hasServerChan) {
    console.log(statusLine("下一步：执行第 3 步本地预检，可选择发送一条真实测试消息", "info"));
  } else {
    console.log(statusLine("下一步：执行第 2 步配置飞书 webhook 或 Server 酱 SendKey", "info"));
  }
}

async function configurePush(rl) {
  const ownsReadline = !rl;
  const reader = rl ?? createPromptSession();
  const current = await readLocalConfig(rootDir);

  console.log(color("输入留空 = 保留原值；输入 clear = 清空该项。最后确认保存前不会写文件。", "gray"));
  const feishuWebhookUrl = await reader.question("飞书 webhook URL（飞书群设置 → 机器人 → 自定义机器人）：");
  const feishuWebhookSecret = await reader.question("飞书签名密钥（可空，开启签名校验才填）：");
  const serverChanSendKey = await reader.question("Server 酱 SendKey（sct.ftqq.com → SendKey 页面）：");
  const saveAnswer = await reader.question("保存到 tech-events-assistant.local.json？输入 y 保存：");
  if (ownsReadline) reader.close();

  const result = applySecretInputs(
    current,
    { feishuWebhookUrl, feishuWebhookSecret, serverChanSendKey },
    { save: saveAnswer.trim().toLowerCase() === "y" },
  );

  if (!result.saved) {
    console.log(statusLine("未保存，原配置保持不变", "warn"));
    return;
  }

  const writeResult = await writeLocalConfig(rootDir, result.config);
  await runSaveSteps(`${path.basename(writeResult.filePath)} 已保存`);
  if (writeResult.backupCreated) {
    console.log(statusLine(`已备份旧配置：${path.basename(writeResult.backupPath)}`, "info"));
  }
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

  printCompletedSteps("本地预检（不发送）", ["生成飞书卡片预览", "生成 Server 酱消息预览"], "本地预检通过，未真实发送");
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

export function formatConnectionResponse(status, result) {
  const parts = [`HTTP ${status}`];
  const code = connectionResponseCode(result);
  const message = connectionResponseMessage(result);
  if (code !== undefined) parts.push(`code ${code}`);
  if (message) parts.push(`msg ${shortText(message)}`);
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
  return `飞书返回：${summary}`;
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
  return `Server 酱返回：${summary}`;
}

async function runConnectionCheck(rl) {
  if (!runLocalPreflight()) return;

  const config = await loadAssistantConfig(rootDir);
  const localEnv = await loadLocalEnv(rootDir);
  const targets = getConfiguredPushTargets(config, localEnv);
  const enabledTargets = [
    targets.feishuWebhook ? "飞书" : null,
    targets.serverChanSendKey ? "Server 酱" : null,
  ].filter(Boolean);

  if (enabledTargets.length === 0) {
    console.log(statusLine("未检测到真实 webhook / SendKey；本次只完成本地预检", "warn"));
    return;
  }

  const answer = await rl.question("是否发送一条测试消息到已配置通道？输入 y 发送，直接回车跳过：");
  if (answer.trim().toLowerCase() !== "y") {
    console.log(statusLine("已跳过真实发送测试；本地预检已通过", "info"));
    return;
  }

  const steps = enabledTargets.map((target) => `发送 ${target} 测试消息`);
  try {
    const responseSummaries = [];
    if (targets.feishuWebhook) responseSummaries.push(await sendFeishuConnectionTest(targets.feishuWebhook, targets.feishuSecret));
    if (targets.serverChanSendKey) responseSummaries.push(await sendServerChanConnectionTest(targets.serverChanSendKey));
    printCompletedSteps("真实连接测试", steps, "真实连接测试通过，已发送测试消息");
    for (const summary of responseSummaries) {
      console.log(statusLine(summary, "ok"));
    }
  } catch (error) {
    console.log(statusLine(`真实连接测试失败：${error.message}`, "error"));
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
    ? ["生成活动搜寻 Prompt", `写入 ${AUTOMATION_PROMPT_FILE}`, "检查推送配置", "复制 Prompt 到剪贴板"]
    : ["生成活动搜寻 Prompt", `写入 ${AUTOMATION_PROMPT_FILE}`, "检查推送配置", "准备手动复制文件"];
  const result = clipboard.copied
    ? `已生成 ${AUTOMATION_PROMPT_FILE}，并复制到剪贴板`
    : `已生成 ${AUTOMATION_PROMPT_FILE}`;

  printCompletedSteps("创建活动搜寻自动化", steps, result);
  console.log("");
  console.log(statusLine("下一步：打开 Codex → Automations → New → 粘贴 → 保存为：活动搜寻", "info"));
  console.log(statusLine(`Prompt 文件：${AUTOMATION_PROMPT_FILE}`, "info"));
  if (clipboard.copied) {
    console.log(statusLine("已复制到剪贴板，直接粘贴即可", "ok"));
  } else {
    console.log(statusLine(`未复制剪贴板：${clipboard.reason}。请打开 Prompt 文件手动复制`, "warn"));
  }
  if (!pushConfigured) {
    console.log(statusLine("当前未检测到推送密钥；可先创建自动化，之后用菜单 2 配置推送", "warn"));
  }
}

function printMenu(options = {}) {
  if (options.compact) {
    console.log(color("── 手动菜单（g 返回引导，0 退出）──", "gray"));
  } else {
    printBanner();
    console.log("");
    console.log(color("手动菜单（g 返回引导，0 退出）", "cyan"));
  }
  console.log("1. 安装 / 更新活动助手");
  console.log("2. 配置推送和偏好");
  console.log("3. 本地预检 / 测试真实推送");
  console.log("4. 检查状态");
  console.log("5. 创建 / 更新活动搜寻自动化");
  console.log("0. 退出");
}

async function runStepByIndex(index, rl) {
  if (index === 0) await installOrUpdate();
  else if (index === 1) await configurePush(rl);
  else if (index === 2) await runConnectionCheck(rl);
  else if (index === 3) await printStatus();
  else if (index === 4) await createAutomationWizard();
}

async function handleChoice(choice, rl) {
  if (choice === "0") return "exit";
  if (choice.toLowerCase() === "g") return "guide";
  if (choice === "1") await installOrUpdate();
  else if (choice === "2") await configurePush(rl);
  else if (choice === "3") await runConnectionCheck(rl);
  else if (choice === "4") await printStatus();
  else if (choice === "5") await createAutomationWizard();
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
    while (true) {
      printGuide(completedSteps, currentStep);
      const answer = (await rl.question(color("\n下一步：", "cyan"))).trim().toLowerCase();
      if (answer === "q" || answer === "0") break;
      if (answer === "b") {
        const returnToGuide = await manualMenu(rl);
        if (!returnToGuide) break;
        continue;
      }

      const selectedStep = /^[1-5]$/.test(answer) ? Number(answer) - 1 : currentStep;
      currentStep = selectedStep;
      await runStepByIndex(selectedStep, rl);
      completedSteps.add(selectedStep);
      if (selectedStep < GUIDE_STEPS.length - 1) {
        currentStep = selectedStep + 1;
      }
      console.log("");
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
