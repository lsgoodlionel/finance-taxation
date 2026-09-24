/**
 * 税收资格的录入区（V17 阶段三批次 A）。
 *
 * 单独一个组件而不是塞进 `CompanyTab`：这几个字段有自己的换算
 * （资产总额界面按元、库里按分）与自己的说明，混在基础信息里
 * 会让那个文件继续膨胀，也让「为什么必须填」这段话没地方放。
 */
import React from "react";
import { FieldRow, inputStyle, SectionHeader } from "./settings-ui";
import { Term } from "../../components/ui/Term";

/** 城建税所在地档位。税率标在选项上——用户是按「我这儿几个点」来选的。 */
const URBAN_TAX_ZONES = [
  { value: "city", label: "市区（7%）" },
  { value: "county", label: "县城、镇（5%）" },
  { value: "other", label: "其他地区（1%）" }
];

export interface TaxQualificationProfile {
  employeeCount: number | null;
  totalAssetsCents: number | null;
  isRestrictedIndustry: boolean;
  highTechCertificateExpiresOn: string | null;
  urbanConstructionTaxZone: string | null;
}

export interface TaxQualificationSectionProps {
  profile: Partial<TaxQualificationProfile>;
  onChange(key: keyof TaxQualificationProfile, value: unknown): void;
}

/**
 * 分转元用于显示。null 渲染成空串——**不能是 0**：
 * 用户看到「0 人」会以为已经登记过了，而那实际上是没登记。
 */
function centsToYuanInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return String(cents / 100);
}

/**
 * 元转分，**换算在这一处做完**。
 *
 * 界面按元、库里按分。如果输入的元值被原样当作分存进去，再按分转元显示，
 * 200 万会变成 2 万——而且每保存一次缩小 100 倍，
 * 用户看着数字越来越小却不知道为什么。
 *
 * 空串保持空串：`Number("") * 100` 是 0，会把「没登记」变成「0 资产」，
 * 恰好落在小微阈值内按 5% 算税。
 */
function yuanInputToCents(value: string): number | "" {
  if (value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : "";
}

function numberInput(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function TaxQualificationSection({ profile, onChange }: TaxQualificationSectionProps) {
  return (
    <>
      <SectionHeader>税收资格</SectionHeader>
      <p className="form-hint" style={{ marginTop: 0, marginBottom: 16 }}>
        决定<Term k="cit">企业所得税</Term>按哪一档算。<strong>不登记就算不出税率</strong>——
        系统会显示「优惠资格待确认」而不是替你按 25% 算。
        这不是谨慎：一家本该按 <strong>5%</strong> 的小型微利企业按{" "}
        <strong>25%</strong> 预缴，多交五倍，而报表上看不出这个数字是猜的。
      </p>

      <FieldRow label="从业人数">
        <input
          name="employeeCount"
          type="number"
          min={0}
          value={numberInput(profile.employeeCount)}
          onChange={(e) => onChange("employeeCount", e.target.value)}
          placeholder="留空表示还没登记"
          style={inputStyle()}
        />
      </FieldRow>

      <FieldRow label="资产总额（元）">
        <input
          name="totalAssetsCents"
          type="number"
          min={0}
          value={centsToYuanInput(profile.totalAssetsCents)}
          onChange={(e) => onChange("totalAssetsCents", yuanInputToCents(e.target.value))}
          placeholder="留空表示还没登记"
          style={inputStyle()}
        />
      </FieldRow>

      <p className="form-hint" style={{ marginTop: -8, marginBottom: 16 }}>
        小型微利企业要同时满足：年应纳税所得额 ≤ 300 万、从业人数 ≤ 300 人、
        资产总额 ≤ 5000 万，且不属于国家限制或禁止行业。
      </p>

      <FieldRow label="限制或禁止行业">
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            name="isRestrictedIndustry"
            type="checkbox"
            checked={Boolean(profile.isRestrictedIndustry)}
            onChange={(e) => onChange("isRestrictedIndustry", e.target.checked)}
          />
          <span>本企业从事国家限制或禁止的行业</span>
        </label>
      </FieldRow>
      <p className="form-hint" style={{ marginTop: -8, marginBottom: 16 }}>
        这一项由你声明，系统不做判定——对应的产业目录没有落进系统。
        勾选后不享受小型微利优惠。
      </p>

      <FieldRow label="高新技术企业资质有效期">
        <input
          name="highTechCertificateExpiresOn"
          type="date"
          value={profile.highTechCertificateExpiresOn ?? ""}
          onChange={(e) => onChange("highTechCertificateExpiresOn", e.target.value)}
          style={inputStyle()}
        />
      </FieldRow>
      <p className="form-hint" style={{ marginTop: -8, marginBottom: 16 }}>
        有资质的按 15% 算。<strong>填有效期止日而不是打个勾</strong>：
        资质会过期，过期后还按 15% 算等于把补税和滞纳金推给以后。
      </p>

      <FieldRow label="城市维护建设税所在地">
        <select
          name="urbanConstructionTaxZone"
          value={profile.urbanConstructionTaxZone ?? ""}
          onChange={(e) => onChange("urbanConstructionTaxZone", e.target.value)}
          style={inputStyle()}
        >
          <option value="">还没登记</option>
          {URBAN_TAX_ZONES.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </select>
      </FieldRow>
      <p className="form-hint" style={{ marginTop: -8 }}>
        城建税按纳税人所在地定档，以实际缴纳的<Term k="vat">增值税</Term>为计税依据。
      </p>
    </>
  );
}
