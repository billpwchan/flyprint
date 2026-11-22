# 安全政策

航迹会处理能揭示居住地、旅行习惯与未来活动的飞行档案。私有文件、构建产物与公开网页具有不同的暴露范围，请先读[隐私模型](docs/PRIVACY.md)。

## 支持范围

当前维护开发分支上的最新代码。项目使用 Vinext beta，尚未承诺长期支持版本；旧版本的问题通常需要先在最新代码上复现。

## 私下报告

如果仓库开启了 GitHub Private Vulnerability Reporting，请在 **Security → Advisories → Report a vulnerability** 私下报告。若该入口尚未开启，请使用仓库所有者公开提供的私密联系方式；没有可用渠道时，可开一个只请求私密联系渠道的 Issue，不要包含漏洞细节或敏感内容。

请提供受影响的提交或版本、脱敏复现步骤、可能影响及修复建议。使用合成数据，不附真实航班、身份文件、凭证或服务器访问资料。请不要通过公开 Issue、PR 或评论披露尚未修复的泄露细节。

维护者确认影响后，先修复与验证，再协调披露。项目暂不承诺固定响应时限或漏洞赏金。

## 数据或凭证误提交

立即撤销或轮换相关凭证，限制已暴露的部署访问；删除文件无法消除 Git 历史中的内容。按 [GitHub 的敏感数据清理说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)处理历史，并审查 Fork、缓存与已分发的产物。该操作需要协调协作者，不能用一次普通提交代替。
