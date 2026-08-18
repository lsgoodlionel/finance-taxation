/**
 * 费用标准的读写（V13-A1）。
 *
 * 匹配与超标判定是纯函数（`match.ts` / `check.ts`），这里只管取数与落库。
 */

import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../db/client.js";
import type { ExpenseLimitBasis, ExpenseOverPolicy, ExpenseStandard } from "./match.js";

interface StandardDbRow {
  id: string;
  expense_type: string;
  grade_code: string | null;
  city_tier: string | null;
  limit_cents: string;
  limit_basis: ExpenseLimitBasis;
  over_policy: ExpenseOverPolicy;
  effective_from: string | Date;
  effective_to: string | Date | null;
  note: string | null;
}

/**
 * date 列经 pg 驱动可能是 Date 对象也可能是字符串，取决于驱动配置。
 * 统一成 `YYYY-MM-DD`——匹配逻辑靠字典序比较日期，混进 Date 会静默失效
 *（`"2026-06-15" < Date` 的结果不是日期比较）。
 */
function asDateString(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function mapRow(row: StandardDbRow): ExpenseStandard {
  return {
    id: row.id,
    expenseType: row.expense_type,
    gradeCode: row.grade_code,
    cityTier: row.city_tier,
    limitCents: Number(row.limit_cents),
    limitBasis: row.limit_basis,
    overPolicy: row.over_policy,
    effectiveFrom: asDateString(row.effective_from),
    effectiveTo: row.effective_to === null ? null : asDateString(row.effective_to)
  };
}

const COLUMNS = `
  id, expense_type, grade_code, city_tier, limit_cents,
  limit_basis, over_policy, effective_from, effective_to, note
`;

export async function listExpenseStandards(
  companyId: string,
  expenseType?: string
): Promise<ExpenseStandard[]> {
  const rows = expenseType
    ? await query<StandardDbRow>(
        `select ${COLUMNS} from expense_standards
          where company_id = $1 and expense_type = $2
          order by expense_type, effective_from desc`,
        [companyId, expenseType]
      )
    : await query<StandardDbRow>(
        `select ${COLUMNS} from expense_standards
          where company_id = $1
          order by expense_type, effective_from desc`,
        [companyId]
      );
  return rows.map(mapRow);
}

export interface CreateStandardInput {
  companyId: string;
  expenseType: string;
  gradeCode: string | null;
  cityTier: string | null;
  limitCents: number;
  limitBasis: ExpenseLimitBasis;
  overPolicy: ExpenseOverPolicy;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
}

export type StandardFailureCode =
  | "STANDARD_AMOUNT_INVALID"
  | "STANDARD_DATE_INVALID"
  | "STANDARD_OVERLAP"
  | "STANDARD_NOT_FOUND";

export type StandardResult =
  | { ok: true; standard: ExpenseStandard }
  | { ok: false; failure: { code: StandardFailureCode; message: string } };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 两个闭区间是否重叠。`null` 的止日视为无穷远。 */
function rangesOverlap(
  aFrom: string,
  aTo: string | null,
  bFrom: string,
  bTo: string | null
): boolean {
  if (aTo !== null && bFrom > aTo) return false;
  if (bTo !== null && aFrom > bTo) return false;
  return true;
}

export async function createExpenseStandard(input: CreateStandardInput): Promise<StandardResult> {
  if (!Number.isInteger(input.limitCents) || input.limitCents < 0) {
    return {
      ok: false,
      failure: { code: "STANDARD_AMOUNT_INVALID", message: "限额必须是非负整数分" }
    };
  }
  if (!DATE_PATTERN.test(input.effectiveFrom)) {
    return {
      ok: false,
      failure: { code: "STANDARD_DATE_INVALID", message: "生效起日应形如 2026-01-01" }
    };
  }
  if (input.effectiveTo !== null && !DATE_PATTERN.test(input.effectiveTo)) {
    return {
      ok: false,
      failure: { code: "STANDARD_DATE_INVALID", message: "生效止日应形如 2026-12-31" }
    };
  }
  if (input.effectiveTo !== null && input.effectiveTo < input.effectiveFrom) {
    return {
      ok: false,
      failure: { code: "STANDARD_DATE_INVALID", message: "生效止日不能早于起日" }
    };
  }

  // 同维度且生效期重叠的重复配置在这里挡掉。
  //
  // **为什么在应用层而不是数据库约束**：区间重叠的唯一性需要 btree_gist 扩展
  // 才能用排他约束表达，而那要求部署环境装扩展。配重了不会算错（match.ts 的
  // id 决胜规则保证结果确定），只是可能不是用户想要的那条，所以在写入口拦住
  // 就够——这是可用性问题，不是正确性问题。
  const existing = await listExpenseStandards(input.companyId, input.expenseType);
  const clash = existing.find(
    (item) =>
      item.gradeCode === input.gradeCode &&
      item.cityTier === input.cityTier &&
      rangesOverlap(item.effectiveFrom, item.effectiveTo, input.effectiveFrom, input.effectiveTo)
  );
  if (clash) {
    return {
      ok: false,
      failure: {
        code: "STANDARD_OVERLAP",
        message:
          `已有一条相同维度的标准（${clash.effectiveFrom} 起）与本次生效期重叠。` +
          `请先给那一条设置止日，再新增新标准。`
      }
    };
  }

  const row = await queryOne<StandardDbRow>(
    `insert into expense_standards
       (id, company_id, expense_type, grade_code, city_tier, limit_cents,
        limit_basis, over_policy, effective_from, effective_to, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning ${COLUMNS}`,
    [
      `es-${randomUUID()}`,
      input.companyId,
      input.expenseType,
      input.gradeCode,
      input.cityTier,
      input.limitCents,
      input.limitBasis,
      input.overPolicy,
      input.effectiveFrom,
      input.effectiveTo,
      input.note
    ]
  );
  return { ok: true, standard: mapRow(row!) };
}

/**
 * 给标准设置止日（停用）。
 *
 * **不提供删除**：历史单据是按当时的标准判定的，删掉标准会让「这笔当年为什么
 * 判为合规」永远答不上来。停用保留了这段历史。
 */
export async function expireExpenseStandard(
  companyId: string,
  id: string,
  effectiveTo: string
): Promise<StandardResult> {
  if (!DATE_PATTERN.test(effectiveTo)) {
    return {
      ok: false,
      failure: { code: "STANDARD_DATE_INVALID", message: "止日应形如 2026-12-31" }
    };
  }

  const row = await queryOne<StandardDbRow>(
    `update expense_standards
        set effective_to = $3, updated_at = now()
      where company_id = $1 and id = $2 and effective_from <= $3
      returning ${COLUMNS}`,
    [companyId, id, effectiveTo]
  );

  if (!row) {
    // 找不到有两种可能：标准不存在，或止日早于起日（被 where 挡掉）。
    // 后者不单独区分——两种情形用户的下一步动作都是「回去看一眼那条标准」。
    return {
      ok: false,
      failure: { code: "STANDARD_NOT_FOUND", message: "标准不存在，或止日早于其生效起日" }
    };
  }
  return { ok: true, standard: mapRow(row) };
}
