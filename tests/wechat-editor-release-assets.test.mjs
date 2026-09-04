import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function readRepositoryFile(relativePath) {
  return readFile(join(repositoryRoot, relativePath), "utf8");
}

test("Docker image starts the editor on port 3210 with a persistent /data volume", async () => {
  const dockerfile = await readRepositoryFile("Dockerfile");

  assert.match(dockerfile, /^ARG NODE_BASE_IMAGE=node:20-bookworm-slim$/m);
  assert.match(dockerfile, /^FROM \$\{NODE_BASE_IMAGE\}$/m);
  assert.match(dockerfile, /WORKDIR\s+\/app/);
  assert.match(dockerfile, /EXPOSE\s+3210/);
  assert.match(dockerfile, /OPEN_WECHAT_EDITOR_CONFIG_DIR=\/data\/config/);
  assert.match(dockerfile, /scripts\/start-wechat-editor\.mjs/);
  assert.match(dockerfile, /VOLUME\s+\[?\s*["']?\/data/);
});

test("docker compose maps the editor port and keeps local data outside the container", async () => {
  const compose = await readRepositoryFile("docker-compose.yml");

  assert.match(compose, /services:/);
  assert.match(compose, /editor:/);
  assert.match(compose, /build:\s*[\s\S]*context:\s*\./);
  assert.match(compose, /args:\s*[\s\S]*NODE_BASE_IMAGE:\s*"?\$\{NODE_BASE_IMAGE:-node:20-bookworm-slim\}"?/);
  assert.match(compose, /\$\{PORT:-3210\}:3210/);
  assert.match(compose, /\.\/data:\/data/);
  assert.match(compose, /OPEN_WECHAT_EDITOR_CONFIG_DIR:\s*"?\/data\/config"?/);
  assert.match(compose, /WECHAT_APP_ID:/);
  assert.match(compose, /WECHAT_APP_SECRET:/);
  assert.match(compose, /EDITOR_AUTH_ENABLED:/);
  assert.match(compose, /EDITOR_AUTH_USER:/);
  assert.match(compose, /EDITOR_AUTH_PASSWORD:/);
  assert.match(compose, /EDITOR_SESSION_SECRET:/);
});

test("environment example documents safe placeholders and editor persistence", async () => {
  const envExample = await readRepositoryFile(".env.example");

  assert.match(envExample, /^NODE_BASE_IMAGE=node:20-bookworm-slim$/m);
  assert.match(envExample, /^PORT=3210/m);
  assert.match(envExample, /^WECHAT_APP_ID=\s*$/m);
  assert.match(envExample, /^WECHAT_APP_SECRET=\s*$/m);
  assert.match(envExample, /^WECHAT_API_BASE_URL=https:\/\/api\.weixin\.qq\.com$/m);
  assert.match(envExample, /^OPEN_WECHAT_EDITOR_CONFIG_DIR=\/data\/config$/m);
  assert.match(envExample, /^EDITOR_AUTH_ENABLED=false$/m);
  assert.match(envExample, /^EDITOR_AUTH_USER=editor$/m);
  assert.match(envExample, /^EDITOR_AUTH_PASSWORD=$/m);
  assert.match(envExample, /^EDITOR_SESSION_SECRET=$/m);
  assert.doesNotMatch(envExample, /wx[a-zA-Z0-9]{8,}/);
  assert.doesNotMatch(envExample, /^(?!#).*SECRET=.*[A-Za-z0-9]{12,}/m);
});

test("README explains both local and Docker startup plus persistent credentials", async () => {
  const readme = await readRepositoryFile("README.md");

  assert.match(readme, /npm start/);
  assert.match(readme, /docker compose --env-file \.env\.local up --build/);
  assert.match(readme, /\.\/data/);
  assert.match(readme, /OPEN_WECHAT_EDITOR_CONFIG_DIR/);
  assert.match(readme, /WECHAT_APP_ID/);
  assert.match(readme, /WECHAT_APP_SECRET/);
  assert.match(readme, /不会写入浏览器.*localStorage/);
  assert.match(readme, /NODE_BASE_IMAGE/);
  assert.match(readme, /docker\.m\.daocloud\.io\/library\/node:20-bookworm-slim/);
});

test("release checklist includes editor secret and container checks", async () => {
  const checklist = await readRepositoryFile("docs/release-checklist.md");

  assert.match(checklist, /Docker/);
  assert.match(checklist, /\.env\.example/);
  assert.match(checklist, /WECHAT_APP_SECRET/);
  assert.match(checklist, /docker compose config/);
  assert.match(checklist, /npm run check/);
});

test("release assets are present as regular files", async () => {
  for (const relativePath of ["Dockerfile", "docker-compose.yml", ".env.example"]) {
    await assert.doesNotReject(access(join(repositoryRoot, relativePath)));
  }
});
