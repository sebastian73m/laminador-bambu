#!/usr/bin/env bash
set -euo pipefail
laminador_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
laminador_engine="$laminador_root/.engine/source"
laminador_revision="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).commit" "$laminador_root/scripts/engine-revision.json")"
for laminador_tool in git cmake make g++; do command -v "$laminador_tool" >/dev/null || { echo "Falta $laminador_tool" >&2; exit 1; }; done
if [[ ! -d "$laminador_engine/.git" ]]; then
 mkdir -p "$laminador_root/.engine"
 git clone --depth 1 --branch v02.08.02.61 https://github.com/bambulab/BambuStudio.git "$laminador_engine"
fi
if [[ "$(git -C "$laminador_engine" rev-parse HEAD)" != "$laminador_revision" ]]; then echo 'La revisión del motor no coincide; revisa .engine/source.' >&2; exit 1; fi
if [[ -n "$(git -C "$laminador_engine" status --porcelain)" ]]; then echo 'El código del motor tiene cambios locales; se conserva y no se compila automáticamente.' >&2; exit 1; fi
cd "$laminador_engine"
# Install prerequisites separately following docs/engine.md. This command never invokes sudo.
./BuildLinux.sh -ds
printf '\nMotor compilado. Busca el ejecutable en .engine/source/build y configura BAMBU_STUDIO_PATH.\n'
