import { fileURLToPath } from "node:url";
import path from "node:path";

export function resolveRepoRoot(importMetaUrl) {
  return path.resolve(fileURLToPath(new URL("..", importMetaUrl)));
}

