# syntax=docker/dockerfile:1

# The production image: the static build served by nginx, which also proxies /api and /hubs to the API so the
# browser sees one origin (the refresh cookie is SameSite=Strict, Path=/api/auth). See docs/deployment.md.

ARG NODE_VERSION=24
ARG NGINX_VERSION=1.28

# --- build: install from the lockfile, type-check and bundle -------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# --- runtime: nginx only, as its unprivileged user (uid 101), on port 8080 -------------------------------------
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine AS runtime

# The image's own example site is replaced by ours; the template is filled in with API_UPSTREAM when it starts.
USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=755 deploy/nginx/10-require-api-upstream.sh /docker-entrypoint.d/10-require-api-upstream.sh
COPY --from=build /app/dist /usr/share/nginx/html
USER 101

EXPOSE 8080
# Finish the requests in flight, then stop.
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
