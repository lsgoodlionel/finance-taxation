import { useEffect, useState } from "react";
import type { Voucher } from "@finance-taxation/domain-model";
import {
  approveVoucher,
  createVoucherFromTemplate,
  getVoucherDetail,
  listVouchers,
  listVoucherTemplates,
  login,
  postVoucher,
  refreshSession,
  updateVoucher,
  type VoucherDetail,
  type VoucherTemplate,
  validateVoucher
} from "../lib/api";

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

export function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VoucherDetail | null>(null);
  const [validation, setValidation] = useState<{
    valid: boolean;
    totals: { debit: string; credit: string };
    issues: string[];
  } | null>(null);
  const [message, setMessage] = useState("正在准备凭证数据。");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [templates, setTemplates] = useState<VoucherTemplate[]>([]);
  const [templateForm, setTemplateForm] = useState({
    templateKey: "sales",
    amount: "",
    businessEventId: "",
    summary: ""
  });

  useEffect(() => {
    async function bootstrap() {
      try {
        await login("chairman", "123456");
        await refreshSession();
        const [payload, templatePayload] = await Promise.all([
          listVouchers(),
          listVoucherTemplates()
        ]);
        setVouchers(payload.items);
        setTemplates(templatePayload.items);
        const first = payload.items[0]?.id || null;
        setSelectedVoucherId(first);
        if (first) {
          const firstDetail = await getVoucherDetail(first);
          setDetail(firstDetail);
          setSummaryDraft(firstDetail.summary);
          setTemplateForm((current) => ({
            ...current,
            businessEventId: firstDetail.businessEventId
          }));
        }
        setMessage(`已加载 ${payload.total} 个凭证对象和 ${templatePayload.total} 个模板。`);
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, []);

  async function refreshVoucherState(voucherId?: string) {
    const payload = await listVouchers();
    setVouchers(payload.items);
    const targetId = voucherId || selectedVoucherId || payload.items[0]?.id || null;
    setSelectedVoucherId(targetId);
    if (targetId) {
      const nextDetail = await getVoucherDetail(targetId);
      setDetail(nextDetail);
      setSummaryDraft(nextDetail.summary);
      setTemplateForm((current) => ({
        ...current,
        businessEventId: nextDetail.businessEventId
      }));
    }
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={panelStyle()}>
        <h2 style={{ marginTop: 0 }}>凭证中心占位页</h2>
        <p style={{ lineHeight: 1.8 }}>{message}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: "10px", marginTop: "16px" }}>
          <select
            value={templateForm.templateKey}
            onChange={(event) =>
              setTemplateForm((current) => ({ ...current, templateKey: event.target.value }))
            }
          >
            {templates.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            placeholder="关联事项编号"
            value={templateForm.businessEventId}
            onChange={(event) =>
              setTemplateForm((current) => ({ ...current, businessEventId: event.target.value }))
            }
          />
          <input
            placeholder="金额"
            value={templateForm.amount}
            onChange={(event) =>
              setTemplateForm((current) => ({ ...current, amount: event.target.value }))
            }
          />
          <input
            placeholder="摘要（可选）"
            value={templateForm.summary}
            onChange={(event) =>
              setTemplateForm((current) => ({ ...current, summary: event.target.value }))
            }
          />
          <button
            onClick={() =>
              void createVoucherFromTemplate(templateForm)
                .then(async (created) => {
                  await refreshVoucherState(created.id);
                  setMessage(`已按模板 ${templateForm.templateKey} 生成凭证 ${created.id}。`);
                  setTemplateForm((current) => ({ ...current, amount: "", summary: "" }));
                })
                .catch((error) => setMessage((error as Error).message))
            }
          >
            模板生成
          </button>
        </div>
      </article>
      <section style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: "20px" }}>
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>凭证对象</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle()}>编号</th>
                <th style={cellStyle()}>摘要</th>
                <th style={cellStyle()}>状态</th>
                <th style={cellStyle()}>业务事项</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => {
                    setSelectedVoucherId(item.id);
                    setValidation(null);
                    void getVoucherDetail(item.id).then((payload) => {
                      setDetail(payload);
                      setSummaryDraft(payload.summary);
                    });
                  }}
                  style={{
                    cursor: "pointer",
                    background: item.id === selectedVoucherId ? "rgba(30,42,55,0.06)" : "transparent"
                  }}
                >
                  <td style={cellStyle()}>{item.id}</td>
                  <td style={cellStyle()}>{item.summary}</td>
                  <td style={cellStyle()}>{item.status}</td>
                  <td style={cellStyle()}>{item.businessEventId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>凭证详情</h3>
          {detail ? (
            <>
              <p>{detail.summary}</p>
              <p>状态：{detail.status}</p>
              <p>类型：{detail.voucherType}</p>
              <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                <input
                  value={summaryDraft}
                  onChange={(event) => setSummaryDraft(event.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  onClick={() =>
                    void updateVoucher(detail.id, { summary: summaryDraft })
                      .then(async () => {
                        await refreshVoucherState(detail.id);
                        setMessage(`凭证 ${detail.id} 摘要已更新。`);
                      })
                      .catch((error) => setMessage((error as Error).message))
                  }
                >
                  更新摘要
                </button>
              </div>
              <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                <button
                  onClick={() =>
                    void validateVoucher(detail.id).then((result) => {
                      setValidation(result);
                      setMessage(
                        result.valid ? `凭证 ${detail.id} 校验通过。` : `凭证 ${detail.id} 校验未通过。`
                      );
                    })
                  }
                >
                  校验
                </button>
                <button
                  onClick={() =>
                    void approveVoucher(detail.id)
                      .then(async () => {
                        await refreshVoucherState(detail.id);
                        setMessage(`凭证 ${detail.id} 已审核。`);
                      })
                      .catch((error) => setMessage((error as Error).message))
                  }
                >
                  审核
                </button>
                <button
                  onClick={() =>
                    void postVoucher(detail.id)
                      .then(async () => {
                        await refreshVoucherState(detail.id);
                        setMessage(`凭证 ${detail.id} 已过账。`);
                      })
                      .catch((error) => setMessage((error as Error).message))
                  }
                >
                  过账
                </button>
              </div>
              {validation ? (
                <div style={{ marginBottom: "12px" }}>
                  <div>
                    校验结果：{validation.valid ? "通过" : "未通过"}，借方 {validation.totals.debit}，贷方{" "}
                    {validation.totals.credit}
                  </div>
                  {validation.issues.length ? (
                    <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
                      {validation.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <h4>分录</h4>
              <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
                {detail.lines.map((line) => (
                  <li key={line.id}>
                    {line.summary} | {line.accountCode} / {line.accountName} | 借 {line.debit} | 贷{" "}
                    {line.credit}
                  </li>
                ))}
              </ul>
              <h4>过账记录</h4>
              <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
                {detail.postingRecords.map((record) => (
                  <li key={record.id}>
                    {record.postedAt} | {record.postedByName}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>请选择一张凭证。</p>
          )}
        </article>
      </section>
    </section>
  );
}
