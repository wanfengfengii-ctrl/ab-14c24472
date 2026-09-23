# syntax=docker/dockerfile:1

# ---- 依赖层 ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --cache /tmp/npm-cache

# ---- 静态构建层 ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- 静态应用运行层（纯前端，无业务后端） ----
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

# ---- 一次性复核层：测试 + 构建 + HTTP 冒烟，以退出码报告结果 ----
FROM deps AS verify
WORKDIR /app
COPY . .
CMD ["sh", "scripts/verify.sh"]
