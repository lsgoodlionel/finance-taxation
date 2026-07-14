/**
 * F9 入参校验：METHOD+path → 请求体 schema 的聚合映射，在路由注册时合并到 RouteDef
 * 上（见 createAppRouter）。按模块拆分到 schemas/ 下，便于分域维护与评审。
 *
 * 约定：只收录「消费 JSON body」的变更路由；multipart 上传与纯 URL 参数 action 一律
 * 不收录（省略=不校验，避免误拒）。RouteDef 内联的 bodySchema 优先于此映射。
 */

import type { ObjectSchema } from "../utils/validate.js";
import { eventsTasksBodySchemas } from "./schemas/events-tasks.js";
import { vouchersLedgerBodySchemas } from "./schemas/vouchers-ledger.js";
import { taxBodySchemas } from "./schemas/tax.js";
import { payrollBodySchemas } from "./schemas/payroll.js";
import { invoicesBankingBodySchemas } from "./schemas/invoices-banking.js";
import { rndMiscBodySchemas } from "./schemas/rnd-misc.js";
import { aiSettingsBodySchemas } from "./schemas/ai-settings.js";

/** Key 格式：`${method} ${path}`，例如 "POST /api/events"、"PUT /api/events/:id"。 */
export const BODY_SCHEMAS: Record<string, ObjectSchema> = {
  ...eventsTasksBodySchemas,
  ...vouchersLedgerBodySchemas,
  ...taxBodySchemas,
  ...payrollBodySchemas,
  ...invoicesBankingBodySchemas,
  ...rndMiscBodySchemas,
  ...aiSettingsBodySchemas
};
