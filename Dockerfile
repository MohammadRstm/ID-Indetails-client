# syntax=docker/dockerfile:1

# The production image: the static build served by nginx, which also proxies /api and /hubs to the API so the
# browser sees one origin (the refresh cookie is SameSite=Strict, Path=/api/auth). See docs/deployment.md.

ARG NODE_VERSION=24
ARG NGINX_VERSION=1.30

# --- build: install from the lockfile, type-check and bundle -------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# --- runtime: nginx only, as its unprivileged user (uid 101), on port 8080 -------------------------------------
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine AS runtime

# The image's own example site is replaced by ours.
# Packages with fixed high-severity CVEs are upgraded until the base image ships them: pcre2 (CVE-2026-103111, 10.49-r0),
# brotli-libs (CVE-2026-111497, 1.2.1-r0), curl and libcurl (CVE-2026-92392, 8.23.0-r0), libexpat (CVE-2026-117610 and
# CVE-2026-118370, 2.10.0-r0), zlib (CVE-2026-85091, 1.3.2-r1), musl and musl-utils (CVE-2026-107891, 1.2.6-r3), libxml2 (CVE-2026-86144, 2.13.9-r3). Only those,
# as a full upgrade could replace nginx.org's nginx
# with Alpine's.
USER root
# nginx itself (CVE-2026-121810, CVE-2026-123007 and the rest fixed in 1.30.7) comes from nginx.org's own stable repository,
# the one the image installed it from, until the image ships it. The image pins its nginx version and drops nginx.org's
# signing key, so the key is copied in for this step (kept in the repo, checked against the SHA-512 nginx's own images use:
# nginx.org/keys stopped serving it on 22 November 2026) and nginx (with any of its modules) is asked for at 1.30.7.
COPY deploy/nginx/nginx_signing.rsa.pub /etc/apk/keys/nginx_signing.rsa.pub
RUN apk upgrade --no-cache pcre2 brotli-libs curl libcurl libexpat zlib musl musl-utils libxslt libxml2     && echo "e09fa32f0a0eab2b879ccbbc4d0e4fb9751486eedda75e35fac65802cc9faa266425edf83e261137a2f4d16281ce2c1a5f4502930fe75154723da014214f0655 */etc/apk/keys/nginx_signing.rsa.pub" | sha512sum -c -     && apk add --no-cache -X "https://nginx.org/packages/alpine/v$(cut -d. -f1,2 /etc/alpine-release)/main"         "nginx=~1.30.7" $(apk info | grep '^nginx-module-' | sed 's/$/=~1.30.7/')     && rm -f /etc/apk/keys/nginx_signing.rsa.pub /etc/nginx/conf.d/default.conf     && nginx -v 2>&1 | grep -q 'nginx/1.30.7'
# The site and its security headers are templates, filled in when the container starts with API_UPSTREAM and
# CONTENT_STORE_ORIGIN. The nginx image only fills in variables that are set, which is why the latter has a default below.
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/security-headers.conf.template /etc/nginx/templates/snippets/security-headers.conf.template
COPY --chmod=755 deploy/nginx/10-require-api-upstream.sh /docker-entrypoint.d/10-require-api-upstream.sh
COPY --from=build /app/dist /usr/share/nginx/html
USER 101

# Where the browser may send and load the client portal's files (the file storage's origin); empty adds nothing.
ENV CONTENT_STORE_ORIGIN=""

EXPOSE 8080
# Finish the requests in flight, then stop.
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
