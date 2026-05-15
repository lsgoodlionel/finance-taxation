import { useEffect, useState } from "react";
import type { TaxFilingBatch, TaxItem } from "@finance-taxation/domain-model";
import {
  getTaxFilingBatchDetail,
  listTaxFilingBatches,
  listTaxItems,
  login,
  refreshSession,
  submitTaxFilingBatch,
  validateTaxFilingBatch
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

export function TaxPage() {
  const [items, setItems] = useState<TaxItem[]>([]);
  const [batches, setBatches] = useState<TaxFilingBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatchDetail, setSelectedBatchDetail] = useState<(TaxFilingBatch & { items: TaxItem[] }) | null>(null);
  const [validation, setValidation] = useState<{ valid: boolean; issues: string[]; itemCount: number } | null>(null);
  const [message, setMessage] = useState("正在准备税务数据。");

  useEffect(() => {
    async function bootstrap() {
      try {
        await login("chairman", "123456");
        await refreshSession();
        const [itemsPayload, batchesPayload] = await Promise.all([
          listTaxItems(),
          listTaxFilingBatches()
        ]);
        setItems(itemsPayload.items);
        setBatches(batchesPayload.items);
        const first = batchesPayload.items[0]?.id || null;
        setSelectedBatchId(first);
        if (first) {
          setSelectedBatchDetail(await getTaxFilingBatchDetail(first));
        }
        setMessage(
          `已加载 ${itemsPayload.total} 条税务事项，${batchesPayload.total} 个申报批次。`
        );
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, []);

  async function refreshBatches(batchId?: string) {
    const batchesPayload = await listTaxFilingBatches();
    setBatches(batchesPayload.items);
    const targetId = batchId || selectedBatchId || batchesPayload.items[0]?.id || null;
    setSelectedBatchId(targetId);
    if (targetId) {
      setSelectedBatchDetail(await getTaxFilingBatchDetail(targetId));
    }
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={panelStyle()}>
        <h2 style={{ marginTop: 0 }}>税务中心占位页</h2>
        <p style={{ lineHeight: 1.8 }}>{message}</p>
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>税务事项</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle()}>编号</th>
              <th style={cellStyle()}>税种</th>
              <th style={cellStyle()}>申报期</th>
              <th style={cellStyle()}>状态</th>
              <th style={cellStyle()}>事项</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={cellStyle()}>{item.id}</td>
                <td style={cellStyle()}>{item.taxType}</td>
                <td style={cellStyle()}>{item.filingPeriod}</td>
                <td style={cellStyle()}>{item.status}</td>
                <td style={cellStyle()}>{item.treatment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
      <section style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "20px" }}>
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>申报批次</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle()}>批次编号</th>
                <th style={cellStyle()}>税种</th>
                <th style={cellStyle()}>状态</th>
                <th style={cellStyle()}>事项数</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => {
                    setSelectedBatchId(item.id);
                    setValidation(null);
                    void getTaxFilingBatchDetail(item.id).then(setSelectedBatchDetail);
                  }}
                  style={{
                    cursor: "pointer",
                    background: item.id === selectedBatchId ? "rgba(30,42,55,0.06)" : "transparent"
                  }}
                >
                  <td style={cellStyle()}>{item.id}</td>
                  <td style={cellStyle()}>{item.taxType}</td>
                  <td style={cellStyle()}>{item.status}</td>
                  <td style={cellStyle()}>{item.itemIds.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>批次详情</h3>
          {selectedBatchDetail ? (
            <>
              <p>税种：{selectedBatchDetail.taxType}</p>
              <p>申报期：{selectedBatchDetail.filingPeriod}</p>
              <p>状态：{selectedBatchDetail.status}</p>
              <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                <button
                  onClick={() =>
                    void validateTaxFilingBatch(selectedBatchDetail.id).then((result) => {
                      setValidation(result);
                      setMessage(
                        result.valid
                          ? `批次 ${selectedBatchDetail.id} 校验通过。`
                          : `批次 ${selectedBatchDetail.id} 校验未通过。`
                      );
                    })
                  }
                >
                  校验批次
                </button>
                <button
                  onClick={() =>
                    void submitTaxFilingBatch(selectedBatchDetail.id)
                      .then(async () => {
                        await refreshBatches(selectedBatchDetail.id);
                        setMessage(`批次 ${selectedBatchDetail.id} 已提交。`);
                      })
                      .catch((error) => setMessage((error as Error).message))
                  }
                >
                  提交批次
                </button>
              </div>
              {validation ? (
                <div style={{ marginBottom: "12px" }}>
                  <div>校验结果：{validation.valid ? "通过" : "未通过"}</div>
                  {validation.issues.length ? (
                    <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
                      {validation.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <h4>批次事项</h4>
              <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
                {selectedBatchDetail.items.map((item) => (
                  <li key={item.id}>
                    {item.taxType} | {item.filingPeriod} | {item.status} | {item.treatment}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>请选择一个申报批次。</p>
          )}
        </article>
      </section>
    </section>
  );
}
