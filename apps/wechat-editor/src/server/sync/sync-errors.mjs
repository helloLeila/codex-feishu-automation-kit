export const RETRYABLE_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ENETUNREACH",
  "HTTP_429",
  "HTTP_500",
  "HTTP_502",
  "HTTP_503",
  "HTTP_504",
  45009,
  45166,
]);

export const PERMANENT_CODES = new Set([
  40001,
  40005,
  40009,
  40125,
  40164,
  "SHARP_NOT_INSTALLED",
  "COVER_UNSUPPORTED_MIME",
  "COVER_TOO_LARGE",
  "AI_INVALID_JSON",
  "AI_AUTH_FAILED",
]);

export function classifySyncError(error = {}) {
  const code = error.code ?? error.status;
  if (error.retryable === true || RETRYABLE_CODES.has(code) || (typeof code === "number" && code >= 500)) {
    return { retryable: true, code };
  }
  return { retryable: false, code };
}

export function staleRevisionError() {
  return Object.assign(new Error("同步任务对应的文章 revision 已过期，结果不会写回。"), { code: "STALE_REVISION", status: 409 });
}
