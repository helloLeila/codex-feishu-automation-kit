const numberToken = (theme, key, fallback) => {
  const value = Number(theme?.[key]);
  return Number.isFinite(value) ? value : fallback;
};

const colorToken = (theme, key, fallback) => theme?.[key] || fallback;

function replaceOpeningTag(source, tag, attributes) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'gi');
  return source.replace(pattern, `<${tag} style="${attributes}">`);
}

function addStyleToTag(source, tag, attributes) {
  const pattern = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
  return source.replace(pattern, (full, existingAttributes) => {
    if (/\bstyle\s*=/i.test(existingAttributes)) return full;
    return `<${tag} style="${attributes}"${existingAttributes}>`;
  });
}

export function inlineWechatHtml(source = '', theme = {}) {
  const bodySize = numberToken(theme, 'bodySize', 16);
  const lineHeight = numberToken(theme, 'lineHeight', 1.8);
  const paragraph = numberToken(theme, 'paragraph', 16);
  const section = numberToken(theme, 'section', 30);
  const h1Size = numberToken(theme, 'h1Size', 25);
  const h2Size = numberToken(theme, 'h2Size', 20);
  const h3Size = numberToken(theme, 'h3Size', 17);
  const captionSize = numberToken(theme, 'captionSize', 13);
  const imageRadius = numberToken(theme, 'imageRadius', 4);
  const primary = colorToken(theme, 'primary', '#176b5b');
  const primaryDark = colorToken(theme, 'primaryDark', '#10483d');
  const text = colorToken(theme, 'text', '#252a2e');
  const heading = colorToken(theme, 'heading', '#1f2c28');
  const muted = colorToken(theme, 'muted', '#6b7280');
  const border = colorToken(theme, 'border', '#e5e7eb');
  const quoteBg = colorToken(theme, 'quoteBg', '#eef6f1');
  const quoteText = colorToken(theme, 'quoteText', '#52615a');
  const quoteBorder = colorToken(theme, 'quoteBorder', '#79a691');
  const codeBg = colorToken(theme, 'codeBg', '#f1f6f3');
  const codeText = colorToken(theme, 'codeText', '#29463a');
  const tableHead = colorToken(theme, 'tableHead', '#eef6f1');

  let html = String(source);
  html = replaceOpeningTag(html, 'h1', `margin:0 0 ${paragraph + 4}px;color:${heading};font-size:${h1Size}px;line-height:1.28;font-weight:700`);
  html = replaceOpeningTag(html, 'h2', `margin:${section}px 0 13px;padding-left:11px;border-left:4px solid ${primary};color:${heading};font-size:${h2Size}px;line-height:1.35;font-weight:700`);
  html = replaceOpeningTag(html, 'h3', `margin:23px 0 9px;color:${heading};font-size:${h3Size}px;line-height:1.5;font-weight:700`);
  html = replaceOpeningTag(html, 'p', `margin:0 0 ${paragraph}px;color:${text};font-size:${bodySize}px;line-height:${lineHeight}`);
  html = addStyleToTag(html, 'strong', `color:${primary};font-weight:750`);
  html = addStyleToTag(html, 'em', 'font-style:italic');
  html = addStyleToTag(html, 'u', 'text-decoration:underline');
  html = addStyleToTag(html, 'del', 'text-decoration:line-through');
  html = addStyleToTag(html, 'a', `color:${primaryDark};text-decoration:none`);
  html = replaceOpeningTag(html, 'blockquote', `margin:20px 0;padding:13px 15px;border-left:3px solid ${quoteBorder};border-radius:0 4px 4px 0;background:${quoteBg};color:${quoteText};font-size:14px;line-height:1.75`);
  html = replaceOpeningTag(html, 'figure', 'margin:21px 0 23px;text-align:center');
  html = replaceOpeningTag(html, 'figcaption', `margin-top:7px;color:${muted};font-size:${captionSize}px;line-height:1.5;text-align:center`);
  html = addStyleToTag(html, 'img', `display:block;max-width:100%;height:auto;margin:0 auto;border-radius:${imageRadius}px`);
  html = replaceOpeningTag(html, 'ul', `margin:0 0 ${paragraph}px;padding-left:1.4em;color:${text};font-size:${bodySize}px;line-height:${lineHeight}`);
  html = replaceOpeningTag(html, 'ol', `margin:0 0 ${paragraph}px;padding-left:1.4em;color:${text};font-size:${bodySize}px;line-height:${lineHeight}`);
  html = replaceOpeningTag(html, 'li', 'margin:0 0 6px;padding-left:2px');
  html = replaceOpeningTag(html, 'pre', `margin:18px 0;padding:14px;overflow-x:auto;border:1px solid ${border};border-radius:4px;background:${codeBg};color:${codeText};font:12px/1.7 SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word`);
  html = addStyleToTag(html, 'code', `font-family:SFMono-Regular,Menlo,monospace;color:${codeText};background:${codeBg};font-size:.92em`);
  html = html.replace(/<div\s+class=(['"])table-wrap\1>/gi, `<div style="margin:0 0 ${paragraph}px;overflow-x:auto">`);
  html = replaceOpeningTag(html, 'table', `width:100%;border-collapse:collapse;border-spacing:0;color:${text};font-size:14px;line-height:1.6`);
  html = replaceOpeningTag(html, 'th', `padding:8px 10px;border:1px solid ${border};background:${tableHead};color:${primaryDark};font-weight:700;text-align:left`);
  html = replaceOpeningTag(html, 'td', `padding:8px 10px;border:1px solid ${border};color:${text};vertical-align:top`);
  html = replaceOpeningTag(html, 'hr', `height:1px;margin:26px 0;border:0;border-top:1px solid ${border}`);
  return html;
}
