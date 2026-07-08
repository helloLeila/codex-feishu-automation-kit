export const stripMarkdown = (value) =>
  value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .trim();

export const truncate = (value, max = 180) => {
  const normalized = stripMarkdown(value).replace(/\s+/g, " ");
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
};

export const numberedItems = (section, limit = 8) =>
  section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .slice(0, limit)
    .map((line) => line.replace(/^\d+\.\s+/, ""));

export const extractAiSection = (text, headingPattern, nextHeadingPattern = /\n## \d+\./) => {
  const start = text.search(headingPattern);
  if (start === -1) return "";
  const afterStart = text.slice(start).replace(/^## .+\n/, "");
  const next = afterStart.search(nextHeadingPattern);
  return (next === -1 ? afterStart : afterStart.slice(0, next)).trim();
};

export const extractTopLevelSection = (text, heading) => {
  const start = text.search(new RegExp(`^# ${heading}$`, "m"));
  if (start === -1) return "";
  const afterStart = text.slice(start).replace(/^# .+\n/, "");
  const next = afterStart.search(/\n# /);
  return (next === -1 ? afterStart : afterStart.slice(0, next)).trim();
};

const parseLabelLine = (line) => {
  const match = line.match(/^\s*(?:[-*+]\s*)?(.+?)\s*[：:]\s*(.*)$/);
  if (!match) return null;
  const label = stripMarkdown(match[1]).replace(/\s+/g, "");
  return {
    label,
    value: match[2].trim(),
  };
};

export const extractLabeledValue = (section, labels, options = {}) => {
  const wanted = new Set((Array.isArray(labels) ? labels : [labels]).map((label) => (
    String(label).replace(/\s+/g, "")
  )));
  const lines = String(section ?? "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const parsed = parseLabelLine(lines[index]);
    if (!parsed || !wanted.has(parsed.label)) continue;

    const values = [];
    if (parsed.value) values.push(parsed.value);

    if (options.multiline) {
      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const line = lines[nextIndex];
        const trimmed = line.trim();
        if (!trimmed) {
          if (values.length) break;
          continue;
        }
        if (/^#{1,6}\s+/.test(trimmed) || parseLabelLine(line)) break;
        values.push(trimmed.replace(/^[-*+]\s+/, "- "));
      }
    }

    return values.join(options.separator ?? "\n").trim();
  }

  return "";
};
