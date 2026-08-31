/**
 * 应税行为类别的可选项接口（V17 阶段二）。
 *
 * ## 为什么清单要从服务端来
 *
 * 类别与税率档的对应关系是**政策**。在前端再写一份就有两个真相，
 * 而漂移的表现极其隐蔽：界面上写着 9%，实际按 13% 算，
 * 用户按界面上看到的数字去申报，错了也不知道错在哪。
 *
 * 同理，选项上标的百分比不在这里写死，而是**按今天的日期去 `tax_rates`
 * 取当前生效的那一档**——税率有沿革（13% 曾是 17%、16%），
 * 写死的数字迟早和实际计算对不上。
 */
import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { queryOne } from "../../db/client.js";
import { listTaxRates } from "./tax-rate-store.js";
import { effectiveRateOf, resolveTaxRate } from "./tax-rate.js";
import {
  ALL_TAXABLE_CATEGORIES,
  resolveVatRateCode,
  taxableCategoryLabel
} from "./taxable-category.js";
import { listCompanyTaxpayerProfiles } from "./routes.js";
import { resolveActiveTaxpayerProfile } from "./profile.js";

/** 税率主数据里增值税的 tax_type 值。不是「增值税」——那是给人看的名字。 */
const VAT_TAX_TYPE = "vat";

/**
 * 类别对应的税率说明，如「6%」。
 *
 * 取不到时返回「税率待核对」而不是编一个数——与整个 V17 的口径一致：
 * 说不出就说说不出。
 */
function rateHintOf(
  rateCode: string,
  rates: Awaited<ReturnType<typeof listTaxRates>>,
  on: string
): string {
  const matched = resolveTaxRate(rates, { taxType: VAT_TAX_TYPE, code: rateCode, on });
  if (!matched) return "税率待核对";
  return `${effectiveRateOf(matched)}%`;
}

export async function listTaxableCategoryOptions(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;

  const [company, rates, profiles] = await Promise.all([
    queryOne<{ default_taxable_category: string | null }>(
      `select default_taxable_category from companies where id = $1`,
      [companyId]
    ),
    listTaxRates(companyId, VAT_TAX_TYPE),
    listCompanyTaxpayerProfiles(companyId)
  ]);

  const today = new Date().toISOString().slice(0, 10);

  // 提示里的百分比要跟着**纳税人身份**走，不能一律显示一般计税的档位。
  // 小规模纳税人不管卖什么都按征收率，界面上给他看「销售货物 13%」
  // 与实际计算对不上——用户会照着界面上的数字去核对申报表。
  //
  // 没登记身份时按一般计税档位显示，并把 `taxpayerType: null` 告诉前端，
  // 由它提示「先去登记纳税人身份」——这里不替用户假定身份。
  const taxpayerType = resolveActiveTaxpayerProfile(profiles, today)?.taxpayerType ?? null;

  const options = ALL_TAXABLE_CATEGORIES.map((value) => {
    // 复用判定函数本身，而不是另写一份映射——界面显示的档位与算税走的
    // 是同一条代码路径，才不会漂移。
    const rateCode =
      resolveVatRateCode({ taxpayerType: taxpayerType ?? "general_vat", eventCategory: value }) ??
      "";
    return {
      value,
      label: taxableCategoryLabel(value),
      rateCode,
      rateHint: rateCode ? rateHintOf(rateCode, rates, today) : "税率待核对"
    };
  });

  // 公司没配主营类别时返回 null，**不编一个**——前端据此让用户必须自己选，
  // 而不是替他选一个然后按那个算税。
  json(res, 200, {
    companyDefault: company?.default_taxable_category ?? null,
    taxpayerType,
    options
  });
}
