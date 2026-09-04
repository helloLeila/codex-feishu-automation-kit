#!/bin/zsh

set -e

NODE_BIN="/Users/leila/.nvm/versions/node/v25.8.0/bin/node"
PICGO_ENTRY="/Users/leila/.nvm/versions/node/v25.8.0/lib/node_modules/picgo/bin/picgo"
PICGO_CONFIG="/Users/leila/Library/Application Support/picgo/data.json"

exec "$NODE_BIN" "$PICGO_ENTRY" --config "$PICGO_CONFIG" upload "$@"
