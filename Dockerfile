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
# pcre2 is upgraded for CVE-2026-103111 (fixed in 10.49-r0) and brotli-libs for CVE-2026-111497 (fixed in 1.2.1-r0)
# until the base image ships them; only those packages, as a full upgrade could replace nginx.org's nginx with Alpine's.
USER root
RUN apk upgrade --no-cache pcre2 brotli-libs && rm -f /etc/nginx/conf.d/default.conf
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
