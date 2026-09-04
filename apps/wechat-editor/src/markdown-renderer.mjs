const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const IMAGE_EXTENSION_PATTERN = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;

function normalizeImageUrl(value = '') {
  let url = String(value).trim();
  if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1).trim();
  while (url.endsWith(')') && !url.includes('(')) url = url.slice(0, -1).trim();
  return url;
}

function isImageUrl(value = '') {
  const url = normalizeImageUrl(value);
  if (!/^(?:https?:\/\/|data:image\/|\/|\.\.?\/)/i.test(url)) return false;
  if (/^data:image\//i.test(url)) return true;
  try {
    const pathname = /^https?:\/\//i.test(url)
      ? new URL(url).pathname
      : url.split(/[?#]/, 1)[0];
    return IMAGE_EXTENSION_PATTERN.test(pathname);
  } catch {
    return false;
  }
}

function standaloneImageUrl(line = '') {
  const candidate = String(line).trim();
  if (!candidate || /\s/.test(candidate)) return null;
  const url = normalizeImageUrl(candidate);
  return isImageUrl(url) ? url : null;
}

export function normalizePastedMarkdown(source = '') {
  const lines = String(source).replaceAll('\r\n', '\n').split('\n');
  let inFence = false;
  return lines
    .map((line) => {
      if (/^```/.test(line.trim())) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const url = standaloneImageUrl(line);
      if (!url) return line;
      const indent = line.match(/^[ \t]*/)?.[0] || '';
      return `${indent}![](${url})`;
    })
    .join('\n');
}

const safeUrl = (value = '') => {
  const url = value.trim();
  if (/^(https?:|mailto:|data:image\/|\/|\.\.?\/)/i.test(url)) {
    return escapeHtml(url);
  }
  return '#';
};

function renderInline(source = '') {
  const tokens = [];
  const hold = (html) => {
    const token = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };

  let text = String(source)
    .replace(/`([^`]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`))
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, url) =>
      hold(
        `<img src="${safeUrl(url)}" alt="${escapeHtml(alt)}" loading="lazy">`,
      ),
    )
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, url) =>
      hold(
        `<a href="${safeUrl(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`,
      ),
    )
    .replace(/<u>([\s\S]*?)<\/u>/gi, (_, content) => hold(`<u>${renderInline(content)}</u>`));

  text = escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

  return text.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
}

function stripMarkdown(source = '') {
  return String(source)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/<\/?u>/gi, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTableDivider(line = '') {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

function splitTableRow(line = '') {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function renderMarkdown(source = '') {
  const lines = String(source).replaceAll('\r\n', '\n').split('\n');
  const blocks = [];
  let index = 0;
  let title = '';

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      const language = fence[1];
      const code = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        `<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`,
      );
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      if (level === 1 && !title) title = stripMarkdown(heading[2]);
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push('<hr>');
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(`<blockquote>${quote.map(renderInline).join('<br>')}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ''));
        index += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`);
      continue;
    }

    const standaloneImage = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/);
    if (standaloneImage) {
      const [, alt, url] = standaloneImage;
      blocks.push(
        `<figure><img src="${safeUrl(url)}" alt="${escapeHtml(alt)}" loading="lazy">${alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : ''}</figure>`,
      );
      index += 1;
      continue;
    }

    const pastedImageUrl = standaloneImageUrl(line);
    if (pastedImageUrl) {
      blocks.push(`<figure><img src="${safeUrl(pastedImageUrl)}" alt="" loading="lazy"></figure>`);
      index += 1;
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = splitTableRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        `<div class="table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows
          .map(
            (row) =>
              `<tr>${headers.map((_, cellIndex) => `<td>${renderInline(row[cellIndex] ?? '')}</td>`).join('')}</tr>`,
          )
          .join('')}</tbody></table></div>`,
      );
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(?:#{1,3}\s+|```|>\s?|\s*[-*+]\s+|\s*\d+\.\s+|\s*(?:---+|___+|\*\*\*+)\s*$)/.test(lines[index]) &&
      !(lines[index].includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1]))
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
  }

  const plainText = stripMarkdown(source);
  return {
    html: blocks.join('\n'),
    title: title || plainText.slice(0, 42) || '未命名文章',
    plainText,
  };
}

export { escapeHtml };
