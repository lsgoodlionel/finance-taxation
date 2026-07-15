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

## 飞书 / Lark（自建应用）—— 可实现「企业微信」等价的通知 + 审批

> 可行性：✅ 飞书开放平台自建应用可完全实现企微的通知推送与审批能力。
> - 通知：`POST /open-apis/im/v1/messages`（文本/卡片，receive_id 支持 open_id/user_id/email/chat_id）；
> - 审批：审批 OpenAPI（创建/查询/处理审批实例）；
> - 鉴权：App ID + App Secret → `tenant_access_token`（≤2h，自动刷新）。
> 前提：应用开启「机器人」能力并发布版本；配置 `im:message` 等权限；接收人在应用可用范围内。

| 字段 | 环境变量 | 值（填 .local 版）| 备注 |
|---|---|---|---|
| App ID | `FEISHU_APP_ID` | `<填写>` | 开发者后台 → 凭证与基础信息 |
| App Secret | `FEISHU_APP_SECRET` | `<填写>` | 同上，勿外泄 |
| 默认接收人 | `FEISHU_DEFAULT_RECEIVE_ID` | `<填写>` | open_id / user_id / chat_id（群） |
| 接收人类型 | `FEISHU_RECEIVE_ID_TYPE` | `open_id` | open_id/user_id/email/chat_id |
| 审批定义 code | `FEISHU_APPROVAL_CODE` | `<填写>`（可选）| 用审批流时填 |

> 申请：飞书开放平台 → 创建企业自建应用 → 开启机器人 + 配 im:message 权限 → 发布 → 取 App ID/Secret。

## 畅捷通 开放平台（open.chanjet.com）—— ⚠️ 定位说明：非开票服务商

> **可行性研判：畅捷通开放平台不能替代诺诺的「沙箱开票」能力。**
> - 畅捷通是**会计 SaaS 集成平台**（好会计 / 好业财 / T+Cloud），开放 API 用于把外部业务
>   **同步到其记账产品 / 自动生成凭证**，或做发票**采集/查验**类对接；
> - 它**不是持牌数电票开票服务商**，无诺诺 `sandbox.nuonuocs.cn` 那种「开票沙箱账号 →
>   开具数电票」的接口与测试环境；
> - **数电票开票（issue）仍应走诺诺 / 百望**（本项目 InvoiceProvider 预留槽）。
> 若目标是「把本系统凭证/账务同步到畅捷通好会计」或「从畅捷通拉取发票」，则畅捷通开放平台
> 适用——但这是**记账集成**，与诺诺的开票是两类能力。

| 字段 | 环境变量 | 值（填 .local 版）| 备注 |
|---|---|---|---|
| App Key | `CHANJET_APP_KEY` | `<填写>` | 开发者中心创建应用获取 |
| App Secret | `CHANJET_APP_SECRET` | `<填写>` | 勿外泄 |
| 产品线 | `CHANJET_PRODUCT` | `haccount` | haccount好会计 / zplus好业财 / tcloud T+ |
| 机构/账套 orgId | `CHANJET_ORG_ID` | `<填写>` | 目标账套 |
| 用途 | — | `accounting_sync` | 记账同步/发票采集（**非开票**）|

> 申请：畅捷通开放平台 → 开发者中心 → 创建应用 → 取 appKey/appSecret（有官方 Python SDK）。
> 结论：**开票用诺诺/百望；畅捷通用于会计 SaaS 侧同步，两者不互替。**
