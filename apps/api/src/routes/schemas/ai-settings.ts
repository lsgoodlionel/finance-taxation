/**
 * F9 请求体校验 schema — AI agents / settings / workflows 变更路由。
 *
 * 覆盖范围（仅消费 JSON body 的路由；纯 URL 参数动作省略）：
 *   POST /api/ai/accounting/suggest
 *   POST /api/ai/completeness/assess
 *   POST /api/ai/results/:id/accept
 *   PUT  /api/settings/ai
 *   PUT  /api/settings/company
 *   POST /api/settings/ai/test
 *   PUT  /api/settings/integrations/:type
 *   POST /api/workflows/commands/:id/compensations
 *
 * 省略的路由及依据：
 *   POST /api/ai/audit/review                       — handler 不读取 req.body（仅聚合公司统计数据）
 *   POST /api/settings/integrations/:type/test       — handler 不读取 req.body（用已存配置测试连接）
 *   POST /api/workflows/commands/:id/cancel          — handler 不读取 req.body（仅按 :id 变更状态）
 *   POST /api/workflows/commands/:id/retry           — handler 不读取 req.body（仅按 :id 变更状态）
 *
 * extraConfig（settings/ai、settings/integrations/:type）为顶层以外的嵌套对象，
 * FieldSpec 不支持对象类型，按规范省略，交由 handler 保持现状（JSON.stringify 直传）。
 */

import type { ObjectSchema } from "../../utils/validate.js";

export const aiSettingsBodySchemas: Record<string, ObjectSchema> = {
  "POST /api/ai/accounting/suggest": {
    businessEventId: { type: "string", required: true, min: 1, max: 100 },
  },

  "POST /api/ai/completeness/assess": {
    businessEventId: { type: "string", required: true, min: 1, max: 100 },
  },

  // accepted 有 handler 侧默认值（`body.accepted ?? true`），故不标 required。
  "POST /api/ai/results/:id/accept": {
    accepted: { type: "boolean" },
  },

  // provider 缺失时 handler 直接 400 拒绝；其余字段均为可选的部分更新。
  "PUT /api/settings/ai": {
    provider: { type: "string", required: true, min: 1, max: 50 },
    model: { type: "string", max: 200 },
    apiKey: { type: "string", max: 500 },
    baseUrl: { type: "string", max: 500 },
  },

  "POST /api/settings/ai/test": {
    provider: { type: "string", required: true, min: 1, max: 50 },
    model: { type: "string", max: 200 },
    apiKey: { type: "string", max: 500 },
    baseUrl: { type: "string", max: 500 },
  },

  // 公司信息为部分更新（至少一个字段），handler 未对任一单字段标记必填，故全部可选。
  "PUT /api/settings/company": {
    name: { type: "string", min: 1, max: 200 },
    registeredAddress: { type: "string", max: 500 },
    contactEmail: { type: "string", max: 200 },
    contactPhone: { type: "string", max: 50 },
    creditCode: { type: "string", max: 50 },
    legalRepresentative: { type: "string", max: 100 },
    bankName: { type: "string", max: 200 },
    bankAccount: { type: "string", max: 50 },
    financeApproverRole: { type: "string", max: 100 },
  },

  // provider 缺失时 handler 直接 400 拒绝；apiKey/apiSecret/appId 允许前端传 "****" 占位符保留旧值。
  "PUT /api/settings/integrations/:type": {
    provider: { type: "string", required: true, min: 1, max: 50 },
    apiKey: { type: "string", max: 500 },
    apiSecret: { type: "string", max: 500 },
    appId: { type: "string", max: 500 },
    endpointUrl: { type: "string", max: 500 },
    enabled: { type: "boolean" },
  },

  // reason 缺失时 handler 直接 400 拒绝；其余字段 handler 均以 `?? "" / ?? null` 兜底为可选。
  "POST /api/workflows/commands/:id/compensations": {
    actionType: { type: "string", max: 50 },
    reason: { type: "string", required: true, min: 1, max: 1000 },
    handoffToUserId: { type: "string", max: 100 },
    handoffToName: { type: "string", max: 200 },
    notes: { type: "string", max: 2000 },
  },
};
