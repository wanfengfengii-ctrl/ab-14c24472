# syntax=docker/dockerfile:1

# ---------- 依赖 ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- 构建静态资源 ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- 运行态：纯静态站点 ----------
FROM nginx:1.27-alpine AS app
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

# ---------- verify 一次性镜像：测试 + 构建 + HTTP 冒烟，退出码报告成败 ----------
FROM node:22-alpine AS verify
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV PORT=4173
CMD ["node", "scripts/verify.mjs"]
