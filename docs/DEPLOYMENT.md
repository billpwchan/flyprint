# 自托管

构建产物里只有合成示例；每个人的航班保存在服务端的数据目录（SQLite），登录后才能看到。部署需要一个持久化的数据目录，读取截图和 PDF 还需要 Anthropic API 密钥。隐私说明见[隐私模型](PRIVACY.md)。

## Node 服务

```bash
npm ci
npm run build:demo
npm start
```

`npm start` 使用已有构建。航班数据不在构建里，导入、修改和删除都即时生效，不需要重建。

也可以运行独立输出：

```bash
PORT=3000 HOST=127.0.0.1 node dist/standalone/server.js
```

在独立的新服务器目录使用输出时，按构建产物需要安装生产依赖；仓库的 Dockerfile 展示了这种方式。不要直接把 `dist/` 或真实数据镜像作为开源下载发布。

## 数据目录与密钥

| 环境变量 | 作用 |
| --- | --- |
| `FLYPRINT_DATA_DIR` | SQLite 数据库所在目录，默认 `data/app`。容器里挂一个持久卷，例如 `/data` |
| `ANTHROPIC_API_KEY` | 读取截图、PDF 和陌生格式时调用 Claude。没有它时，Flighty 等导出、表格、登机牌和日历照常导入，图片和 PDF 会提示暂时无法识别 |
| `FLYPRINT_ORIGIN` | 站点的公开地址，例如 `https://flyprint.example.com`。公开主页、预览图、站点地图和邮件里的链接都用它；不设时取请求头里的 Host |
| `FLYPRINT_CONTACT` | 隐私政策与使用条款末尾给出的联系邮箱；不设时不显示 |
| `RESEND_API_KEY`、`MAIL_FROM` | 两个都设置（并设置了 `FLYPRINT_ORIGIN`）时开放“忘记密码”，通过 Resend 发信；`MAIL_FROM` 形如 `Flyprint <no-reply@example.com>`，域名需在 Resend 验证 |

数据目录里是数据库文件（含 WAL），备份时复制整个目录，或用 `sqlite3 waypoint.db "VACUUM INTO '…'"` 取一致的副本；只复制 `waypoint.db` 会漏掉还在 WAL 里的写入。服务每天自己在 `backups/` 里留一份副本，保留 7 天。不要把它放进发布目录或镜像。密钥用权限 600 的环境文件交给容器，不写进 Compose 模板、镜像或仓库。

### 第一次启动时建好账户

在数据目录里放一个 `seed.json`，服务第一次打开数据库时会创建其中的账户，从指定的档案文件导入各自的航班，把 `links` 里的两个账户联动，然后删除 `seed.json`（它含密码），留下不含密码的 `seed.log`：

```json
{
  "users": [
    { "email": "a@example.com", "name": "A", "label": "A", "password": "临时密码", "archive": "private-archive.json", "traveller": "B" },
    { "email": "b@example.com", "name": "B", "label": "B", "password": "临时密码", "archive": "private-archive.json", "traveller": "Z" }
  ],
  "links": [["a@example.com", "b@example.com"]]
}
```

`archive` 是数据目录里的文件，格式见[数据契约](DATA_SCHEMA.md)；`traveller` 选出档案里属于这个人的航班。种子只给它自己新建的账户导入航班、建立联动：已经有人注册了的邮箱会被跳过并记在 `seed.log` 里，这样别人无法抢先用你的邮箱注册来拿到种子里的档案。因此种子要在服务第一次启动前放好。导入完成后可以删除档案文件，登录后立即修改临时密码。

## Docker

### 现成镜像

每个 `v*` 标签由 GitHub Actions 构建 amd64 与 arm64 镜像，发布到 `ghcr.io/billpwchan/flyprint`（`latest`、`1`、`1.0` 这样的版本标签）。镜像只含合成示例。仓库根目录的 `compose.yaml` 是单机用法：

```bash
curl -O https://raw.githubusercontent.com/billpwchan/flyprint/main/compose.yaml
docker compose up -d
```

密钥写在同目录、权限 600 的 `.env` 里（`ANTHROPIC_API_KEY=…`），由 `env_file` 读入，不写进 Compose 文件。

### 自己构建

在项目根目录构建源码，再构建应用镜像：

```bash
npm ci
npm run build:demo
# 在共享主机上，标签和服务名必须遵循现有运维规则。
docker build -f deploy/lightsail/Dockerfile -t flyprint:demo .
docker run --rm --name flyprint-demo -p 127.0.0.1:3100:3000 flyprint:demo
```

`.dockerignore` 只放行包清单与独立产物，避免把环境文件和原始档案加入镜像上下文。镜像使用非 root 用户与健康检查，`/data` 归属运行用户。单独运行时挂上数据卷并传入密钥：

```bash
docker run --rm --name flyprint-demo -p 127.0.0.1:3100:3000 \
  -v flyprint-data:/data -e FLYPRINT_DATA_DIR=/data --env-file ./anthropic.env flyprint:demo
```

Compose 模板把根文件系统设为只读，只有数据卷和 `/tmp` 可写，并限制权限、内存与日志；其中的镜像标签、数据卷名、密钥文件路径和网关名称需按自己的环境配置。

数据卷里除了账户库，还有可以重新生成的缓存：`weather.sqlite`（天气）、`imagery.sqlite` 与 `imagery/`（城市卫星图，每座城市一张方图、一张宽图，每张几十到一百多 KB；全站每天最多新拼 1000 张，同时最多 3 张）。删掉它们只会让图和天气重新取一次。上游可以用 `FLYPRINT_IMAGERY_UPSTREAM`（EOX 瓦片）和 `FLYPRINT_GAZETTEER_UPSTREAM`（Open-Meteo 地名库）换成自己的服务。默认的 Sentinel-2 cloudless 2024 影像按 CC BY-NC-SA 4.0 授权，只允许非商业使用；商业部署要换成自己有权使用的影像。

## HTTPS 与 CSP

`deploy/lightsail/Caddyfile.example` 是站点片段模板，请替换域名并通过适合你主机的网关配置安装。应用与代理需要同时传递每次请求的 nonce：代理向应用发送 `X-Nonce` 和 CSP 请求头，响应也必须发出相同的 CSP 策略。不能仅设置内部请求头后假定浏览器受到 CSP 保护。

注册、登录和找回密码按来访网络限次，网络地址取代理追加在 `X-Forwarded-For` 末尾的那一项，所以代理必须追加对端地址（Caddy 默认如此）。站点放在 Cloudflare 代理后面时，这一项是 Cloudflare 的边缘地址，应用改用 `CF-Connecting-IP`；只有末项落在 Cloudflare 公布的地址段内才采信这个请求头，别处发来的一律忽略。地址段写在 `app/lib/server/http.ts`，Cloudflare 更新 [cloudflare.com/ips](https://www.cloudflare.com/ips/) 时同步修改。Cloudflare 侧请关闭 Rocket Loader、Email Obfuscation 和自动注入的 Web Analytics：它们往页面里插脚本，会被 CSP 拦下。

检查 `/`、`/places`、`/log`、`/login`、`/signup`、`/with/sample` 及任意行程、航班、城市页的 HTTP 状态、静态资源、三语首屏与脚本 nonce，`/import` 未登录时应直接打开（试用从这里开始），`/settings` 未登录时应 307 到登录页；旧地址 `/journeys`、`/atlas`、`/insights`、`/flights`、`/together`、`/global`、`/experience`、`/trips`、`/fleet` 应返回 308；`/api/imagery?at=HKG&kind=square` 应返回 JPEG。再在浏览器里登录，验证页面间导航、后退、地球交互、年份、行程和航班的分享卡片和一次导入。不同响应应使用不同 nonce。

## 与其他服务共用一台主机

只重建航迹自己的容器（`docker compose up -d --no-deps <服务名>`），网关只增加本站的站点片段，不替换整份配置；部署前后比对其他服务的容器 ID 没有变化。健康、HTTPS、三语首屏与 nonce 检查通过后再切换版本；清理旧镜像时精确到本站的标签，不做全局 `docker prune`。
