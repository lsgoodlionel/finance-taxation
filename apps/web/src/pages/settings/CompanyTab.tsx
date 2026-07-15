import { useEffect, useState } from "react";
import { getCompanyProfile, updateCompanyProfile } from "../../lib/api";
import type { CompanyProfile } from "../../lib/api";
import { panelStyle, SectionHeader, FieldRow, inputStyle } from "./settings-ui";

// ─── Company Tab ──────────────────────────────────────────────────────────────

export function CompanyTab() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [editProfile, setEditProfile] = useState<Partial<CompanyProfile>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getCompanyProfile().then((p) => {
      setProfile(p);
      setEditProfile(p);
    }).catch((e: Error) => setMessage(e.message));
  }, []);

  function updateField(key: keyof CompanyProfile, value: string) {
    setEditProfile((prev) => ({ ...prev, [key]: value }));
  }

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await updateCompanyProfile({
        name: editProfile.name,
        registeredAddress: editProfile.registeredAddress,
        contactEmail: editProfile.contactEmail,
        contactPhone: editProfile.contactPhone,
        creditCode: editProfile.creditCode,
        legalRepresentative: editProfile.legalRepresentative,
        bankName: editProfile.bankName,
        bankAccount: editProfile.bankAccount,
        financeApproverRole: editProfile.financeApproverRole
      });
      setProfile(updated);
      setEditProfile(updated);
      setMessage("公司信息已保存。");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return message
      ? <div className="state-loading" style={{ color: "#dc2626" }}>加载公司信息失败：{message}</div>
      : <div className="state-loading">加载中…</div>;
  }

  return (
    <article style={panelStyle()}>
      <h3 style={{ marginTop: 0, marginBottom: "24px" }}>公司基本信息</h3>

      {message && (
        <div className={`alert ${message.includes("失败") || message.includes("错误") ? "alert-error" : "alert-info"}`} style={{ marginBottom: "16px" }}>
          {message}
        </div>
      )}

      <SectionHeader>基础信息</SectionHeader>
      <FieldRow label="公司 ID">
        <span style={{ color: "#4d5d6c", fontFamily: "monospace", fontSize: "13px" }}>{profile.id}</span>
      </FieldRow>
      <FieldRow label="公司名称">
        <input value={editProfile.name ?? ""} onChange={(e) => updateField("name", e.target.value)} style={inputStyle()} />
      </FieldRow>
      <FieldRow label="统一社会信用代码">
        <input value={editProfile.creditCode ?? ""} onChange={(e) => updateField("creditCode", e.target.value)} placeholder="18 位统一社会信用代码" style={inputStyle()} />
      </FieldRow>
      <FieldRow label="法定代表人">
        <input value={editProfile.legalRepresentative ?? ""} onChange={(e) => updateField("legalRepresentative", e.target.value)} placeholder="法定代表人姓名" style={inputStyle()} />
      </FieldRow>
      <FieldRow label="注册地址">
        <input value={editProfile.registeredAddress ?? ""} onChange={(e) => updateField("registeredAddress", e.target.value)} placeholder="选填" style={inputStyle()} />
      </FieldRow>

      <div style={{ height: "20px" }} />
      <SectionHeader>联系方式</SectionHeader>
      <FieldRow label="联系邮箱">
        <input type="email" value={editProfile.contactEmail ?? ""} onChange={(e) => updateField("contactEmail", e.target.value)} placeholder="选填" style={inputStyle()} />
      </FieldRow>
      <FieldRow label="联系电话">
        <input value={editProfile.contactPhone ?? ""} onChange={(e) => updateField("contactPhone", e.target.value)} placeholder="选填" style={inputStyle()} />
      </FieldRow>

      <div style={{ height: "20px" }} />
      <SectionHeader>银行账户</SectionHeader>
      <FieldRow label="开户银行">
        <input value={editProfile.bankName ?? ""} onChange={(e) => updateField("bankName", e.target.value)} placeholder="例如：招商银行上海分行" style={inputStyle()} />
      </FieldRow>
      <FieldRow label="银行账号">
        <input value={editProfile.bankAccount ?? ""} onChange={(e) => updateField("bankAccount", e.target.value)} placeholder="基本户账号" style={inputStyle()} />
      </FieldRow>

      <div style={{ height: "20px" }} />
      <SectionHeader>财务管理</SectionHeader>
      <FieldRow label="财务负责人角色">
        <div>
          <select
            value={editProfile.financeApproverRole ?? "role-chairman"}
            onChange={(e) => updateField("financeApproverRole", e.target.value)}
            style={{ ...inputStyle(), cursor: "pointer" }}
          >
            <option value="role-chairman">创始人/董事长</option>
            <option value="role-finance-director">财务总监</option>
            <option value="role-accountant">会计</option>
          </select>
          <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#9aa5b4" }}>
            该角色负责审核并最终确认凭证过账。默认为创始人/董事长。
          </p>
        </div>
      </FieldRow>

      <div style={{ marginTop: "24px", display: "flex", alignItems: "center", gap: "16px" }}>
        <button onClick={() => void saveProfile()} disabled={saving} className="btn btn-primary">
          {saving ? "保存中…" : "保存公司信息"}
        </button>
        {profile.updatedAt && (
          <span style={{ fontSize: "12px", color: "#9aa5b4" }}>
            最后更新：{new Date(profile.updatedAt).toLocaleString("zh-CN")}
          </span>
        )}
      </div>
    </article>
  );
}
