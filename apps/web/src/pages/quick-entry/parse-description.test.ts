import {
  inferEventTypeFromText,
  mergeParsedFields,
  parseAmountFromText,
  parseCounterpartyFromText,
  parseDateFromText,
  parseDescription,
  parseOcrExtracted
} from "./parse-description";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const TODAY = new Date("2026-07-15T08:00:00.000Z");

// ── 金额提取 ─────────────────────────────────────────────────────────────────
assert(parseAmountFromText("昨天请客户吃饭花了 800") === "800", "expected verb-led amount 800");
assert(parseAmountFromText("交房租 3,500元") === "3500", "expected comma amount 3500");
assert(parseAmountFromText("打车 45.5 块") === "45.5", "expected decimal amount 45.5");
assert(parseAmountFromText("收到合同款 3 万") === "30000", "expected 3 万 to become 30000");
assert(parseAmountFromText("买设备 1.2万元") === "12000", "expected 1.2万元 to become 12000");
assert(parseAmountFromText("今天去见了客户") === null, "expected no amount to return null");
assert(parseAmountFromText("花了 0 元") === null, "expected zero amount to be rejected");

// ── 日期提取 ─────────────────────────────────────────────────────────────────
assert(parseDateFromText("昨天请客户吃饭", TODAY) === "2026-07-14", "expected 昨天 to be yesterday");
assert(parseDateFromText("前天打车报销", TODAY) === "2026-07-13", "expected 前天 to be two days ago");
assert(parseDateFromText("今天交了社保", TODAY) === "2026-07-15", "expected 今天 to be today");
assert(parseDateFromText("3天前买的打印纸", TODAY) === "2026-07-12", "expected 3天前 offset");
assert(parseDateFromText("7月2日出差去上海", TODAY) === "2026-07-02", "expected 月日 with current year");
assert(parseDateFromText("2026年6月30日付款", TODAY) === "2026-06-30", "expected 年月日 format");
assert(parseDateFromText("2026-06-28 收款", TODAY) === "2026-06-28", "expected ISO date passthrough");
assert(parseDateFromText("13月40日", TODAY) === null, "expected invalid month/day to return null");
assert(parseDateFromText("买了点办公用品", TODAY) === null, "expected no date to return null");

// ── 类型推断 ─────────────────────────────────────────────────────────────────
assert(inferEventTypeFromText("请客户吃饭") === "expense", "expected 请客 to infer expense");
assert(inferEventTypeFromText("坐高铁去上海出差") === "travel_expense", "expected 出差 to infer travel");
assert(inferEventTypeFromText("采购一批原材料") === "procurement", "expected 采购 to infer procurement");
assert(inferEventTypeFromText("这个月发工资") === "payroll", "expected 工资 to infer payroll");
assert(inferEventTypeFromText("收到远大公司的合同款") === "contract_revenue", "expected 合同款 revenue");
assert(inferEventTypeFromText("给团队买了台服务器") === "asset", "expected 设备类 to infer asset");
assert(inferEventTypeFromText("发生了一些事") === null, "expected unknown text to return null");

// ── 对方单位提取 ─────────────────────────────────────────────────────────────
assert(
  parseCounterpartyFromText("收到远大公司的合同款") === "远大公司",
  "expected 收到 prefix to be stripped from company name"
);
assert(parseCounterpartyFromText("在全聚德饭店招待客户") === "全聚德饭店", "expected 饭店 suffix");
assert(parseCounterpartyFromText("客户张三还没付款") === "张三", "expected 客户 prefix short capture");
assert(parseCounterpartyFromText("买了点东西") === null, "expected no counterparty to return null");

// ── 整句解析 ─────────────────────────────────────────────────────────────────
const parsed = parseDescription("昨天请客户吃饭花了 800", TODAY);
assert(parsed.type === "expense", "expected sentence to infer expense");
assert(parsed.amount === "800", "expected sentence amount 800");
assert(parsed.occurredOn === "2026-07-14", "expected sentence date yesterday");

// ── OCR 结构化结果映射 ───────────────────────────────────────────────────────
const fromOcr = parseOcrExtracted({
  totalAmount: 1130,
  invoiceDate: "2026-07-01",
  sellerName: "  上海餐饮服务有限公司 "
});
assert(fromOcr.amount === "1130", "expected ocr totalAmount mapping");
assert(fromOcr.occurredOn === "2026-07-01", "expected ocr invoiceDate mapping");
assert(fromOcr.counterparty === "上海餐饮服务有限公司", "expected ocr sellerName trimmed");
assert(fromOcr.type === null, "expected ocr type to stay null");

const fromBadOcr = parseOcrExtracted({ totalAmount: -5, invoiceDate: "2026/07/01", sellerName: " " });
assert(fromBadOcr.amount === null, "expected negative amount rejected");
assert(fromBadOcr.occurredOn === null, "expected malformed date rejected");
assert(fromBadOcr.counterparty === null, "expected blank seller rejected");
assert(parseOcrExtracted(null).amount === null, "expected null extracted to be all-null");

// ── 合并：primary 优先，缺项回落 fallback ────────────────────────────────────
const merged = mergeParsedFields(
  { type: null, amount: "1130", occurredOn: null, counterparty: "甲公司" },
  { type: "expense", amount: "800", occurredOn: "2026-07-14", counterparty: null }
);
assert(merged.amount === "1130", "expected primary amount to win");
assert(merged.type === "expense", "expected fallback type to fill");
assert(merged.occurredOn === "2026-07-14", "expected fallback date to fill");
assert(merged.counterparty === "甲公司", "expected primary counterparty to win");
