import { useEffect, useState } from "react";
import type { LedgerEntry, LedgerPostingBatch } from "@finance-taxation/domain-model";
import {
  getLedgerBalances,
  getLedgerSummary,
  listLedgerEntries,
  listLedgerPostingBatches,
  login,
  refreshSession
} from "../lib/api";

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function tableStyle() {
  return {
    width: "100%",
    borderCollapse: "collapse" as const
  };
}

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const
  };
}

export function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [batches, setBatches] = useState<LedgerPostingBatch[]>([]);
  const [summary, setSummary] = useState<
    Array<{ accountCode: string; accountName: string; debit: string; credit: string }>
  >([]);
  const [balances, setBalances] = useState<
    Array<{ accountCode: string; accountName: string; debit: string; credit: string; balance: string }>
  >([]);
  const [message, setMessage] = useState("正在准备总账数据。");
  const [selectedVoucherId, setSelectedVoucherId] = useState<string>("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");

  useEffect(() => {
    async function bootstrap() {
      try {
        await login("chairman", "123456");
        await refreshSession();
        const [entriesPayload, batchesPayload, summaryPayload, balancesPayload] = await Promise.all([
          listLedgerEntries(),
          listLedgerPostingBatches(),
          getLedgerSummary(),
          getLedgerBalances()
        ]);
        setEntries(entriesPayload.items);
        setBatches(batchesPayload.items);
        setSummary(summaryPayload.items);
        setBalances(balancesPayload.items);
        setMessage(
          `已加载 ${entriesPayload.total} 条总账分录，${batchesPayload.total} 个过账批次，${summaryPayload.total} 个科目汇总。`
        );
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, []);

  async function filterLedger(filters: { voucherId?: string; businessEventId?: string }) {
    const [entriesPayload, batchesPayload] = await Promise.all([
      listLedgerEntries(filters),
      listLedgerPostingBatches(filters.voucherId || undefined)
    ]);
    setEntries(entriesPayload.items);
    setBatches(batchesPayload.items);
    setMessage(
      filters.voucherId || filters.businessEventId
        ? `已按条件过滤，当前 ${entriesPayload.total} 条分录，${batchesPayload.total} 个批次。`
        : `已恢复全部总账数据，当前 ${entriesPayload.total} 条分录，${batchesPayload.total} 个批次。`
    );
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={panelStyle()}>
        <h2 style={{ marginTop: 0 }}>总账占位页</h2>
        <p style={{ lineHeight: 1.8 }}>{message}</p>
        <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
          <input
            value={selectedVoucherId}
            onChange={(event) => setSelectedVoucherId(event.target.value)}
            placeholder="输入凭证编号过滤"
            style={{ flex: 1 }}
          />
          <input
            value={selectedEventId}
            onChange={(event) => setSelectedEventId(event.target.value)}
            placeholder="输入事项编号过滤"
            style={{ flex: 1 }}
          />
          <button
            onClick={() =>
              void filterLedger({
                voucherId: selectedVoucherId || undefined,
                businessEventId: selectedEventId || undefined
              })
            }
          >
            过滤
          </button>
          <button
            onClick={() => {
              setSelectedVoucherId("");
              setSelectedEventId("");
              void filterLedger({});
            }}
          >
            清空
          </button>
        </div>
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>科目汇总</h3>
        <table style={tableStyle()}>
          <thead>
            <tr>
              <th style={cellStyle()}>科目编码</th>
              <th style={cellStyle()}>科目名称</th>
              <th style={cellStyle()}>借方累计</th>
              <th style={cellStyle()}>贷方累计</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((item) => (
              <tr key={`${item.accountCode}-${item.accountName}`}>
                <td style={cellStyle()}>{item.accountCode}</td>
                <td style={cellStyle()}>{item.accountName}</td>
                <td style={cellStyle()}>{item.debit}</td>
                <td style={cellStyle()}>{item.credit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>科目余额</h3>
        <table style={tableStyle()}>
          <thead>
            <tr>
              <th style={cellStyle()}>科目编码</th>
              <th style={cellStyle()}>科目名称</th>
              <th style={cellStyle()}>借方累计</th>
              <th style={cellStyle()}>贷方累计</th>
              <th style={cellStyle()}>余额</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((item) => (
              <tr key={`${item.accountCode}-${item.accountName}-balance`}>
                <td style={cellStyle()}>{item.accountCode}</td>
                <td style={cellStyle()}>{item.accountName}</td>
                <td style={cellStyle()}>{item.debit}</td>
                <td style={cellStyle()}>{item.credit}</td>
                <td style={cellStyle()}>{item.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>过账批次</h3>
        <table style={tableStyle()}>
          <thead>
            <tr>
              <th style={cellStyle()}>批次编号</th>
              <th style={cellStyle()}>凭证</th>
              <th style={cellStyle()}>事项</th>
              <th style={cellStyle()}>分录数</th>
              <th style={cellStyle()}>过账时间</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((item) => (
              <tr key={item.id}>
                <td style={cellStyle()}>{item.id}</td>
                <td style={cellStyle()}>{item.voucherId}</td>
                <td style={cellStyle()}>{item.businessEventId}</td>
                <td style={cellStyle()}>{item.entryIds.length}</td>
                <td style={cellStyle()}>{item.postedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>总账分录</h3>
        <table style={tableStyle()}>
          <thead>
            <tr>
              <th style={cellStyle()}>日期</th>
              <th style={cellStyle()}>摘要</th>
              <th style={cellStyle()}>科目</th>
              <th style={cellStyle()}>借方</th>
              <th style={cellStyle()}>贷方</th>
              <th style={cellStyle()}>来源凭证</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((item) => (
              <tr key={item.id}>
                <td style={cellStyle()}>{item.entryDate}</td>
                <td style={cellStyle()}>{item.summary}</td>
                <td style={cellStyle()}>
                  {item.accountCode} / {item.accountName}
                </td>
                <td style={cellStyle()}>{item.debit}</td>
                <td style={cellStyle()}>{item.credit}</td>
                <td style={cellStyle()}>{item.voucherId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
