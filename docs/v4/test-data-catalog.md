# V4 验收测试数据目录

> 警告：本目录数据、账号和密码仅可用于名称包含 `test` 的隔离数据库。禁止连接生产、预生产或任何包含真实数据的环境。

统一测试密码：`V4-test-123456`。当前应用登录逻辑与既有 seed 一致，直接比较 `user_passwords.password_hash` 字段；该格式仅用于隔离验收环境。

## 固定组织与账号

- 集团：`cmp-v4-group`
- 子公司：`cmp-v4-tech`、`cmp-v4-service`
- `companies.json` 中子公司的 `parentId` 仅作为夹具元数据保留，供未来层级覆盖使用；当前种子流程不会把它持久化到现有 `companies` 表结构。
- 部门：`dept-v4-chairman`、`dept-v4-sales`、`dept-v4-finance`、`dept-v4-hr`
- 用户：`usr-v4-chairman`、`usr-v4-employee`、`usr-v4-manager`、`usr-v4-accountant`、`usr-v4-cashier`、`usr-v4-tax`、`usr-v4-auditor`
- 登录名：依次为 `v4_chairman`、`v4_employee`、`v4_manager`、`v4_accountant`、`v4_cashier`、`v4_tax`、`v4_auditor`

## 采购费用

| Fixture ID | 业务目的 | 输入资料 | 预期对象 | 会计与税务结果 | 异常/风险 |
| --- | --- | --- | --- | --- | --- |
| `PUR-STD-001` | 验证标准低值采购报销 | 报销单、发票包 | 采购经营事项、2 个单据映射、进项税映射 | 低值易耗品入账；合规专票在 2026-04 抵扣 | 无；无需最终授权 |
| `PUR-MISSING-001` | 验证采购缺票拦截 | 仅报销单 | 待复核经营事项、缺失发票映射 | 暂不生成正式凭证；不得抵扣，所得税扣除待核验 | `missing_invoice_bundle`；税前扣除证据不足 |
| `PUR-DUP-001` | 验证同一发票重复报销 | 报销单、重复发票包 | 重复标记经营事项，不应新增正式凭证 | 阻止重复入账及重复抵扣 | `duplicate_invoice`；重复报销风险 |
| `PUR-CLASS-001` | 验证高价值设备分类冲突 | 采购申请、发票包、验收单 | 待授权经营事项、3 个单据映射 | 改按固定资产入账折旧；进项税按规定抵扣 | `classification_conflict`；费用高估；需最终授权 |

## 差旅费用

| Fixture ID | 业务目的 | 输入资料 | 预期对象 | 会计与税务结果 | 异常/风险 |
| --- | --- | --- | --- | --- | --- |
| `TRV-STD-001` | 验证标准客户拜访差旅 | 出差申请、报销单、交通及住宿发票 | 差旅经营事项、4 个单据映射、进项税映射 | 销售费用及可抵扣进项税入账；合规税前扣除 | 无；无需最终授权 |
| `TRV-MISSING-001` | 验证住宿票据缺失 | 出差申请、报销单、交通发票 | 待复核经营事项、缺失住宿发票映射 | 住宿部分暂缓入账和抵扣 | `missing_hotel_invoice`；差旅成本证据不足 |
| `TRV-DUP-001` | 验证同一行程重复报销 | 完整差旅资料，指向 `TRV-STD-001` | 重复标记经营事项 | 保持原凭证不变，阻止重复抵扣 | `duplicate_trip_claim`；重复报销风险 |
| `TRV-TIME-001` | 验证跨月差旅截止性 | 跨 4 月和 5 月的完整差旅资料 | 待授权经营事项、跨期税务映射 | 会计费用按权责发生制拆期；税务按认证及归属规则核验 | `accounting_period_conflict`；截止性错报；需最终授权 |

## 合同收入

| Fixture ID | 业务目的 | 输入资料 | 预期对象 | 会计与税务结果 | 异常/风险 |
| --- | --- | --- | --- | --- | --- |
| `CON-STD-001` | 验证已验收咨询服务收入 | 服务合同、验收单、销项发票 | 合同、收入经营事项、3 个单据映射、销项税映射 | 确认主营业务收入和应收账款；2026-04 确认销项税和所得税收入 | 无；需最终授权 |
| `CON-MISSING-001` | 验证缺少验收单的收入确认 | 服务合同、销项发票 | 合同、待复核经营事项、缺失验收单映射 | 会计暂不确认收入；已开票增值税义务与所得税时点分别核验 | `missing_acceptance_record`；提前确认收入；需最终授权 |
| `CON-DUP-001` | 验证合同重复导入 | 与 `CON-STD-001` 相同合同号及资料 | 复用 `CON-STD-001` 的标准合同记录，仅新增重复经营事项 | 阻止重复确认收入、应收账款及销项税 | `duplicate_contract`；收入高估；需最终授权 |
| `CON-TIME-001` | 验证跨年度订阅收入时点 | 服务合同、开票计划、销项发票 | 合同、待复核经营事项、分期税务映射 | 合同负债按 12 个月结转；增值税与所得税按各自规则核验 | `revenue_timing_conflict`；提前确认和税会差异；需最终授权 |

## 播种对象

`npm run v4:test:seed` 会读取并验证上述 JSON，在单一事务内幂等写入公司、部门、应用兼容角色、用户、密码、用户角色、合同、`business_events`、`event_document_mappings` 与 `event_tax_mappings`。`business_events.department` 和 `event_document_mappings.owner_department` 会将夹具中的 `departmentId` 解析为部门名称后落库；重复合同场景会复用既有标准合同记录而不会再插入第二条同号合同。所有对象使用固定 ID 和 `ON CONFLICT DO UPDATE`；任一写入失败时整批回滚。
