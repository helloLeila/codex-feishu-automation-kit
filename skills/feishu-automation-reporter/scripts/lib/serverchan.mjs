export const sendServerChan = async ({ sendKey, title, desp }) => {
  const endpoint = `https://sctapi.ftqq.com/${encodeURIComponent(sendKey)}.send`;
  const body = new URLSearchParams({
    title,
    desp,
  });

  if (process.env.SERVERCHAN_DRY_RUN === "1") {
    console.log(JSON.stringify({ endpoint, payload: Object.fromEntries(body) }, null, 2));
    return;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error(`Server 酱请求失败：HTTP ${response.status}`);
    console.error(responseText);
    process.exit(1);
  }

  let result;
  try {
    result = JSON.parse(responseText);
  } catch {
    result = { raw: responseText };
  }

  if (result.code && result.code !== 0) {
    console.error("Server 酱返回错误：");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log("Server 酱通知已发送。");
};
