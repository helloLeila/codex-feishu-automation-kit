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
