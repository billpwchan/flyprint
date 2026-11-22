# 开源发布与维护

项目首页、社区文件和工作流已经在源码中准备好。GitHub 站点的 About、Topics、Discussions、私密安全报告与保护规则需要仓库所有者在实际公开仓库配置；文件本身不会开启这些功能。

## 发布干净源码

当前工作仓库的旧提交曾包含飞行数据，请使用公开导出并建立新历史：

```bash
npm run verify
npm run export:public -- ../flyprint-public
cd ../flyprint-public
git init
npm ci
npm run verify
```

目标必须是项目之外的新目录。脚本不复制 `.git`，排除私有档案、生成输入、环境文件、原始导入附件、主机专用配置和缓存，并在导出后再次扫描。原工作目录中的私有内容保留不动。

人工检查导出的 Markdown、示例数据、截图、SVG 与第三方素材。确认它们可公开后，在新目录 `git init`，再创建首次提交。你选择的实际仓库地址确定后才添加远端与推送；不要把原仓库的提交历史、构建产物或生产镜像一起上传。

`npm run verify` 无需 GitHub 写入权限。导出目录在尚未 `git init` 时，先用 `node scripts/privacy-check.mjs --directory .` 检查；完整 `verify` 的工作树扫描需处于 Git 仓库中。上面的流程已经先执行 `git init`，暂不提交也可验证未追踪文件。

## GitHub 项目呈现

建议的 About：

> 隐私优先的飞行日志：交互地球、航线回放、年度图鉴与两人同飞页。React · D3 · Canvas · 自托管。

建议 Topics：`flight-journal`、`aviation`、`data-visualization`、`maplibre`、`react`、`typescript`、`self-hosted`、`travel`、`canvas`、`vinext`。

- 将 `docs/assets/social-preview.png` 作为仓库 Social preview。英文 README 以英文界面截图开头，中文 README 保留本地 SVG 封面。
- 若开放在线演示，使用 `build:demo`，验证没有个人输入后再设置 Website。个人档案部署不宜作为项目演示地址。
- 已知仓库 URL 后可以加入真实 Actions 状态徽章；在首次工作流成功前不要用静态「passing」徽章。
- 启用 Issues；按需要开启 Discussions，建立使用问答、改进建议与合成作品分享入口。
- 创建 `bug`、`enhancement`、`question`、`good first issue`、`help wanted` 等标签；表单可以在没有标签配置时正常使用。
- 开启 Private Vulnerability Reporting 和可用的秘密扫描能力，保证安全政策的渠道真实可用。

高 Star 或 Follow 依赖实际价值、可运行体验和持续维护。项目介绍应展示具体能力与实测作品，避免承诺未经验证的规模、性能与使用量。

## CI 与依赖维护

`.github/workflows/ci.yml` 在 PR、push 与手动触发时运行 Node 22/24 的 `npm run verify`。Actions 固定完整提交 SHA，令牌只读、checkout 不持久化凭证、同分支运行取消旧任务。Dependabot 每周提出 npm 与 Actions 更新，补丁/小版本分组，主要版本保持单独评审。[GitHub Actions 安全说明](https://docs.github.com/en/actions/reference/security/secure-use)解释了 SHA 固定与权限控制。

公开仓库首次运行成功后，为默认分支配置评审与 CI 必须通过的保护规则；以实际工作流产生的检查名称为准。不要把线上部署接在未经人工评审的 PR 事件后。

## 发布新版本

1. 使用合成档案运行 `npm run verify` 与相关浏览器流程。
2. 将 `CHANGELOG.md` 中与本次发布有关的条目整理到真实版本。
3. 检查预览素材与文档同步；依赖升级注明兼容变化。
4. 在实际远端创建对应版本的 Tag 与 Release，说明使用变化和验证范围。
5. Release 附件如需提供演示构建，仅使用合成数据；个人部署镜像不作为公共附件。

线上站点的发布另有运维边界，不能由仓库维护流程隐式触发。
