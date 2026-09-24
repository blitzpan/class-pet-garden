# 本地打包 / 改配置 / 部署 到指定目录

> 目标：在你自己的电脑上，把项目打包成「可以扔到服务器上的三份产物」，并且搞清楚**每一项配置该在哪里改**。
> 服务器那边怎么接，看 `DEPLOY-PRODUCTION.md`。
> 想在本机跑起来改代码，看 `LOCAL-DEV.md`。
>
> 下面命令以 **Windows PowerShell** 为主，同时给出 Linux/macOS 的写法。

---

## 0. 先记住一个最关键的概念

配置分两类，改错地方就「改了没效果」：

| 类型 | 例子 | 什么时候生效 | 改完要做的事 |
|------|------|--------------|--------------|
| **构建期配置**（`VITE_` 开头） | `VITE_ADMIN_WECHAT_PHONE`<br>`VITE_WECHAT_PAY_QR_URL`<br>`VITE_API_BASE`（家长端用） | 打包时就被"烧"进 JS 文件里 | **必须重新打包 + 重新上传 dist** |
| **运行期配置**（后端 `.env`） | `SQLITE_PATH`、`TOKEN_SECRET`<br>`ADMIN_DEFAULT_PASSWORD`、`DISABLE_DEMO`<br>`PARENT_APP_BASE_URL` | 后端进程启动时读取 | **必须重启后端服务**（不用重新打包） |

一句话：**前端的东西改了要重新打包，后端的东西改了只要重启。**

---

## 1. 准备工作（只做一次）

### 1.1 装 Node.js 20

去 https://nodejs.org/ 下载 **20.x LTS** 安装包，一路下一步。

装完验证（PowerShell）：

```powershell
node -v    # v20.x
npm -v     # 10.x
```

### 1.2 选定一个工作目录

假设你把代码放在这里（**下面所有命令都以此为例子，你换成自己的路径即可**）：

```
D:\deploy\chongWu\
├── admin\      # 教师端（前端 + 后端 server 都在这里）
└── nest\       # 家长端
```

打包产物输出到：

```
D:\deploy\out\
├── teacher\    # 教师端 dist 内容
├── parent\     # 家长端 dist 内容
└── server\     # 后端源码（不含 node_modules）
```

先建好输出目录：

```powershell
New-Item -ItemType Directory -Force -Path D:\deploy\out\teacher, D:\deploy\out\parent, D:\deploy\out\server
```

### 1.3 安装依赖（三个目录各自独立）

```powershell
cd D:\deploy\chongWu\admin
npm ci

cd D:\deploy\chongWu\admin\server
npm ci --omit=dev        # 本机不跑后端的话这步可以跳过

cd D:\deploy\chongWu\nest
npm ci
```

> `npm ci` 会严格按 `package-lock.json` 安装，团队环境最一致。如果报 lock 文件不匹配，改用 `npm install`。

---

## 2. 打包教师端（admin）

### 2.1 默认打包（不带 VIP 收款信息）

```powershell
cd D:\deploy\chongWu\admin
npm run build
```

产物在 `D:\deploy\chongWu\admin\dist\`。

> `npm run build` 实际执行的是 `vue-tsc && vite build`，会先做 TypeScript 类型检查。
> 如果类型检查报错但你想先出包，可以单独跑 `npx vite build`（不推荐长期这么做）。

### 2.2 带 VIP 收款信息打包

教师端「灵犀计划/VIP」页面会显示管理员微信和收款二维码，这两个值**必须在打包时注入**：

```powershell
cd D:\deploy\chongWu\admin
$env:VITE_ADMIN_WECHAT_PHONE = "13800138000"
$env:VITE_WECHAT_PAY_QR_URL  = "https://你的域名/pay-qr.png"
npm run build
```

Linux / macOS：

```bash
cd ~/deploy/chongWu/admin
VITE_ADMIN_WECHAT_PHONE="13800138000" VITE_WECHAT_PAY_QR_URL="https://你的域名/pay-qr.png" npm run build
```

留空也可以（页面会提示"联系系统管理员"），那就直接 `npm run build`。

### 2.3 复制到输出目录

```powershell
Remove-Item -Recurse -Force D:\deploy\out\teacher\* -ErrorAction SilentlyContinue
Copy-Item -Path D:\deploy\chongWu\admin\dist\* -Destination D:\deploy\out\teacher\ -Recurse -Force
```

确认一下 `D:\deploy\out\teacher\index.html` 存在，**并且它下面直接就是 `assets`、`pets` 等目录**（不要多一层 `dist`）。

---

## 3. 打包家长端（nest）

### 3.1 默认打包（推荐）

```powershell
cd D:\deploy\chongWu\nest
npm run build
```

默认配置下家长端请求接口用的是相对路径 `/api`，由 OpenResty 转发到后端，**同域部署不需要任何额外配置**。

### 3.2 家长端用独立 API 域名时才要改

如果你的接口域名和家长端页面域名不一样（比如页面 `parent.example.com`，接口 `api.example.com`），打包时指定：

```powershell
cd D:\deploy\chongWu\nest
$env:VITE_API_BASE = "https://api.example.com/api"
npm run build
```

Linux / macOS：

```bash
VITE_API_BASE="https://api.example.com/api" npm run build
```

后端已经开启了 CORS，跨域不会有跨域拦截问题。

### 3.3 复制到输出目录

```powershell
Remove-Item -Recurse -Force D:\deploy\out\parent\* -ErrorAction SilentlyContinue
Copy-Item -Path D:\deploy\chongWu\nest\dist\* -Destination D:\deploy\out\parent\ -Recurse -Force
```

---

## 4. 准备后端包（server）

⚠️ **不要把 `node_modules` 一起打包上传。** `better-sqlite3` 是原生模块，Windows 装的版本在 Linux 服务器上跑不了。
后端依赖请在服务器上安装（见 `DEPLOY-PRODUCTION.md` 第 2.2 节）。

```powershell
# 复制后端源码（排除 node_modules 和日志/测试文件）
$src = "D:\deploy\chongWu\admin\server"
$dst = "D:\deploy\out\server"
Remove-Item -Recurse -Force "$dst\*" -ErrorAction SilentlyContinue

Copy-Item "$src\index.js"        $dst
Copy-Item "$src\db.js"           $dst
Copy-Item "$src\demo-seed.js"    $dst
Copy-Item "$src\package.json"    $dst
Copy-Item "$src\package-lock.json" $dst
Copy-Item "$src\middleware"  $dst\middleware  -Recurse -Force
Copy-Item "$src\routes"      $dst\routes      -Recurse -Force
Copy-Item "$src\services"    $dst\services    -Recurse -Force
Copy-Item "$src\utils"       $dst\utils       -Recurse -Force
```

或者用 robocopy 一行搞定（排除目录用 `/XD`）：

```powershell
robocopy "$src" "$dst" /E /XD node_modules TEST /XF *.log *.db *.db-wal *.db-shm *.err *.out
```

> robocopy 退出码 0~7 都算成功，别被红色吓到。

---

## 5. 改配置

### 5.1 后端运行期配置（写进 `.env`）

⚠️ **位置陷阱**：后端读的是 `server` 目录**上一级**的 `.env`。
在服务器上目录是 `/www/wwwroot/petgarden/server`，所以 `.env` 要放 `/www/wwwroot/petgarden/.env`。
（如果你在服务器上保留了完整仓库结构，那就是仓库里 `admin/.env`。）

生成密钥（服务器上或本地执行都行）：

```bash
openssl rand -hex 32
```

Windows 没有 openssl 时，用这个 PowerShell 命令生成：

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

`.env` 模板（直接抄 `admin/.env.example`，把值改掉）：

```ini
PORT=3002
SQLITE_PATH=/www/wwwroot/petgarden/data/pet-garden.db
TOKEN_SECRET=刚才生成的那串64位十六进制
ADMIN_DEFAULT_PASSWORD=换成强密码
DISABLE_DEMO=1
PARENT_APP_BASE_URL=https://parent.example.com

AUTH_RATE_LIMIT_ENABLED=true
AUTH_LOGIN_RATE_LIMIT_MAX=10
AUTH_LOGIN_RATE_LIMIT_WINDOW_MS=60000
```

完整含义见 `DEPLOY-PRODUCTION.md` 第 3.4 节的表。

### 5.2 前端构建期配置

| 变量 | 属于谁 | 作用 | 改完要做什么 |
|------|--------|------|--------------|
| `VITE_ADMIN_WECHAT_PHONE` | 教师端 | VIP 页面显示的管理员手机号/微信号 | 重新打包教师端 |
| `VITE_WECHAT_PAY_QR_URL` | 教师端 | VIP 收款二维码图片地址 | 重新打包教师端 |
| `VITE_API_BASE` | 家长端 | 接口基址，默认 `/api`；只有接口独立域名时才改 | 重新打包家长端 |
| `VITE_API_PORT`（间接） | 教师端 dev | 见 `LOCAL-DEV.md` | 仅联调相关 |

### 5.3 前端接口前缀是写死的，别乱改

- 教师端代码里写死了 `/pet-garden/api`（`admin/src/composables/useAuth.ts`），所以 **OpenResty 必须转发 `/pet-garden/api`**。
- 家长端默认是 `/api`，同时建议也转发 `/pet-garden/api` 做兼容。

---

## 6. 打成压缩包

```powershell
cd D:\deploy\out
Compress-Archive -Path .\teacher\* -DestinationPath .\teacher.zip -Force
Compress-Archive -Path .\parent\*  -DestinationPath .\parent.zip  -Force
Compress-Archive -Path .\server\*  -DestinationPath .\server.zip  -Force
```

得到三个 zip：

```
D:\deploy\out\teacher.zip   → 解压到服务器 /www/wwwroot/petgarden/teacher/
D:\deploy\out\parent.zip    → 解压到服务器 /www/wwwroot/petgarden/parent/
D:\deploy\out\server.zip    → 解压到服务器 /www/wwwroot/petgarden/server/
```

别忘了还有一个 `.env` 要单独传（**不要打进 zip 一起丢在公共地方**，里面有密钥）。

---

## 7. 上传到服务器

### 方式 A：1Panel 文件管理器（最省事）

1Panel → 文件 → 进入 `/www/wwwroot/petgarden/teacher` → 上传 `teacher.zip` → 右键解压 → **确认解压后 `index.html` 直接在该目录下**。
`parent.zip`、`server.zip` 同理。

### 方式 B：scp 命令行

```powershell
# 先在本地把 zip 传到服务器
scp D:\deploy\out\teacher.zip root@服务器IP:/tmp/
scp D:\deploy\out\parent.zip  root@服务器IP:/tmp/
scp D:\deploy\out\server.zip  root@服务器IP:/tmp/
scp D:\deploy\out\.env        root@服务器IP:/tmp/

# 然后登录服务器解压
ssh root@服务器IP
```

服务器上：

```bash
cd /www/wwwroot/petgarden
rm -rf teacher/* parent/* server/*
cd /tmp
unzip -o teacher.zip -d /www/wwwroot/petgarden/teacher/
unzip -o parent.zip  -d /www/wwwroot/petgarden/parent/
unzip -o server.zip  -d /www/wwwroot/petgarden/server/
mv /tmp/.env /www/wwwroot/petgarden/.env && chmod 600 /www/wwwroot/petgarden/.env
```

没有 `unzip` 就装：`apt install -y unzip` / `yum install -y unzip`。

### 方式 C：rsync（Linux/macOS 本地，增量上传最快）

```bash
rsync -av --delete D:/deploy/out/teacher/ root@服务器IP:/www/wwwroot/petgarden/teacher/
rsync -av --delete D:/deploy/out/parent/  root@服务器IP:/www/wwwroot/petgarden/parent/
rsync -av --delete D:/deploy/out/server/  root@服务器IP:/www/wwwroot/petgarden/server/
```

---

## 8. 上传完在服务器上做的收尾

```bash
# 1. 装/更新后端依赖
cd /www/wwwroot/petgarden/server && npm ci --omit=dev

# 2. 重启后端
systemctl restart petgarden
systemctl status petgarden

# 3. 修静态文件权限
chown -R www-data:www-data /www/wwwroot/petgarden/teacher /www/wwwroot/petgarden/parent

# 4. 验证
curl http://127.0.0.1:3002/api/health
curl -I http://teacher.example.com/
curl -I http://parent.example.com/
```

完整的一次性搭建（首次部署）请看 `DEPLOY-PRODUCTION.md`。

---

## 9. 可选：一键打包脚本

如果你嫌每次敲命令麻烦，把下面内容存成 `D:\deploy\build.ps1`，以后双击或在 PowerShell 里 `.\build.ps1` 即可。

```powershell
# ====== 按你的实际情况改这几行 ======
$Repo   = "D:\deploy\chongWu"      # 源码目录
$Out    = "D:\deploy\out"          # 产物输出目录
$WechatPhone = ""                  # VIP 管理员微信/手机，留空则不显示
$WechatQrUrl = ""                  # VIP 收款二维码图片地址，留空则不显示
$ParentApiBase = ""                # 家长端接口基址，留空则用默认 /api
# =====================================

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path "$Out\teacher","$Out\parent","$Out\server" | Out-Null

# ---------- 教师端 ----------
Write-Host ">>> 构建教师端" -ForegroundColor Cyan
Set-Location "$Repo\admin"
$env:VITE_ADMIN_WECHAT_PHONE = $WechatPhone
$env:VITE_WECHAT_PAY_QR_URL  = $WechatQrUrl
npm run build
if ($LASTEXITCODE -ne 0) { throw "教师端构建失败" }
Remove-Item -Recurse -Force "$Out\teacher\*" -ErrorAction SilentlyContinue
Copy-Item "$Repo\admin\dist\*" "$Out\teacher\" -Recurse -Force

# ---------- 家长端 ----------
Write-Host ">>> 构建家长端" -ForegroundColor Cyan
Set-Location "$Repo\nest"
$env:VITE_API_BASE = $ParentApiBase
npm run build
if ($LASTEXITCODE -ne 0) { throw "家长端构建失败" }
Remove-Item -Recurse -Force "$Out\parent\*" -ErrorAction SilentlyContinue
Copy-Item "$Repo\nest\dist\*" "$Out\parent\" -Recurse -Force

# ---------- 后端源码 ----------
Write-Host ">>> 复制后端源码" -ForegroundColor Cyan
Remove-Item -Recurse -Force "$Out\server\*" -ErrorAction SilentlyContinue
robocopy "$Repo\admin\server" "$Out\server" /E /XD node_modules TEST /XF *.log *.db *.db-wal *.db-shm *.err *.out | Out-Null

# ---------- 打包 ----------
Set-Location $Out
Compress-Archive -Path ".\teacher\*" -DestinationPath ".\teacher.zip" -Force
Compress-Archive -Path ".\parent\*"  -DestinationPath ".\parent.zip"  -Force
Compress-Archive -Path ".\server\*"  -DestinationPath ".\server.zip"  -Force

Write-Host "`n完成，产物在 $Out" -ForegroundColor Green
Get-ChildItem "$Out\*.zip" | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,2)}}
```

> 首次运行若提示禁止执行脚本，先执行一次：
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

---

## 10. 在本机把产物跑起来（模拟生产 / Windows 无 OpenResty）

`LOCAL-DEV.md` 是「开三个 dev 服务器边改边看」；这一节是「把已经打包好的 dist 在本机跑起来，模拟服务器上的生产形态」——对应 `D:\workspace\prod` 这种目录。

### 10.1 目录结构

把第 2~4 节打出来的三份产物，按下面结构放好（和 `DEPLOY-PRODUCTION.md` §1.4 一致）：

```
D:\workspace\prod\
├── server\          # 后端（即 out\server 的内容：index.js + node_modules + ...）
├── teacher\         # 教师端 dist 的内容（index.html + assets + pets）
│   └── static-server.mjs   # 教师端静态服务（prod 自带的运行脚本）
├── parent\          # 家长端 dist 的内容
│   └── server.mjs          # 家长端静态服务（prod 自带）
├── data\            # ★ 数据库 pet-garden.db（千万别删，备份就备份它）
└── start.ps1        # 一键启动三个服务
```

> ⚠️ 后端 `server/` 里**不要**放 `dist`：后端进程只跑 API（`index.js` 发现同级没有 `dist/index.html` 就自动不托管前端）。教师端、家长端是各自独立的静态服务。这样就是标准的「1 后端 + 2 前端」三服务，和本文档其它地方、`LOCAL-DEV.md`、`DEPLOY-PRODUCTION.md` 完全一致。

### 10.2 三个服务分别是什么

| 服务 | 端口 | 启动命令 | 干什么 |
|------|------|----------|--------|
| ① 后端 API | 3002 | `node server/index.js` | 纯 API（不托管前端），读写 `data/pet-garden.db` |
| ② 教师端前端 | 3001 | `node teacher/static-server.mjs` | 托管 `teacher/dist` + `/pets` 图片；`/pet-garden/api`（兼容 `/api`）反代到 3002 |
| ③ 家长端前端 | 3003 | `node parent/server.mjs` | 托管 `parent/dist`；`/pets` 反代到教师端 3001，`/api`（兼容 `/pet-garden/api`）反代到后端 3002 |

> 为什么家长端图片要反代到教师端？因为宠物图片（`/pets/xxx/lv1.webp`）只有教师端构建产物里有（见 `PET_IMAGES_GUIDE.md`）。家长端自己没有这些图，必须去教师端拿。三服务下，教师端前端进程（3001）就是图片源。

### 10.3 一键启动 / 停止

```powershell
# 启动（三个进程同时拉起，环境变量在 start.ps1 里注入）
powershell -File D:\workspace\prod\start.ps1

# 停止（按端口杀）
foreach ($p in @(3001,3002,3003)) {
  Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.OwningProcess -ne 0) { Stop-Process -Id $_.OwningProcess -Force }
  }
}
```

### 10.4 访问地址

| 端 | 地址 |
|----|------|
| 教师端 | http://localhost:3001 |
| 家长端 | http://localhost:3003 |
| 后端 API | http://localhost:3002 （根路径 `/` 返回 404 是正常的，它只出不带前端的 API） |

### 10.5 验收

```powershell
(Invoke-WebRequest http://localhost:3002/api/health -UseBasicParsing).Content            # {"status":"ok",...}
(Invoke-WebRequest http://localhost:3001/pet-garden/api/health -UseBasicParsing).Content  # ok（教师端反代到后端）
(Invoke-WebRequest http://localhost:3003/api/health -UseBasicParsing).Content            # ok（家长端反代到后端）
(Invoke-WebRequest http://localhost:3003/pets/bichon/lv1.webp -UseBasicParsing).StatusCode # 200（图片经教师端）
```

浏览器里再确认：教师端能登录建班；家长端打开邀请链接能看到宠物图片（不是裂图）。

### 10.6 和「真·服务器部署」的区别

`DEPLOY-PRODUCTION.md` 里两个前端是 **OpenResty 托管静态 + 反代**，后端只跑 API。本机模拟只是把 OpenResty 换成了两个 Node 静态服务（`teacher/static-server.mjs` / `parent/server.mjs`），**架构完全等价**：都是「1 后端 + 2 前端」，图片源都是教师端。换到 Linux 服务器部署时照 `DEPLOY-PRODUCTION.md` 走 OpenResty 即可，不用这两个 `.mjs`。
