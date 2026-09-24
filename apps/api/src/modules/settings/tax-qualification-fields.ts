/**
 * 税收资格字段的归一化与校验（V17 阶段三批次 A）。
 *
 * ## 为什么单独一个模块
 *
 * 公司档案其余字段都是字符串直传，这几个不是：有数值、有日期、有枚举，
 * 而且**空串与 0 的区别在这里必须保住**。
 *
 * 从业人数 `null` 是「没登记」，判定层据此报「优惠资格待确认」；
 * `0` 是「确实没有员工」，是一个有效的判定输入。
 *
 * 表单上清空输入框传上来是空串，`Number("")` 得到 **0**——
 * 一家没登记的公司就变成了「0 人 0 资产」，恰好落在小微阈值内，
 * 按 5% 算税。少交的税要补，还有滞纳金。
 */

/** 城建税所在地档位：市区 7% / 县城、镇 5% / 其他 1%。 */
const URBAN_TAX_ZONES = new Set(["city", "county", "other"]);

export type QualificationFieldError = {
  error: string;
  code: "URBAN_TAX_ZONE_INVALID" | "QUALIFICATION_VALUE_INVALID";
};

export type QualificationUpdate = {
  /** 数据库列名 → 值。值为 null 表示清空（回到「没登记」）。 */
  columns: ReadonlyArray<readonly [string, string | number | boolean | null]>;
};

/**
 * 空串、null、undefined 都算「没填」；其余按数值解析。
 *
 * 返回 `undefined` 表示这个字段本次不更新（请求里根本没带它），
 * 与「带了但要清空」（返回 null）是两回事。
 */
function normalizeOptionalNumber(
  value: unknown
): number | null | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : "invalid";
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : "invalid";
  }
  return "invalid";
}

function normalizeOptionalDate(value: unknown): string | null | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : "invalid";
}

/**
 * 把请求体里的税收资格字段转成待写入的列。
 *
 * @returns 出错时返回 `QualificationFieldError`，否则返回要更新的列。
 */
export function buildTaxQualificationUpdate(
  body: Record<string, unknown>
): QualificationUpdate | QualificationFieldError {
  const columns: Array<readonly [string, string | number | boolean | null]> = [];

  const employeeCount = normalizeOptionalNumber(body.employeeCount);
  if (employeeCount === "invalid") {
    return {
      error: "从业人数要填 0 或正整数。留空表示还没登记。",
      code: "QUALIFICATION_VALUE_INVALID"
    };
  }
  if (employeeCount !== undefined) columns.push(["employee_count", employeeCount]);

  const totalAssets = normalizeOptionalNumber(body.totalAssetsCents);
  if (totalAssets === "invalid") {
    return {
      error: "资产总额要填 0 或正数。留空表示还没登记。",
      code: "QUALIFICATION_VALUE_INVALID"
    };
  }
  if (totalAssets !== undefined) columns.push(["total_assets_cents", totalAssets]);

  if (body.isRestrictedIndustry !== undefined) {
    columns.push(["is_restricted_industry", Boolean(body.isRestrictedIndustry)]);
  }

  const expiresOn = normalizeOptionalDate(body.highTechCertificateExpiresOn);
  if (expiresOn === "invalid") {
    return {
      error: "高新资质有效期要填 YYYY-MM-DD 格式的日期。留空表示没有资质。",
      code: "QUALIFICATION_VALUE_INVALID"
    };
  }
  if (expiresOn !== undefined) columns.push(["high_tech_certificate_expires_on", expiresOn]);

  if (body.urbanConstructionTaxZone !== undefined) {
    const zone = body.urbanConstructionTaxZone;
    if (zone === null || zone === "") {
      columns.push(["urban_construction_tax_zone", null]);
    } else if (typeof zone === "string" && URBAN_TAX_ZONES.has(zone)) {
      columns.push(["urban_construction_tax_zone", zone]);
    } else {
      return {
        error: `认不出的城建税所在地「${String(zone)}」。只有市区（city）、县城或镇（county）、其他（other）三档。`,
        code: "URBAN_TAX_ZONE_INVALID"
      };
    }
  }

  return { columns };
}

export function isQualificationFieldError(
  value: QualificationUpdate | QualificationFieldError
): value is QualificationFieldError {
  return "code" in value;
}
