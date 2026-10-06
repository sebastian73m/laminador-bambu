#!/usr/bin/env bash
set -euo pipefail
# Keep AppRun, bundled libraries, profiles and resources together.
exec xvfb-run -a /opt/bambu/squashfs-root/AppRun "$@"
