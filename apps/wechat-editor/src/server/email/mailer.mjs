export function createMailer({ send, sendVerificationCode, fetchImpl = globalThis.fetch, sendUrl = process.env.MAIL_SEND_URL || "", sendToken = process.env.MAIL_SEND_TOKEN || "", enabled = process.env.MAIL_ENABLED === "true" || process.env.MAIL_ENABLED === "1", to = process.env.MAIL_ALERT_TO || "", verificationFrom = process.env.MAIL_VERIFICATION_FROM || process.env.MAIL_FROM || "" } = {}) {
  const transport = send || (sendUrl && fetchImpl ? async (message) => {
    const response = await fetchImpl(sendUrl, {
      method: "POST",
      headers: { "content-type": "application/json", ...(sendToken ? { authorization: `Bearer ${sendToken}` } : {}) },
      body: JSON.stringify({ from: verificationFrom || undefined, ...message }),
    });
    if (!response.ok) throw Object.assign(new Error(`邮件网关请求失败（HTTP ${response.status}）`), { code: "MAIL_SEND_FAILED", status: 502 });
  } : null);
  const transportEnabled = Boolean(enabled || transport);
  return {
    enabled: Boolean(transportEnabled && to),
    async sendSyncFailure({ articleId, taskId, message, attempts } = {}) {
      if (!transportEnabled || !to) return { sent: false, skipped: true };
      if (typeof transport !== "function") return { sent: false, skipped: true, reason: "MAIL_TRANSPORT_NOT_CONFIGURED" };
      await transport({
        to,
        subject: `[公众号编辑器] 同步失败已暂停 · ${articleId}`,
        text: `文章 ${articleId} 的同步任务 ${taskId} 已失败 ${attempts} 次并暂停自动同步。\n\n错误：${message}`,
      });
      return { sent: true };
    },
    async sendVerificationCode({ email, code, expiresAt } = {}) {
      if (typeof sendVerificationCode === "function") {
        await sendVerificationCode({ email, code, expiresAt });
        return { sent: true };
      }
      if (process.env.MAIL_DEV_RETURN_CODE === "true" || process.env.MAIL_DEV_RETURN_CODE === "1") {
        return { sent: false, devCode: String(code) };
      }
      if (typeof transport !== "function") return { sent: false, skipped: true, reason: "MAIL_TRANSPORT_NOT_CONFIGURED" };
      await transport({
        to: email,
        subject: "公众号编辑器邮箱验证码",
        text: `你的注册验证码是：${code}\n验证码将在 10 分钟后失效。`,
      });
      return { sent: true };
    },
  };
}
