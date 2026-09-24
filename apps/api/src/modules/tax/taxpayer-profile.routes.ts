/**
 * 纳税人档案：建档、查询与生效区间校验（V17 自 tax/routes.ts 拆出）。
 *
 * 这是一个完整的子域——档案的生效区间决定了每一笔业务按什么身份算税，
 * 而 V16 刚修过它「新建作废全部历史档」的缺陷（见迁移 100）。
 * 它和申报批次、底稿、税率主数据混在一个 1100 行的路由文件里，
 * 改它的人看不出它自成一体。
 *
 * 顺带带出 `loadCompanyDefaultCategory`：公司主营的应税行为类别
 * 也是「按什么算税」的一部分，和档案是同一类信息。
 */

import type { ServerResponse } from "node:http";
import type { TaxpayerProfile } from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../types.js";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { listCompanyTaxpayerProfiles, mapTaxpayerProfileRow, toIsoString } from "./routes.js";

/**
 * 公司主营的应税行为类别（V17）。事项没标类别时的兜底。
 *
 * `null` = 没配。此时税目待确认，底稿不给这些税项算税率——不猜。
 */
export async function loadCompanyDefaultCategory(companyId: string): Promise<string | null> {
  const row = await queryOne<{ default_taxable_category: string | null }>(
    `select default_taxable_category from companies where id = $1`,
    [companyId]
  );
  return row?.default_taxable_category ?? null;
}

export async function listTaxpayerProfiles(req: ApiRequest, res: ServerResponse) {
  const items = await listCompanyTaxpayerProfiles(req.auth!.companyId);
  return json(res, 200, { items, total: items.length });
}

export async function createTaxpayerProfile(req: ApiRequest, res: ServerResponse) {
  const body = (req.body || {}) as Partial<TaxpayerProfile>;
  if (!body.taxpayerType || !body.effectiveFrom) {
    return json(res, 400, { error: "taxpayerType and effectiveFrom are required" });
  }
  const now = new Date().toISOString();
  const profile: TaxpayerProfile = {
    id: `taxpayer-${Date.now()}`,
    companyId: req.auth!.companyId,
    taxpayerType: body.taxpayerType,
    effectiveFrom: body.effectiveFrom,
    effectiveTo: body.effectiveTo ?? null,
    status: body.status || "active",
    notes: body.notes || "",
    createdAt: now,
    updatedAt: now
  };
  // ── 生效区间不得重叠（V16）──────────────────────────────────────────────
  //
  // 此前这里无条件把**所有** active 档案改成 inactive，于是纳税人身份的沿革
  // 保存不下来。税务专员实测到的后果更糟：录一条 2030-01-01 生效的小规模登记，
  // 当场把 2026 年那条也改成 inactive，`GET /api/tax/rules?occurredOn=2026-05-01`
  // 立刻变成「Active taxpayer profile not found」——**整个税务模块当期瘫痪**，
  // 而用户只是录了一条未来生效的登记。
  //
  // 读取端 resolveActiveTaxpayerProfile 本来就是按多档沿革设计的
  // （取生效日 ≤ 查询日的最近一条），是写入端和它对不上。
  //
  // 校验口径照搬税率主数据（tax-rate-store.ts）：同一家公司的区间不得重叠，
  // 重叠会让「这一天算什么纳税人」有两个答案，而解析函数只返回一个——
  // 结果取决于排序，静默的不确定性比报错糟糕得多。
  if (profile.status === "active") {
    const overlapping = await query<{ id: string; effective_from: string | Date }>(
      `select id, effective_from from taxpayer_profiles
        where company_id = $1 and status = 'active'
          and effective_from <= coalesce($3::date, 'infinity'::date)
          and coalesce(effective_to, 'infinity'::date) >= $2::date`,
      [profile.companyId, profile.effectiveFrom, profile.effectiveTo ?? null]
    );
    if (overlapping.length > 0) {
      return json(res, 409, {
        error:
          `已有生效区间与此重叠（${overlapping
            .map((row) => (toIsoString(row.effective_from) || "").slice(0, 10))
            .join("、")} 起）。同一家公司在同一天只能是一种纳税人身份——` +
          "请先给上一档填上失效日，再新增。",
        code: "TAXPAYER_PROFILE_OVERLAPS",
        conflictIds: overlapping.map((row) => row.id)
      });
    }
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        insert into taxpayer_profiles (
          id, company_id, taxpayer_type, effective_from, effective_to,
          status, notes, created_at, updated_at
        )
        values ($1,$2,$3,$4,$5::date,$6,$7,$8::timestamptz,$9::timestamptz)
      `,
      [
        profile.id,
        profile.companyId,
        profile.taxpayerType,
        profile.effectiveFrom,
        profile.effectiveTo,
        profile.status,
        profile.notes,
        profile.createdAt,
        profile.updatedAt
      ]
    );
  });
  return json(res, 201, profile);
}
