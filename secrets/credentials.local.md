# 外部凭证台账（模板）

> 复制为 `secrets/credentials.local.md` 后填写真实值。**本模板不含任何真实凭证。**
> `credentials.local.md` 已被 `.gitignore` 忽略，永不推送。

## 诺诺网 开票 API（nuonuocs.cn）

| 字段 | 环境变量 | 值（填在 .local 版） | 备注 |
|---|---|---|---|
| App Key | `NUONUO_APP_KEY` | `<填写>` | 开放平台应用 Key |
| App Secret | `NUONUO_APP_SECRET` | `<填写>` | 应用密钥，勿外泄 |
| 销方税号 | `NUONUO_TAXPAYER_ID` | `<填写>` | 开票方纳税人识别号 |
| 环境 | `NUONUO_ENV` | `sandbox` / `prod` | 先沙箱 `sandbox.nuonuocs.cn` 验证 |
| 沙箱基址 | `NUONUO_BASE_URL` | `https://sandbox.nuonuocs.cn` | 生产另行替换 |
| 回调地址 | `NUONUO_CALLBACK_URL` | `<填写>` | 开票结果异步通知（可选） |

> 申请：诺诺开放平台注册应用 → 获取 App Key/Secret → 沙箱联调通过后申请生产。

## 企业微信（自建应用）

| 字段 | 环境变量 | 值（填在 .local 版） | 备注 |
|---|---|---|---|
| 企业 ID | `WEWORK_CORP_ID` | `<填写>` | 我的企业 → 企业ID |
| 应用 AgentId | `WEWORK_AGENT_ID` | `<填写>` | 自建应用 AgentId |
| 应用 Secret | `WEWORK_APP_SECRET` | `<填写>` | 自建应用 Secret |
| 通知接收人 | `WEWORK_TO_USER` | `<填写>` | 审批/预警推送目标（可 @all） |
| 可信 IP | — | `<填写>` | 应用后台需配置服务器出口 IP 白名单 |

> 申请：企业微信管理后台 → 应用管理 → 自建 → 创建应用 → 获取 AgentId/Secret。
> 用途：月结完成 / 风险预警 / 审批请求推送（对接 Stage I 的通知能力）。

## （预留）银行直连

| 字段 | 环境变量 | 备注 |
|---|---|---|
| CA 证书路径 | `BANK_CA_CERT_PATH` | 企业 U 盾/证书，线下签约后配置 |
| 银行开放平台 AppId | `BANK_APP_ID` | 各行不同 |
