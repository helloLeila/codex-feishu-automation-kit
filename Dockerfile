# Keep the base image configurable so deployments can use a reachable regional
# registry without changing the application image or the editor design.
ARG NODE_BASE_IMAGE=node:20-bookworm-slim
FROM ${NODE_BASE_IMAGE}

ENV NODE_ENV=production \
    PORT=3210 \
    HOST=0.0.0.0 \
    OPEN_WECHAT_EDITOR_CONFIG_DIR=/data/config

WORKDIR /app

# The editor intentionally has no runtime npm dependencies. Copy only the
# files needed by the local server so credentials and local data never enter
# the image build context.
COPY package.json ./
COPY apps/wechat-editor ./apps/wechat-editor
COPY scripts/start-wechat-editor.mjs ./scripts/start-wechat-editor.mjs

RUN mkdir -p /data/config \
    && chown -R node:node /app /data

USER node

EXPOSE 3210
VOLUME ["/data"]

CMD ["node", "scripts/start-wechat-editor.mjs"]
