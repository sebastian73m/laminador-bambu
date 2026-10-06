#!/usr/bin/env bash
set -euo pipefail
: "${BAMBU_NATIVE_PATH:?Configura BAMBU_NATIVE_PATH con el ejecutable o AppRun real}"
exec xvfb-run -a "$BAMBU_NATIVE_PATH" "$@"
