#!/usr/bin/env bash
set -euo pipefail
laminador_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$laminador_root"
if ! command -v node >/dev/null; then echo 'Instala Node.js >=22.12 antes de continuar.' >&2; exit 1; fi
export PROJECTS_DIR="${PROJECTS_DIR:-$laminador_root/projects}"
mkdir -p "$PROJECTS_DIR"
if [[ ! -d node_modules ]]; then npm ci; fi
npm run build
exec node dist/server.js "$@"
