# hotspot-lite

最小化热点抓取与本地聚合工具（个人使用）。

- 运行：
  - `npm i`
  - `npm run dev`
- 配置：编辑 `configs/sources.yaml` 开启/关闭源
- 环境变量：支持 `PORT`、`LOG_LEVEL`
- 接口：
  - `GET /` 简易页面
  - `GET /feed?type=A&sinceMinutes=120&limit=20`
  - `GET /events?view=html`
  - `GET /rss/:sourceId`
  - `GET /sources` 查看源状态
  - `GET /health`

部署到 Zeabur
- 方式一（推荐）：点选 Node 项目，自动检测 build/start，根目录选择 `hotspot-lite`；环境变量：`PORT`（平台自动注入）、`DEEPSEEK_API_KEY`（可选）、`LOG_LEVEL`。
- 方式二：使用 Docker（仓库已提供 `Dockerfile`）。
- 存储：将持久化卷挂载到 `/app/data`。

日志采用 Winston，代码在 `src/logger.ts`。
