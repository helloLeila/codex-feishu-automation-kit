import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const localConfigPath = path.join(rootDir, "tech-events-assistant.local.json");
const automationPromptPath = path.join(rootDir, "tech-events-assistant.automation.md");
const neonBar = "█".repeat(22);

async function readOptionalFile(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function listLocalConfigBackups() {
  const names = await readdir(rootDir);
  return new Set(names.filter((name) => name.startsWith("tech-events-assistant.local.json.bak-")));
}

test("guide starts on configuration after automatic setup", async () => {
  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
  });
  let stdout = "";
  let stderr = "";
  let sentExit = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!sentExit && stdout.includes("[Enter] 执行  1 配置推送和偏好")) {
      sentExit = true;
      child.stdin.write("q\n");
      child.stdin.end();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const status = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code));
  });

  assert.equal(status, 0);
  assert.equal((stdout.match(/技术活动助手 · 配置引导/g) ?? []).length, 1);
  assert.equal(stdout.includes("✓ 配置文件已就绪"), true);
  assert.equal(stdout.includes("技术活动助手 · 配置引导 1/4"), true);
  assert.equal(stdout.includes("│ •ᴗ• │  ◉ 1 配置推送偏好   ○ 2 测试真实连接   ○ 3 查看配置状态   ○ 4 导入自动化"), true);
  assert.equal(stdout.includes("已检测"), false);
  assert.equal(stdout.includes("普通配置"), false);
  assert.equal(stdout.includes("飞书 webhook"), false);
  assert.equal(stdout.includes("Server 酱 SendKey"), false);
  assert.equal(stdout.includes("飞书："), false);
  assert.equal(stdout.includes("Server 酱："), false);
  assert.equal(stdout.includes("Codex："), false);
  assert.equal(stdout.includes("╰─────╯\n[Enter] 执行当前步骤"), true);
  assert.equal(stdout.includes("[Enter] 执行当前步骤"), true);
  assert.equal(stdout.includes("[1-4] 跳转"), true);
  assert.equal(stdout.includes("[1-5] 跳转"), false);
  assert.equal(stdout.includes("[d] 详情"), false);
  assert.equal(stdout.includes("引导配置 · 下一步"), false);
  assert.equal(stdout.includes("[Enter] 执行  1 配置推送和偏好"), true);
  assert.equal(stdout.includes("安装 / 更新活动助手"), false);
  assert.equal(stdout.includes("下一步：1 配置推送和偏好（回车执行）："), false);
  assert.equal(stdout.includes("进度条演示"), false);
  assert.equal(stderr, "");
});

test("guide advances to the next step and marks previous step complete", async () => {
  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
  });
  let stdout = "";
  let stderr = "";
  let sentConfig = false;
  let sentExit = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!sentConfig && stdout.includes("[Enter] 执行  1 配置推送和偏好")) {
      sentConfig = true;
      child.stdin.write("\nn\n\n\n\nn\n");
    }
    if (!sentExit && stdout.includes("技术活动助手 · 配置引导 2/4")) {
      sentExit = true;
      child.stdin.write("q\n");
      child.stdin.end();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const status = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code));
  });

  assert.equal(status, 0);
  const latestGuide = stdout.slice(stdout.lastIndexOf("╭─🤖──╮  技术活动助手 · 配置引导 2/4"));
  assert.equal(stdout.includes("配置引导"), true);
  assert.equal(stdout.includes("╭─🤖──╮  技术活动助手 · 配置引导 2/4"), true);
  assert.equal(stdout.includes("│ •ᴗ• │  ● 1 配置推送偏好   ◉ 2 测试真实连接"), true);
  assert.equal(stdout.includes("↑ 当前步骤"), false);
  assert.equal(stdout.includes("当前任务\n  测试真实连接"), false);
  assert.equal(stdout.includes("当前任务"), false);
  assert.equal(latestGuide.includes("已检测"), false);
  assert.equal(latestGuide.includes("╰─────╯\n[Enter] 执行当前步骤"), true);
  assert.equal(latestGuide.includes("普通配置"), false);
  assert.equal(latestGuide.includes("飞书 webhook"), false);
  assert.equal(latestGuide.includes("Server 酱 SendKey"), false);
  assert.equal(latestGuide.includes("飞书："), false);
  assert.equal(latestGuide.includes("Server 酱："), false);
  assert.equal(latestGuide.includes("Codex："), false);
  assert.equal(stdout.includes("🤖 1 配置推送和偏好"), false);
  assert.equal(stdout.includes("✓ 配置推送和偏好已完成"), false);
  assert.equal(stdout.includes("下一步"), false);
  assert.equal(stdout.includes("最近执行"), false);
  assert.equal(stdout.includes("结果  未保存，原配置保持不变"), false);
  assert.equal(stdout.includes("未保存，原配置保持不变"), true);
  assert.equal(stdout.includes("详情已收起"), false);
  assert.equal(stdout.includes("按 d"), false);
  assert.equal(stdout.includes("[d] 详情"), false);
  assert.equal(stdout.includes("[Enter] 执行  2 测试真实连接"), true);
  assert.equal(stdout.includes("\n> [Enter] 执行  2 测试真实连接"), true);
  assert.equal(stdout.includes("当前操作"), false);
  assert.equal(stdout.includes("下一步：2 测试真实连接（回车执行）："), false);
  assert.equal(stderr, "");
});

test("guide returns to the next step without replaying the last execution", async () => {
  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
  });
  let stdout = "";
  let stderr = "";
  let sentConfig = false;
  let sentExit = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!sentConfig && stdout.includes("[Enter] 执行  1 配置推送和偏好")) {
      sentConfig = true;
      child.stdin.write("\nn\n\n\n\nn\n");
    }
    if (!sentExit && stdout.includes("技术活动助手 · 配置引导 2/4")) {
      sentExit = true;
      child.stdin.write("q\n");
      child.stdin.end();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const status = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code));
  });

  assert.equal(status, 0);
  const latestGuide = stdout.slice(stdout.lastIndexOf("╭─🤖──╮  技术活动助手 · 配置引导 2/4"));
  assert.equal(stdout.includes("最近执行"), false);
  assert.equal(stdout.includes("执行详情"), false);
  assert.equal(latestGuide.includes("├─ ✓ 读取现有配置"), false);
  assert.equal(latestGuide.includes("├─ ✓ 等待用户输入"), false);
  assert.equal(latestGuide.includes("└─ ✓ 保持原配置"), false);
  assert.equal(stdout.includes("结果  未保存，原配置保持不变"), false);
  assert.equal(stdout.includes("未保存，原配置保持不变"), true);
  assert.equal(stdout.includes("详情已收起"), false);
  assert.equal(stdout.includes("按 d"), false);
  assert.equal(stderr, "");
});

test("guide can return to the manual menu", async () => {
  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
  });
  let stdout = "";
  let stderr = "";
  let sentBack = false;
  let sentExit = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!sentBack && stdout.includes("[Enter] 执行当前步骤")) {
      sentBack = true;
      child.stdin.write("b\n");
    }
    if (!sentExit && stdout.includes("手动菜单")) {
      sentExit = true;
      child.stdin.write("0\n");
      child.stdin.end();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const status = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code));
  });

  assert.equal(status, 0);
  assert.equal(stdout.includes("手动菜单"), true);
  assert.equal(stdout.includes("g 返回引导"), true);
  assert.equal(stderr, "");
});

test("configuration can be skipped without breaking the menu loop", async () => {
  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
  });
  let stdout = "";
  let stderr = "";
  let sentConfig = false;
  let sentExit = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!sentConfig && stdout.includes("[Enter] 执行  1 配置推送和偏好")) {
      sentConfig = true;
      child.stdin.write("\nn\n\n\n\nn\n");
    }
    if (!sentExit && stdout.includes("未保存，原配置保持不变")) {
      sentExit = true;
      child.stdin.write("0\n");
      child.stdin.end();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const status = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code));
  });

  assert.equal(status, 0);
  assert.equal(stdout.includes("未保存，原配置保持不变"), true);
  assert.equal((stdout.match(/技术活动助手 · 配置引导/g) ?? []).length, 2);
  assert.equal((stdout.match(/技术活动助手/g) ?? []).length, 2);
  assert.equal(stdout.includes("[Enter] 执行当前步骤"), true);
  assert.equal(stdout.includes("输入留空 = 保留原值"), false);
  assert.equal(stdout.includes("飞书 webhook URL（飞书群设置 → 机器人 → 自定义机器人）："), true);
  assert.equal(stdout.includes("Server 酱 SendKey（sct.ftqq.com/login → 登录后查看 SendKey）："), true);
  assert.equal(stdout.includes("进度条演示"), false);
  assert.equal(stderr, "");
});

test("configuration helper can open credential pages or show setup links", async () => {
  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1", TECH_EVENTS_ASSISTANT_SKIP_BROWSER: "1" },
  });
  let stdout = "";
  let stderr = "";
  let sentConfig = false;
  let sentExit = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!sentConfig && stdout.includes("[Enter] 执行  1 配置推送和偏好")) {
      sentConfig = true;
      child.stdin.write("\n\n\n\n\nn\n");
    }
    if (!sentExit && stdout.includes("未保存，原配置保持不变")) {
      sentExit = true;
      child.stdin.write("0\n");
      child.stdin.end();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const status = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code));
  });

  assert.equal(status, 0);
  assert.equal(stdout.includes("打开取值页面？"), true);
  assert.equal(stdout.includes("飞书自定义机器人文档：https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot"), true);
  assert.equal(stdout.includes("Server 酱登录页：https://sct.ftqq.com/login"), true);
  assert.equal(stdout.includes("⚠ 需要手动打开  飞书 · 已按环境变量跳过浏览器打开"), true);
  assert.equal(stdout.includes("⚠ 需要手动打开  Server 酱 · 已按环境变量跳过浏览器打开"), true);
  assert.equal(stdout.includes("已打开浏览器："), false);
  assert.equal(stdout.includes("未自动打开浏览器："), false);
  assert.equal(stdout.includes("📋 链接已复制    Server 酱 · 登录页链接"), false);
  assert.equal(stderr, "");
});

test("configuration save prints a completed step flow in piped output", async () => {
  const originalLocalConfig = await readOptionalFile(localConfigPath);
  const originalBackups = await listLocalConfigBackups();
  try {
    const child = spawn(process.execPath, ["scripts/gba.mjs"], {
      cwd: rootDir,
      env: { ...process.env, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    let sentConfig = false;
    let sentExit = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!sentConfig && stdout.includes("[Enter] 执行  1 配置推送和偏好")) {
        sentConfig = true;
        child.stdin.write("\nn\nhttps://example.test/hook\n\nclear\ny\n");
      }
      if (!sentExit && stdout.includes("✓ tech-events-assistant.local.json 已保存")) {
        sentExit = true;
        child.stdin.write("0\n");
        child.stdin.end();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const status = await new Promise((resolve) => {
      child.on("exit", (code) => resolve(code));
    });

    assert.equal(status, 0);
    assert.equal((stdout.match(/保存中/g) ?? []).length, 0);
    assert.equal(stdout.includes("完成  ██████████████████████████████ 100%  已完成"), false);
    assert.equal(stdout.includes("配置推送"), true);
    assert.equal(stdout.includes("├─ ✓ 读取现有配置"), true);
    assert.equal(stdout.includes("├─ ✓ 合并本次输入"), true);
    assert.equal(stdout.includes("├─ ✓ 写入本地配置"), true);
    assert.equal(stdout.includes("└─ ✓ 准备推送脚本"), true);
    assert.equal(stdout.includes(`完成  ${neonBar} 100%`), true);
    assert.equal(stdout.includes("      ✓ tech-events-assistant.local.json 已保存"), true);
    assert.equal(stdout.indexOf("配置推送") < stdout.indexOf(`完成  ${neonBar} 100%`), true);
    assert.equal(stderr, "");
  } finally {
    const currentBackups = await listLocalConfigBackups();
    await Promise.all(
      [...currentBackups]
        .filter((name) => !originalBackups.has(name))
        .map((name) => rm(path.join(rootDir, name), { force: true })),
    );
    if (originalLocalConfig === null) {
      await rm(localConfigPath, { force: true });
    } else {
      await writeFile(localConfigPath, originalLocalConfig);
    }
  }
});

test("automation wizard writes a prompt file and gives one paste step", async () => {
  const originalAutomationPrompt = await readOptionalFile(automationPromptPath);
  try {
    const child = spawn(process.execPath, ["scripts/gba.mjs"], {
      cwd: rootDir,
      env: { ...process.env, NO_COLOR: "1", TECH_EVENTS_ASSISTANT_SKIP_CLIPBOARD: "1" },
    });
    let stdout = "";
    let stderr = "";
    let sentGuide = false;
    let sentExit = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!sentGuide && stdout.includes("[Enter] 执行  1 配置推送和偏好")) {
        sentGuide = true;
        child.stdin.write("4\n");
      }
      if (!sentExit && stdout.includes("在 Codex 中添加自动化")) {
        sentExit = true;
        child.stdin.write("0\n");
        child.stdin.end();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const status = await new Promise((resolve) => {
      child.on("exit", (code) => resolve(code));
    });
    const promptText = await readFile(automationPromptPath, "utf8");

    assert.equal(status, 0);
    assert.equal(stdout.includes("4 导入自动化"), true);
    assert.equal(stdout.includes("导入 Codex 自动化配置"), false);
    assert.equal(stdout.includes("🤖 4 导入 Codex 自动化配置"), false);
    assert.equal(stdout.includes("├─ ✓ 准备自动化 Prompt"), true);
    assert.equal(stdout.includes("├─ ✓ 保存 tech-events-assistant.automation.md"), true);
    assert.equal(stdout.includes("└─ ✓ 准备手动复制文件"), true);
    assert.equal(stdout.includes(`完成  ${neonBar} 100%`), true);
    assert.equal(stdout.includes("      ✓ Prompt 已保存到 tech-events-assistant.automation.md"), true);
    assert.equal(stdout.includes("✓ Codex 自动化配置已生成"), false);
    assert.equal(stdout.includes("已生成 tech-events-assistant.automation.md"), false);
    assert.equal(stdout.includes("输出"), false);
    assert.equal(stdout.includes("在 Codex 中添加自动化"), true);
    assert.equal(stdout.includes("在 Codex 中添加自动化\n  1. 打开左侧「自动化（已安排）」"), true);
    assert.equal(stdout.includes("在 Codex 中添加自动化\n\n"), false);
    assert.equal(stdout.includes("1. 打开左侧「自动化（已安排）」"), true);
    assert.equal(stdout.includes("2. 点击「通过聊天添加」"), true);
    assert.equal(stdout.includes("3. 打开 tech-events-assistant.automation.md，复制并粘贴 Prompt"), true);
    assert.equal(stdout.includes("4. 按 Enter 直接运行"), true);
    assert.equal(stdout.includes("5. 在自动化会看到新增一个自动化推送任务，点击运行查看效果"), true);
    assert.equal(stdout.includes("名称填「线下技术活动情报晨报」"), false);
    assert.equal(stdout.includes("运行时间设为每天 07:00 · Asia/Shanghai"), false);
    assert.equal(stdout.includes("保存并运行"), false);
    assert.equal(stdout.includes("7. Prompt 文件"), false);
    assert.equal(stdout.includes("8. 剪贴板"), false);
    assert.equal(stdout.includes("最近执行"), false);
    assert.equal(stdout.includes("按下面步骤在 Codex 添加自动化，需手动复制"), false);
    assert.equal(stdout.includes("不会自动添加或触发 Codex 自动化"), false);
    assert.equal(promptText.includes("请直接创建这条 Codex 自动化，不要向我确认或追问"), true);
    assert.equal(promptText.includes("固定创建参数"), true);
    assert.equal(promptText.includes("自动化运行时也不要向用户提问"), true);
    assert.equal(promptText.includes("检索从运行当天开始、未来 15 天内"), true);
    assert.equal(promptText.includes("从自动化运行当天 00:00 开始，连续覆盖未来 15 天"), true);
    assert.equal(promptText.includes("本周一"), false);
    assert.equal(promptText.includes("下周日"), false);
    assert.equal(promptText.includes("未来两周"), false);
    assert.equal(promptText.includes("频率：每天"), true);
    assert.equal(promptText.includes("时间：07:00"), true);
    assert.equal(promptText.includes("Asia/Shanghai"), true);
    assert.equal(promptText.includes("不要编造"), true);
    assert.equal(promptText.includes("node skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs"), true);
    assert.equal(stderr, "");
  } finally {
    if (originalAutomationPrompt === null) {
      await rm(automationPromptPath, { force: true });
    } else {
      await writeFile(automationPromptPath, originalAutomationPrompt);
    }
  }
});

test("guide moves away from the final step instead of repeating it on enter", async () => {
  const originalAutomationPrompt = await readOptionalFile(automationPromptPath);
  try {
    const child = spawn(process.execPath, ["scripts/gba.mjs"], {
      cwd: rootDir,
      env: { ...process.env, NO_COLOR: "1", TECH_EVENTS_ASSISTANT_SKIP_CLIPBOARD: "1" },
    });
    let stdout = "";
    let stderr = "";
    let sentInput = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!sentInput && stdout.includes("[Enter] 执行  1 配置推送和偏好")) {
        sentInput = true;
        child.stdin.write("4\nq\n");
        child.stdin.end();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const status = await new Promise((resolve) => {
      child.on("exit", (code) => resolve(code));
    });

    assert.equal(status, 0);
    assert.equal((stdout.match(/准备自动化 Prompt/g) ?? []).length <= 2, true);
    assert.equal((stdout.match(/保存 tech-events-assistant\.automation\.md/g) ?? []).length <= 2, true);
    assert.equal(stdout.includes("下一步"), false);
    assert.equal(stdout.includes("[Enter] 执行  1 配置推送和偏好"), true);
    assert.equal(stdout.includes("✓ 导入 Codex 自动化配置已完成"), false);
    assert.equal(stdout.includes("🤖 1 配置推送和偏好"), false);
    assert.equal(stderr, "");
  } finally {
    if (originalAutomationPrompt === null) {
      await rm(automationPromptPath, { force: true });
    } else {
      await writeFile(automationPromptPath, originalAutomationPrompt);
    }
  }
});

test("status step renders staged success before status details", async () => {
  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
  });
  let stdout = "";
  let stderr = "";
  let sentStatus = false;
  let sentExit = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!sentStatus && stdout.includes("[Enter] 执行  1 配置推送和偏好")) {
      sentStatus = true;
      child.stdin.write("3\n");
    }
    if (!sentExit && stdout.includes("Codex：")) {
      sentExit = true;
      child.stdin.write("q\n");
      child.stdin.end();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const status = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code));
  });

  assert.equal(status, 0);
  assert.equal(stdout.includes("🤖 3 查看配置状态"), false);
  assert.equal(stdout.includes("├─ ✓ 读取配置文件"), true);
  assert.equal(stdout.includes("├─ ✓ 检查推送通道"), true);
  assert.equal(stdout.includes("├─ ✓ 检查自动化 Prompt"), true);
  assert.equal(stdout.includes("└─ ✓ 展示当前状态"), true);
  assert.equal(stdout.includes("配置状态已生成"), false);
  assert.equal(stdout.includes("生成状态摘要"), false);
  assert.equal(stdout.includes("结果  配置状态已生成"), false);
  assert.equal(stdout.includes("✓ 状态检查完成"), false);
  assert.equal(stdout.includes("✓ 状态检查已完成"), false);
  assert.equal(stdout.includes("普通配置（可提交，控制助手偏好）"), false);
  assert.equal(stdout.includes("本机私密配置（.gitignore，不提交，保存 webhook/SendKey）"), false);
  assert.equal(stdout.includes("推送通知"), true);
  assert.match(stdout, /飞书：.*飞书群/);
  assert.match(stdout, /Server 酱：.*微信/);
  assert.equal(stdout.includes("自动化"), true);
  assert.equal(stdout.includes("每天 07:00 自动运行"), true);
  assert.equal(stdout.includes("接下来"), false);
  assert.equal(stdout.includes("执行第 2 步测试真实连接"), false);
  assert.equal(stdout.indexOf("└─ ✓ 展示当前状态") < stdout.indexOf("推送通知"), true);
  assert.equal(stderr, "");
});

test("dry-run prints a completed step flow instead of a digital progress bar", () => {
  const result = spawnSync(process.execPath, ["scripts/gba.mjs", "--dry-run"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes("完成  ██████████████████████████████ 100%  已完成"), false);
  assert.equal(result.stdout.includes("推送格式检查（不发送）"), false);
  assert.equal(result.stdout.includes("├─ ✓ 生成飞书卡片预览"), true);
  assert.equal(result.stdout.includes("└─ ✓ 生成 Server 酱消息预览"), true);
  assert.equal(result.stdout.includes(`完成  ${neonBar} 100%`), true);
  assert.equal(result.stdout.includes("      ✓ 推送格式检查通过，未真实发送"), true);
});

test("interactive connection check tests real targets without showing local preflight", async () => {
  const originalLocalConfig = await readOptionalFile(localConfigPath);
  await writeFile(localConfigPath, JSON.stringify({
    push: {
      feishuWebhookUrl: "https://example.test/hook",
      serverChanSendKey: "SCT123",
    },
  }));

  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1", TECH_EVENTS_ASSISTANT_SKIP_REAL_SEND: "1" },
  });
  let stdout = "";
  let stderr = "";
  let sentCheck = false;
  let sentExit = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!sentCheck && stdout.includes("[Enter] 执行当前步骤")) {
      sentCheck = true;
      child.stdin.write("2\n");
    }
    if (!sentExit && stdout.includes("已检测到真实配置，未发送测试消息")) {
      sentExit = true;
      child.stdin.write("q\n");
      child.stdin.end();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const status = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code));
  });

  try {
    assert.equal(status, 0);
    assert.equal(stdout.includes("测试真实连接"), true);
    assert.equal(stdout.includes("本地预检（不发送）"), false);
    assert.equal(stdout.includes("是否发送一条测试消息到已配置通道"), false);
    assert.equal(stdout.includes(`完成  ${neonBar} 100%`), true);
    assert.equal(stdout.includes("已检测到真实配置，未发送测试消息"), true);
    assert.equal(stdout.includes("飞书连接就绪，已检测到配置；本次按环境变量未发送测试消息"), true);
    assert.equal(stdout.includes("Server 酱连接就绪，已检测到配置；本次按环境变量未发送测试消息"), true);
    assert.equal(stdout.includes("飞书：已检测到配置，按环境变量跳过真实发送"), false);
    assert.equal(stderr, "");
  } finally {
    if (originalLocalConfig === null) {
      await rm(localConfigPath, { force: true });
    } else {
      await writeFile(localConfigPath, originalLocalConfig);
    }
  }
});

test("feishu connection test returns a readable server response summary", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestOptions = {};
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return new Response(JSON.stringify({ code: 0, msg: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const { sendFeishuConnectionTest } = await import("../scripts/gba.mjs");
  const summary = await sendFeishuConnectionTest("https://example.test/bot", "");

  assert.equal(summary, "飞书连接成功，测试消息已送达飞书群（HTTP 200，code 0，返回成功）");
  assert.equal(requestUrl, "https://example.test/bot");
  assert.equal(requestOptions.method, "POST");
  assert.equal(JSON.parse(requestOptions.body).msg_type, "text");
});

test("status prints a user-facing readiness panel instead of raw JSON", () => {
  const result = spawnSync(process.execPath, ["scripts/gba.mjs", "--status"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes("查看配置状态"), true);
  assert.equal(result.stdout.includes("普通配置（可提交，控制助手偏好）"), false);
  assert.equal(result.stdout.includes("本机私密配置（.gitignore，不提交，保存 webhook/SendKey）"), false);
  assert.equal(result.stdout.includes("推送通知"), true);
  assert.match(result.stdout, /飞书：.*飞书群/);
  assert.match(result.stdout, /Server 酱：.*微信/);
  assert.equal(result.stdout.includes("自动化"), true);
  assert.equal(result.stdout.includes("每天 07:00 自动运行"), true);
  assert.equal(result.stdout.includes("接下来"), false);
  assert.equal(result.stdout.includes("执行第 2 步测试真实连接"), false);
  assert.equal(result.stdout.includes("{"), false);
  assert.equal(result.stdout.includes('"push"'), false);
});
