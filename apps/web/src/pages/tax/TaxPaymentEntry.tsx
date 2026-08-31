/**
 * 税款缴纳记录的录入与列示（V17 阶段三批次 B）。
 *
 * ## 为什么在附加税这一块
 *
 * 附加税以**实际缴纳**的增值税为计税依据。用户在这里看到的是
 * 「本期增值税还没有缴纳记录，等主税缴纳后即可计算」——
 * 该做的事的入口就应该在这句话旁边，而不是让人去别的页面找。
 */
import React, { useState } from "react";
import { createTaxPayment, type TaxPaymentRecord } from "../../lib/api-tax-payments";
import { Term } from "../../components/ui/Term";

/** 分转元。存的是整数分，界面按元。 */
function yuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface TaxPaymentEntryProps {
  /** 当前查询的属期。新登记的缴款默认归到这一期，不让用户重填一遍。 */
  filingPeriod: string;
  payments: TaxPaymentRecord[];
  onCreated(): void;
}

export function TaxPaymentEntry({ filingPeriod, payments, onCreated }: TaxPaymentEntryProps) {
  const [amountYuan, setAmountYuan] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const vatPayments = payments.filter((item) => item.taxType === "vat");
  const totalCents = vatPayments.reduce((sum, item) => sum + item.amountCents, 0);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await createTaxPayment({
        taxType: "vat",
        filingPeriod,
        // 元转分在这一处做完。界面按元、库里按分，两处都换算迟早漂移——
        // V17 阶段三批次 A 在公司档案那边刚犯过这个错。
        amountCents: Math.round(Number(amountYuan) * 100),
        paidOn
      });
      setAmountYuan("");
      setPaidOn("");
      onCreated();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
      <h4 style={{ margin: "0 0 8px" }}>本期<Term k="vat">增值税</Term>缴款登记</h4>
      <p className="form-hint" style={{ marginTop: 0 }}>
        <Term k="surtax">附加税</Term>以<strong>实际缴纳</strong>的<Term k="vat">增值税</Term>
        为计税依据——不是应纳税额。有留抵、有减免、分期缴纳时两者不相等，
        所以要按实际缴款登记。不登记的话附加税算不出来。
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: "#6c7a89" }}>属期 {filingPeriod}</span>
        <input
          name="amountYuan"
          type="number"
          min={0}
          step="0.01"
          value={amountYuan}
          onChange={(e) => setAmountYuan(e.target.value)}
          placeholder="实缴金额（元）"
          style={{ minWidth: 160 }}
        />
        <input
          name="paidOn"
          type="date"
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          style={{ minWidth: 160 }}
        />
        <button
          className="btn btn-primary"
          onClick={() => void save()}
          disabled={saving || !amountYuan || !paidOn}
        >
          {saving ? "登记中…" : "登记缴款"}
        </button>
      </div>

      {message && (
        <div className="alert alert-error" style={{ marginTop: 8 }}>
          {message}
        </div>
      )}

      {vatPayments.length === 0 ? (
        <p style={{ marginTop: 12, color: "#b45309" }}>
          本期还没有缴款记录，<Term k="surtax">附加税</Term>因此算不出来。
        </p>
      ) : (
        <div style={{ marginTop: 12 }}>
          <ul style={{ paddingLeft: 20, margin: "0 0 6px" }}>
            {vatPayments.map((item) => (
              <li key={item.id}>
                {item.paidOn} 缴纳 {yuan(item.amountCents)} 元
                {item.note ? `（${item.note}）` : ""}
              </li>
            ))}
          </ul>
          {/* 分期缴纳时用户要能一眼看到计税依据是多少，不用自己加。 */}
          <strong>本期实缴合计：{yuan(totalCents)} 元</strong>
        </div>
      )}
    </div>
  );
}
