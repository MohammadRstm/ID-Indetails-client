#!/bin/sh
# Runs before nginx starts: without the API's address the site can't work, so the container stops at once.
set -eu
if [ -z "${API_UPSTREAM:-}" ]; then
    echo "API_UPSTREAM is not set: give the API's address, e.g. API_UPSTREAM=http://api:8080" >&2
    exit 1
fi
