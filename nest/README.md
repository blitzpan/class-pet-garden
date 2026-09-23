# 家长端（nest-parent-portal）

家长端是一个独立的 Vue 3 + Vite 单页应用（SPA），**只包含前端代码**，没有自己的数据库。
所有数据都通过接口从后端 `admin/server` 获取（接口前缀 `/api`，默认端口 3002）。

## 本地开发

```bash
npm install
npm run dev          # 默认 http://localhost:5173
```

开发服务器已在 `vite.config.ts` 中配置代理：`/api`、`/pet-garden/api` → `http://localhost:3002`，宠物图片 `/pets` → 教师端开发服务 `http://localhost:3001`。

> **联调前置**：家长端单独启动看不到数据，需要先启动后端；宠物图片要正常显示还需同时启动教师端。

## 部署与联调文档

打包、部署、配置、本地三端联调统一记录在仓库根目录的 `docs/` 下：

| 文档 | 内容 |
|------|------|
| [`../docs/LOCAL-DEV.md`](../docs/LOCAL-DEV.md) | 本地三端联调（教师端 + 后端 + 家长端） |
| [`../docs/LOCAL-BUILD.md`](../docs/LOCAL-BUILD.md) | 本地打包、改配置、上传服务器 |
| [`../docs/DEPLOY-PRODUCTION.md`](../docs/DEPLOY-PRODUCTION.md) | 生产部署（1Panel + OpenResty + systemd） |

## 前端要点（开发时需要知道）

- 路由为 HTML5 History 模式（`createWebHistory()`），**部署时 Web 服务器必须配置 SPA 回退**（`try_files $uri $uri/ /index.html`），否则刷新子页面会 404。
- 接口基址由构建期变量 `VITE_API_BASE` 决定，默认 `/api`（同域部署无需修改）。
- 宠物图片路径写死为 `/pets/{宠物ID}/lv{等级}.webp`，图片源文件在教师端 `admin/public/pets`。
- 宠物类型与等级配置需与教师端 `admin/src/data/pets.ts` 保持一致。
- 路由：`/` 排行榜、`/gallery` 宠物图鉴、`/student/:studentId` 学生详情。
