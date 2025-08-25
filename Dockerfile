# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm i --production=false

FROM deps AS build
WORKDIR /app
COPY src ./src
COPY configs ./configs
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/configs ./configs
# 数据目录（Zeabur 可将持久化存储挂载到 /app/data）
RUN mkdir -p /app/data
VOLUME ["/app/data"]
# 由平台注入 PORT；Express 会监听该端口
EXPOSE 3000
CMD ["node","dist/index.js"]

