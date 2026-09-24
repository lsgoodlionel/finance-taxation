/**
 * 以前年度亏损台账的录入与列示（V17 阶段三批次 C）。
 *
 * ## 为什么要能手工录
 *
 * 台账的第一批数据来自**系统上线之前**——企业换系统时，前几年的亏损
 * 还在结转期内。自动生成只能覆盖系统里发生的年度，覆盖不了历史，
 * 而历史那几笔恰恰是最急着用的。
 *
 * 没有这个界面的话，弥补功能对所有新客户都等于不存在。
 */
import React, { useState } from "react";
import { createLossLedgerEntry, type LossLedgerRecord } from "../../lib/api-loss-ledger";

function yuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface LossLedgerEntryProps {
  entries: LossLedgerRecord[];
  /** 当前年度，用来判断哪些台账已经超期。 */
  currentYear: number;
  /** 结转年限：一般企业 5 年，高新技术企业 10 年。 */
  carryforwardYears: number;
  onCreated(): void;
}

export function LossLedgerEntry({
  entries,
  currentYear,
  carryforwardYears,
  onCreated
}: LossLedgerEntryProps) {
  const [lossYear, setLossYear] = useState("");
  const [lossYuan, setLossYuan] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await createLossLedgerEntry({
        lossYear: Number(lossYear),
        // 元转分在这一处做完，与批次 A、B 同一口径。
        lossCents: Math.round(Number(lossYuan) * 100)
      });
      setLossYear("");
      setLossYuan("");
      onCreated();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
      <h4 style={{ margin: "0 0 8px" }}>以前年度亏损台账</h4>
      <p className="form-hint" style={{ marginTop: 0 }}>
        亏损可以在以后 <strong>{carryforwardYears} 年</strong>内弥补，先亏先补。
        没有台账的话，盈利年度的应纳税所得额一分不减，<strong>会多缴税</strong>。
        换系统之前的亏损也要录进来——它们可能还在结转期内。
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          name="lossYear"
          type="number"
          value={lossYear}
          onChange={(e) => setLossYear(e.target.value)}
          placeholder="亏损年度"
          style={{ minWidth: 120 }}
        />
        <input
          name="lossYuan"
          type="number"
          min={0}
          step="0.01"
          value={lossYuan}
          onChange={(e) => setLossYuan(e.target.value)}
          placeholder="亏损额（元）"
          style={{ minWidth: 160 }}
        />
        <button
          className="btn btn-primary"
          onClick={() => void save()}
          disabled={saving || !lossYear || !lossYuan}
        >
          {saving ? "登记中…" : "登记亏损"}
        </button>
      </div>

      {message && (
        <div className="alert alert-error" style={{ marginTop: 8 }}>
          {message}
        </div>
      )}

      {entries.length === 0 ? (
        <p style={{ marginTop: 12, color: "#b45309" }}>
          还没有登记以前年度亏损。有可弥补亏损却不登记的话，本期会多缴税。
        </p>
      ) : (
        <ul style={{ paddingLeft: 20, marginTop: 12 }}>
          {entries.map((item) => {
            // 结转窗口是含第 N 年：2021 年的亏损、5 年结转，2022..2026 都能补。
            const expired = currentYear - item.lossYear > carryforwardYears;
            return (
              <li key={item.id} style={{ color: expired ? "#b45309" : undefined }}>
                {item.lossYear} 年亏损 {yuan(item.lossCents)} 元，已弥补{" "}
                {yuan(item.offsetCents)} 元，剩余可弥补{" "}
                <strong>{yuan(item.remainingCents)} 元</strong>
                {expired && <>（<strong>已超期</strong>，不能再弥补）</>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
