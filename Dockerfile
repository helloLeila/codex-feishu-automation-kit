# Keep the base image configurable so deployments can use a reachable regional
# registry without changing the application image or the editor design.
ARG NODE_BASE_IMAGE=node:20-bookworm-slim
FROM ${NODE_BASE_IMAGE}

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY apps/wechat-editor ./apps/wechat-editor
COPY scripts/build-wechat-editor.mjs ./scripts/build-wechat-editor.mjs
RUN npm run build:editor

FROM ${NODE_BASE_IMAGE} AS runtime

ENV NODE_ENV=production \
    PORT=3210 \
    HOST=0.0.0.0 \
    OPEN_WECHAT_EDITOR_CONFIG_DIR=/data/config

WORKDIR /app

COPY --from=0 /app/package.json /app/package-lock.json ./
COPY --from=0 /app/node_modules ./node_modules
COPY --from=0 /app/apps/wechat-editor ./apps/wechat-editor
COPY scripts/start-wechat-editor.mjs ./scripts/start-wechat-editor.mjs
COPY scripts/healthcheck-wechat-editor.mjs ./scripts/healthcheck-wechat-editor.mjs

RUN mkdir -p /data/config \
    && chown -R node:node /app /data

USER node

EXPOSE 3210
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node scripts/healthcheck-wechat-editor.mjs

CMD ["node", "scripts/start-wechat-editor.mjs"]
