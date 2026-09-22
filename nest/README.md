# 家长端（nest-parent-portal）部署说明

家长端是一个独立的 Vue 3 + Vite 单页应用（SPA），仅包含前端代码，所有数据接口由
`admin/server` 提供的后端服务处理（API 前缀为 `/api` 与 `/pet-garden/api`，默认端口 3002）。
本说明仅覆盖家长端前端的构建与部署；后端请参考 `admin/` 下的部署方式（Docker 镜像已在 `admin/Dockerfile` 中定义）。

## 1. 环境要求

- Node.js 20+（与 `admin/Dockerfile` 中 `node:20-alpine` 保持一致）
- 一个静态文件服务器（Nginx / Caddy 等）或任意可托管静态资源的平台

## 2. 本地开发

```bash
npm install
npm run dev          # 默认 http://localhost:5173
```

开发服务器已在 `vite.config.ts` 中配置了代理：`/api` 与 `/pet-garden/api` 转发到
`http://localhost:3002`（即本地运行的 `admin/server`）。

> **联调前置**：本地运行家长端前，请先启动 `admin/server` 后端（默认 `http://localhost:3002`）。
> 完整的三进程启动/关闭步骤见 `admin/README.md` 的「完整本地联调（教师端 + 后端 + 家长端）」一节。

## 3. 生产构建

```bash
npm install
npm run build        # 输出到 dist/
npm run preview      # 可选：本地预览构建产物
```

构建产物为纯静态文件，可直接拷贝到任意静态服务器。

### API 地址配置

前端通过 `VITE_API_BASE` 决定接口基址，默认值为 `/api`：

- **与后端同域（推荐）**：保持默认 `/api`，由反向代理将 `/api` 转发到后端，无需额外配置。
- **独立域名/跨域**：在构建前设置

  ```bash
  VITE_API_BASE=https://api.example.com/api npm run build
  ```

  后端已启用 `cors()`，默认允许跨域请求，无需额外改动。

## 4. 部署方式一：Nginx 反向代理（推荐）

将 `dist/` 内容放到 Nginx 的站点根目录（建议用独立子域名，如 `parent.example.com`），
并把 `/api` 代理到后端服务。由于使用 HTML5 History 模式，所有非静态资源请求需回退到 `index.html`。

```nginx
server {
    listen 80;
    server_name parent.example.com;

    root /var/www/nest/dist;
    index index.html;

    # 静态资源长期缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # 接口转发到家长端后端（admin/server，默认端口 3002）
    location /api/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 兼容 /pet-garden/api 前缀
    location /pet-garden/api/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA 回退：非文件请求一律返回 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

> 若家长端与教师端部署在同一域名下（如 `example.com/` 与 `example.com/pet-garden`），
> 需为家长端设置 `base` 路径：在 `vite.config.ts` 与 `router/index.ts` 中指定子路径（如 `/parent`），
> 并相应调整 Nginx 的 `location` 与 `root`。

## 5. 部署方式二：Docker（多阶段构建）

家长端可打包为 Nginx 镜像，与 `admin` 后端容器一同运行。

`nest/Dockerfile`：

```dockerfile
# 构建前端
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# 生产运行：nginx 托管静态资源
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

配套 `nest/nginx.conf`（参考第 4 节的 Nginx 配置，`proxy_pass` 改为后端容器服务名，
如 `http://admin-backend:3002`）。

`docker-compose.yml` 示例（仅展示家长端与后端的关系）：

```yaml
services:
  backend:                       # admin/server 后端（详见 admin/Dockerfile）
    image: your-registry/pet-garden-admin:latest
    ports:
      - "3002:3002"
    volumes:
      - petgarden-data:/data     # 持久化 SQLite 数据

  parent:                        # 本家长端
    build: ./nest
    ports:
      - "8080:80"
    depends_on:
      - backend
    # 若用独立域名直连后端，可在此用 VITE_API_BASE 构建；
    # 若经 Nginx 代理 /api，则无需设置。
```

## 6. 注意事项

- **数据库持久化**：家长端不持有数据库，家长密码等数据全部存储在后端 SQLite 文件
  （`admin` 后端通过 `SQLITE_PATH` 指定，Docker 中挂载到 `/data`）。部署后端时务必挂载持久卷。
- **SPA 回退必需**：因使用 `createWebHistory()`，缺少 `try_files ... /index.html` 会导致刷新子路由 404。
- **HTTPS**：生产环境建议在 Nginx / 反向代理层终止 TLS，并配置 `X-Forwarded-Proto`。
- **健康检查**：后端提供 `GET /api/health` 返回 `{"status":"ok"}`，可用于容器探活。
- **前端路由**：家长端当前路由均为根路径下的相对跳转，无需额外路由配置。
