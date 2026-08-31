/**
 * 印花税与附加税汇总。
 *
 * V17 阶段三批次 B 之前，这里只把税种名含「附加」的税项**筛出来展示**，
 * 一分钱都不算——没人手工建税项，页面就永远是空的。
 * 现在附加税从实缴增值税算出来，筛出来的税项仍然保留（人工登记的那些）。
 */
import type { StampAndSurtaxSummary, TaxItem } from "@finance-taxation/domain-model";
import type { SurtaxResult } from "./surtax.js";

export function buildStampAndSurtaxSummary(
  companyId: string,
  filingPeriod: string,
  taxItems: TaxItem[],
  surtax: SurtaxResult
): StampAndSurtaxSummary {
  const scoped = taxItems.filter((item) => item.filingPeriod === filingPeriod);
  const stampDutyItems = scoped.filter((item) => item.taxType.includes("印花税"));
  const surtaxItems = scoped.filter((item) => item.taxType.includes("附加"));
  return {
    companyId,
    filingPeriod,
    stampDutyItems,
    surtaxItems,
    surtax,
    notes: [
      "印花税需结合合同、产权转移书据、营业账簿等资料复核。",
      // 这句话此前是「需和主税底稿联动检查」——把该系统做的事写成了
      // 给用户的提醒。现在真的算了，说明改成算出来的口径。
      surtax.reason
    ]
  };
}
