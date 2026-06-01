import React from "react";
import type { TaxpayerProfile, TaxRuleProfile } from "@finance-taxation/domain-model";
import { actionButtonStyle, cellStyle, panelStyle } from "./taxStyles";

const TAXPAYER_TYPE_LABELS: Record<TaxProfilePanelProps["profileForm"]["taxpayerType"], string> = {
  general_vat: "一般纳税人",
  small_scale: "小规模纳税人",
  general_simplified: "一般纳税人简易计税"
};

const PROFILE_STATUS_LABELS: Record<string, string> = {
  active: "生效中",
  inactive: "已停用",
  draft: "草稿"
};

const FILING_FREQUENCY_LABELS: Record<string, string> = {
  monthly: "按月申报",
  quarterly: "按季申报",
  yearly: "按年申报"
};

type TaxProfilePanelProps = {
  profiles: TaxpayerProfile[];
  profileForm: {
    taxpayerType: "general_vat" | "small_scale" | "general_simplified";
    effectiveFrom: string;
    notes: string;
  };
  ruleProfile: (TaxRuleProfile & { filingPeriod: string }) | null;
  onProfileFormChange: (updater: (current: TaxProfilePanelProps["profileForm"]) => TaxProfilePanelProps["profileForm"]) => void;
  onCreateProfile: () => void;
  onResolveRuleProfile: () => void;
};

export function TaxProfilePanel({
  profiles,
  profileForm,
  ruleProfile,
  onProfileFormChange,
  onCreateProfile,
  onResolveRuleProfile
}: TaxProfilePanelProps) {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: "20px" }}>
      <article style={panelStyle()}>
        <div style={{ display: "grid", gap: "12px" }}>
          <div>
            <h3 style={{ margin: 0 }}>纳税人口径档案</h3>
            <p style={{ margin: "8px 0 0", color: "#5c6b7a", lineHeight: 1.7 }}>
              先维护当前纳税人口径，再让税率规则与申报频率自动推导当前申报期。
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "10px" }}>
            <select
              value={profileForm.taxpayerType}
              onChange={(event) =>
                onProfileFormChange((current) => ({
                  ...current,
                  taxpayerType: event.target.value as TaxProfilePanelProps["profileForm"]["taxpayerType"]
                }))
              }
            >
              <option value="general_vat">一般纳税人</option>
              <option value="small_scale">小规模纳税人</option>
              <option value="general_simplified">一般纳税人简易计税</option>
            </select>
            <input
              value={profileForm.effectiveFrom}
              onChange={(event) => onProfileFormChange((current) => ({ ...current, effectiveFrom: event.target.value }))}
            />
            <input
              value={profileForm.notes}
              onChange={(event) => onProfileFormChange((current) => ({ ...current, notes: event.target.value }))}
              placeholder="说明"
            />
            <button onClick={onCreateProfile} style={actionButtonStyle("primary")}>保存口径</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle()}>类型</th>
                <th style={cellStyle()}>生效日期</th>
                <th style={cellStyle()}>状态</th>
                <th style={cellStyle()}>说明</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id}>
                  <td style={cellStyle()}>{TAXPAYER_TYPE_LABELS[profile.taxpayerType] ?? profile.taxpayerType}</td>
                  <td style={cellStyle()}>{profile.effectiveFrom}</td>
                  <td style={cellStyle()}>{PROFILE_STATUS_LABELS[profile.status] ?? profile.status}</td>
                  <td style={cellStyle()}>{profile.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      <article style={panelStyle()}>
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
            <div>
              <h3 style={{ margin: 0 }}>税率与期间规则</h3>
              <p style={{ margin: "8px 0 0", color: "#5c6b7a", lineHeight: 1.7 }}>
                通过当前纳税人口径推导税率、申报频率和默认申报期，供后续批次和底稿复核使用。
              </p>
            </div>
            <button onClick={onResolveRuleProfile} style={actionButtonStyle()}>解析增值税规则</button>
          </div>
          {ruleProfile ? (
            <div style={{ display: "grid", gap: "10px", lineHeight: 1.8 }}>
              <div>税种：{ruleProfile.taxType}</div>
              <div>纳税人口径：{TAXPAYER_TYPE_LABELS[ruleProfile.taxpayerType] ?? ruleProfile.taxpayerType}</div>
              <div>申报频率：{FILING_FREQUENCY_LABELS[ruleProfile.filingFrequency] ?? ruleProfile.filingFrequency}</div>
              <div>默认税率：{ruleProfile.defaultRate}%</div>
              <div>推导申报期：{ruleProfile.filingPeriod}</div>
            </div>
          ) : (
            <p style={{ margin: 0, color: "#6c7a89" }}>尚未解析税率和期间规则。</p>
          )}
        </div>
      </article>
    </section>
  );
}
