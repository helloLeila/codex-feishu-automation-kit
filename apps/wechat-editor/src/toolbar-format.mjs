function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number.isInteger(value) ? value : minimum));
}

function stripHeadingPrefix(line) {
  return line.replace(/^\s*#{1,6}\s+/, '');
}

function lineRange(source, from, to = from) {
  const start = source.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
  const nextBreak = source.indexOf('\n', to);
  return { start, end: nextBreak === -1 ? source.length : nextBreak };
}

function toggleQuoteLines(text) {
  const lines = text.split('\n');
  const contentLines = lines.filter((line) => line.trim());
  const removeQuote = contentLines.length > 0 && contentLines.every((line) => /^\s*>\s?/.test(line));

  return lines.map((line) => {
    if (removeQuote) return line.replace(/^(\s*)>\s?/, '$1');
    return line ? `> ${line}` : '>';
  }).join('\n');
}

function toggleInlineMarkup(source, from, to, marker, fallback) {
  const selected = source.slice(from, to);
  const wrappedLength = marker.length * 2;
  if (selected.length >= wrappedLength && selected.startsWith(marker) && selected.endsWith(marker)) {
    let replacement = selected;
    while (replacement.length >= wrappedLength && replacement.startsWith(marker) && replacement.endsWith(marker)) {
      replacement = replacement.slice(marker.length, -marker.length);
    }
    return { start: from, end: to, replacement };
  }

  let wrappedStart = from;
  let wrappedEnd = to;
  while (source.slice(wrappedStart - marker.length, wrappedStart) === marker
    && source.slice(wrappedEnd, wrappedEnd + marker.length) === marker) {
    wrappedStart -= marker.length;
    wrappedEnd += marker.length;
  }
  if (wrappedStart !== from) {
    return { start: wrappedStart, end: wrappedEnd, replacement: selected };
  }

  return { start: from, end: to, replacement: selected ? `${marker}${selected}${marker}` : fallback };
}

function toggleInlineTag(source, from, to, tag, fallback) {
  const selected = source.slice(from, to);
  const opening = `<${tag}>`;
  const closing = `</${tag}>`;
  if (selected.length >= opening.length + closing.length && selected.startsWith(opening) && selected.endsWith(closing)) {
    return { start: from, end: to, replacement: selected.slice(opening.length, -closing.length) };
  }

  const hasAdjacentTags = source.slice(from - opening.length, from) === opening
    && source.slice(to, to + closing.length) === closing;
  if (hasAdjacentTags) {
    return { start: from - opening.length, end: to + closing.length, replacement: selected };
  }

  return { start: from, end: to, replacement: selected ? `${opening}${selected}${closing}` : fallback };
}

function splitBlockPrefix(line) {
  const match = String(line).match(/^(\s*(?:(?:#{1,6})\s+|>\s?|(?:[-*+]\s+)|(?:\d+[.)]\s+)))(.*)$/);
  return match ? { prefix: match[1], content: match[2] } : { prefix: '', content: String(line) };
}

function inlineParts(value) {
  const text = String(value);
  const leading = text.match(/^[ \t]*/)?.[0] || '';
  const trailing = text.match(/[ \t]*$/)?.[0] || '';
  const end = Math.max(leading.length, text.length - trailing.length);
  return { leading, core: text.slice(leading.length, end), trailing };
}

function isInlineWrapped(value, opening, closing) {
  const { core } = inlineParts(value);
  return core.length >= opening.length + closing.length
    && core.startsWith(opening)
    && core.endsWith(closing);
}

function wrapInlineValue(value, opening, closing) {
  const { leading, core, trailing } = inlineParts(value);
  return core ? `${leading}${opening}${core}${closing}${trailing}` : value;
}

function unwrapInlineValue(value, opening, closing) {
  const { leading, core: initialCore, trailing } = inlineParts(value);
  let core = initialCore;
  while (isInlineWrapped(core, opening, closing)) {
    core = core.slice(opening.length, -closing.length);
  }
  return `${leading}${core}${trailing}`;
}

function toggleInlineBlock(text, opening, closing) {
  const lines = String(text).split('\n');
  let inFence = false;
  const eligible = [];
  const parsed = lines.map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return { line, skip: true };
    }
    if (inFence || !line.trim() || /^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      return { line, skip: true };
    }
    const block = splitBlockPrefix(line);
    const item = { ...block, line, skip: false };
    eligible.push(item);
    return item;
  });
  if (!eligible.length) return text;

  const remove = eligible.every(({ content }) => isInlineWrapped(content, opening, closing));
  return parsed.map((item) => {
    if (item.skip) return item.line;
    const content = remove
      ? unwrapInlineValue(item.content, opening, closing)
      : wrapInlineValue(item.content, opening, closing);
    return `${item.prefix}${content}`;
  }).join('\n');
}

function repairMultilineWrapper(text, pattern, opening, closing) {
  return text.replace(pattern, (match, content) => (
    content.includes('\n') ? toggleInlineBlock(content, opening, closing) : match
  ));
}

export function normalizeLegacyMultilineFormatting(source = '') {
  const fencedBlocks = [];
  let text = String(source).replace(/```[\s\S]*?```/g, (block) => {
    const token = `\u0000LEGACY_FENCE_${fencedBlocks.length}\u0000`;
    fencedBlocks.push(block);
    return token;
  });

  text = repairMultilineWrapper(text, /<u>([\s\S]*?)<\/u>/gi, '<u>', '</u>');
  text = repairMultilineWrapper(text, /\*\*([\s\S]*?)\*\*/g, '**', '**');
  text = repairMultilineWrapper(text, /(?<!\*)\*(?!\*)([\s\S]*?)(?<!\*)\*(?!\*)/g, '*', '*');
  text = repairMultilineWrapper(text, /`([\s\S]*?)`/g, '`', '`');

  return text.replace(/\u0000LEGACY_FENCE_(\d+)\u0000/g, (_, index) => fencedBlocks[Number(index)]);
}

function toggleListLines(text, ordered = false) {
  const lines = text.split('\n');
  const contentLines = lines.filter((line) => line.trim());
  const marker = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
  const removeList = contentLines.length > 0 && contentLines.every((line) => marker.test(line));

  return lines.map((line, index) => {
    if (removeList) return line.replace(marker, '');
    return line ? `${ordered ? `${index + 1}.` : '-'} ${line}` : line;
  }).join('\n');
}

function toggleLink(source, from, to) {
  const selected = source.slice(from, to);
  const fullLink = selected.match(/^\[([\s\S]*)\]\(([^)]*)\)$/);
  if (fullLink) return { start: from, end: to, replacement: fullLink[1] };

  const before = source.slice(0, from).match(/\[([^\]]*)\]$/);
  const after = source.slice(to).match(/^\(([^)]*)\)/);
  if (before && after) {
    return {
      start: from - before[0].length,
      end: to + after[0].length,
      replacement: selected,
    };
  }

  return { start: from, end: to, replacement: `[${selected || '链接文字'}](https://)` };
}

/**
 * Return a safe replacement range for a Markdown toolbar action.
 * The caller can pass the result to textarea.setRangeText without losing selection content.
 */
export function formatMarkdownSelection({ snippet, value = '', start = 0, end = start }) {
  const source = String(value);
  const from = clamp(start, 0, source.length);
  const to = clamp(Math.max(from, end), from, source.length);
  const selected = source.slice(from, to);
  const headingMatch = String(snippet).match(/^(#{1,3})\s$/);

  const multilineWrapper = {
    '**粗体**': ['**', '**'],
    '*斜体*': ['*', '*'],
    '`代码`': ['`', '`'],
    '<u>下划线</u>': ['<u>', '</u>'],
  }[snippet];
  if (selected.includes('\n') && multilineWrapper) {
    const range = lineRange(source, from, to);
    const [opening, closing] = multilineWrapper;
    return {
      start: range.start,
      end: range.end,
      replacement: toggleInlineBlock(source.slice(range.start, range.end), opening, closing),
    };
  }

  if (headingMatch) {
    const prefix = `${headingMatch[1]} `;
    if (selected) {
      return { start: from, end: to, replacement: `${prefix}${stripHeadingPrefix(selected)}` };
    }
    const { start: lineStart, end: lineEnd } = lineRange(source, from);
    const line = source.slice(lineStart, lineEnd);
    return { start: lineStart, end: lineEnd, replacement: `${prefix}${stripHeadingPrefix(line)}` };
  }

  if (snippet === '**粗体**') {
    return toggleInlineMarkup(source, from, to, '**', snippet);
  }

  if (snippet === '*斜体*') {
    return toggleInlineMarkup(source, from, to, '*', snippet);
  }

  if (snippet === '> 引用') {
    const range = selected ? lineRange(source, from, to) : lineRange(source, from);
    const block = source.slice(range.start, range.end);
    return { start: range.start, end: range.end, replacement: toggleQuoteLines(block || selected || '') };
  }

  if (snippet === '- 列表项') {
    const range = selected ? lineRange(source, from, to) : lineRange(source, from);
    const block = source.slice(range.start, range.end);
    return { start: range.start, end: range.end, replacement: toggleListLines(block || selected || '') };
  }

  if (snippet === '1. 列表项') {
    const range = selected ? lineRange(source, from, to) : lineRange(source, from);
    const block = source.slice(range.start, range.end);
    return { start: range.start, end: range.end, replacement: toggleListLines(block || selected || '', true) };
  }

  if (snippet === '[链接文字](https://)') {
    return toggleLink(source, from, to);
  }

  if (snippet === '`代码`') {
    return toggleInlineMarkup(source, from, to, '`', snippet);
  }

  if (snippet === '<u>下划线</u>') {
    return toggleInlineTag(source, from, to, 'u', snippet);
  }

  if (snippet === '![图片说明](/assets/editorial-cover.svg)' && selected) {
    return { start: from, end: to, replacement: `![${selected}](/assets/editorial-cover.svg)` };
  }

  if (snippet === '---' && selected) {
    return { start: from, end: to, replacement: `${selected}\n---` };
  }

  return { start: from, end: to, replacement: String(snippet) };
}
