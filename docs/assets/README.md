# 项目视觉素材

中文 README 的封面 `hero.svg` 是项目原生矢量图，使用 D3 地理数据与航迹的标志（`app/lib/mark.mjs`），航线取自示例旅客的档案，不包含任何人自己的航迹。`social-preview.png` 是面向 GitHub Social preview 的 1280×640 图片：左边是标志与一句话，右边是英文界面选中 2025 年时的地球（欧洲与非洲在白天，晨昏线外是城市灯光）。

`overview.webp`、`years.webp`、`places.webp` 与 `mobile.webp` 来自应用的中文界面，使用 `app/data/flights.example.json` 合成档案（示例旅客 Lin 与 Theo，2017–2027 年共 305 条航段，含还没飞的行程）。桌面截图为 1440×900 的旅程首页、选中 2025 年的旅程首页和足迹页（面板往下滚一屏，露出按窗外天色上色的小时格）；手机截图是 390px 视口、2 倍像素的里斯本旅程（DEMO-265）。机型证据在演示中标为 `typical`，不代表真实执飞。

更新素材前先 `npm run build:demo`，再用 `node dist/standalone/server.js` 启动生产服务。城市卫星图由本地服务向 EOX 现取，第一次打开要等它拼好。拍到卫星图的截图按 CC BY-NC-SA 4.0 授权，署名见 [NOTICE](../../NOTICE)；新增这类截图时把文件名补进 NOTICE 那一段。保持简体中文、未登录访客视角与合成数据；地球按截图那一刻的真实太阳打光，旅程首页用 Playwright 的 `clock.setFixedTime` 把浏览器时钟定在 13:00 UTC，让欧洲与非洲在白天、亚洲在夜里；等地球与航线渲染完成后再截图，检查控制台错误、遮挡、溢出与尺寸。使用 WebP 保持仓库体积克制，避免嵌入大型自动播放 GIF。图片内容需要人工审查，文本隐私扫描无法代替。

英文首页（`README.md`）用同一份合成档案的英文界面：`overview-en.webp`（1440×900 概览）、`trip-en.webp`（DEMO-271 旅程：阿姆斯特丹经迪拜到马累，地球按起飞时的太阳打光）、`footprint-en.webp`（足迹页的小时格）、`card-year-en.webp`（2025 年卡片）与 `card-flight-en.webp`（UA1158 航班卡片）。卡片是应用在浏览器里生成的 JPEG，截取时把 `FLYPRINT_ORIGIN` 设为公开地址，卡片底部才印出正式网址。

`year-film-en.webp` 与 `year-film-zh.webp` 是年度视频：在公开站点以未登录访客打开示例旅客 Lin 的 2023 年卡片，切到「视频」后下载的 MP4，按 15 fps、480×640 用 `img2webp -lossy -q 72` 转成动画 WebP，各约 0.6 MB。卡片底部印的是正式网址。

截图反映当前产品；封面是项目视觉标识，不应当作界面截图。

矢量封面可用 `node scripts/build-readme-hero.mjs` 重新生成。社交预览由英文概览截图与标志在浏览器里排版后截取。
