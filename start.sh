#!/usr/bin/env bash
set -euo pipefail

npm run railway:bootstrap
exec npm run railway:start
