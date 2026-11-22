# 启动与排错

## 环境

Node.js 至少 22.13，建议 24，npm 与锁文件一起使用。安装与首次字体构建可能需要网络。Node 24 与 Docker 模板保持一致；CI 同时覆盖 22 和 24。

使用 nvm 时可以先执行 `nvm install`、`nvm use`。随后：

```bash
npm ci
npm run dev:demo
```

打开终端输出的地址，通常是 `http://localhost:3000`。未登录时看到合成示例；注册一个账户就能导入自己的航班。数据库是 Node 自带的 SQLite，第一次启动时自动建在 `data/app/`，不需要另外安装。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务 |
| `npm run build` | 生产构建 |
| `npm start` | 服务已有生产产物 |
| `npm run verify` | 全部工程检查 |
| `npm test` | 仓库工具、航司素材审计、生产构建与产品回归（页面与账户、导入） |
| `npm run typecheck` | 检查 TypeScript |
| `npm run lint` | ESLint |
| `npm run docs:check` | 公开 Markdown 的本地链接与锚点 |
| `npm run privacy:check` | 当前可发布文件与敏感指纹 |
| `npm run export:public -- <新目录>` | 导出不含私有输入及 Git 历史的公开源码 |

`predev` 与 `prebuild` 会校验合成示例（设置了 `FLIGHT_DATA_PATH` 时也校验那份档案），并在需要时生成底图分块。

## 导入自己的航班

注册后打开右上角菜单里的“导入航班”，把文件拖进来或粘贴文字：航旅纵横的行程截图（多张、长截图都可以）或电子行程单 PDF，Flighty、Flightradar24、OpenFlights 的导出，Wallet 登机牌，日历，订票邮件，以及任何列名清楚的 Excel 或 CSV。读完会列出找到的航班，标出已在记录里、已取消、尚未出行和需要补充的，核对、修改后再保存；整次导入可以撤销。

截图、PDF 和陌生格式需要 Anthropic API 密钥。在 `.env.local` 中设置：

```dotenv
ANTHROPIC_API_KEY=你的密钥
```

没有密钥时其余格式照常导入。

### 从一份完整档案开始

已经有一份按[数据契约](DATA_SCHEMA.md)整理好的 JSON 档案时，可以在数据目录（默认 `data/app/`）放一个 `seed.json`，让服务第一次打开数据库时建好账户并导入航班，写法见[自托管](DEPLOYMENT.md#第一次启动时建好账户)。导入前可以先校验：

```bash
FLIGHT_DATA_PATH=data/private/my-flights.json node scripts/prepare-data.mjs
```

显式配置的文件不存在或不合法时直接失败，报错只说明字段与行号。

## 先体验这些操作

在面板顶部的时间轴上选一年，或用 ← → 切换，旅程和足迹都会变成那一年的，可以分享成一张图（旅程和航班页也可以）；在“旅程”点开一次旅程，再点开其中一段航班；在“足迹”点一个国家或城市；按 ⌘K 搜索城市、旅程、航班号或年份。悬停或点击地球上的机场和航线也能打开对应页面。顶部可以切换语言，右上角是账户菜单，联动的人和同飞页也在里面。手机上把底部抽屉往下拉，就能看到整个地球。

## 排错

| 现象 | 检查与处理 |
| --- | --- |
| Node 或 Vite 引擎不匹配 | 使用 Node.js 24，重新 `npm ci` |
| 安装或字体构建失败 | 检查 npm 与字体下载网络，保留锁文件，不使用 `npm audit fix --force` 随意换版本 |
| `FLIGHT_DATA_PATH` 无法读取 | 检查 shell、`.env.local` 和 `.env` 的优先级及文件权限 |
| 截图提示暂时无法识别 | 检查 `ANTHROPIC_API_KEY`；也可以改用电子行程单或 App 导出 |
| 导入后航班没出现 | 导入要在核对页点“保存”才写入；设置页的导入记录里可以继续核对 |
| `Invalid flight archive` | 按报错的行号与字段查看[数据契约](DATA_SCHEMA.md)，日志不打印私有记录 |
| 只看到合成航班 | 没有登录，或登录的账户还没有导入航班 |
| 地图没有路线 | 检查机场键与经纬度顺序；地球需要 WebGL |
| 年度导出异常 | 用现代浏览器复现，检查控制台与代理 CSP；提供合成数据复现 |
| 升级 Vinext 后链接或后退异常 | 运行 `npm test`（其中检查 client chunk 的导航导入），再按[导航与滚动](ARCHITECTURE.md#导航与滚动)在真实浏览器验证 |

仍有问题时，按[反馈指南](../SUPPORT.md)提交脱敏信息。
