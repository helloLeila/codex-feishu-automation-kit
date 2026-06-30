export const sendWeComMarkdown = async ({ webhook, title, markdown }) => {
  const payload = {
    msgtype: "markdown",
    markdown: {
      content: markdown,
    },
  };

  if (process.env.WECOM_DRY_RUN === "1") {
    console.log(JSON.stringify({ title, payload }, null, 2));
    return;
  }

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(`企业微信 webhook 请求失败：HTTP ${response.status}`);
    console.error(body);
    process.exit(1);
  }

  let result;
  try {
    result = JSON.parse(body);
  } catch {
    result = { raw: body };
  }

  if (result.errcode && result.errcode !== 0) {
    console.error("企业微信 webhook 返回错误：");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log("企业微信通知已发送。");
};
