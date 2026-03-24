#!/usr/bin/env bash
set -euo pipefail

npm --prefix backend ci --omit=dev
