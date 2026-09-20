import { renderMarkdown } from "../markdown-renderer.mjs";
import { inlineWechatHtml } from "../wechat-html.mjs";

export function renderArticle({ markdown = "", theme = {} } = {}) {
  const rendered = renderMarkdown(String(markdown));
  return {
    ...rendered,
    html: inlineWechatHtml(rendered.html, theme),
  };
}
