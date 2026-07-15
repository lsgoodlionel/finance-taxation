/**
 * 收件箱 · AI 草稿卡片
 * Stage H wave2：draft-then-approve 闭环。
 * 加载待批准的 AI 草稿凭证提案，支持逐条批准/驳回，以及按属期批量生成。
 * 批准仅生成 draft 状态凭证，仍需在凭证中心走既有过账流程。
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, DatePicker, Empty, Space, Spin, Tag, Typography, message } from "antd";
import { RobotOutlined, ThunderboltOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  getCloseDrafts, generateCloseDrafts, approveCloseDraft, rejectCloseDraft, type CloseDraft,
} from "../../lib/api";
import { usePeriod } from "../../lib/period-context";
import { InboxAiDraftItem } from "./InboxAiDraftItem";

const { Text } = Typography;

const MAX_VISIBLE = 4;

type ActingAction = "approve" | "reject";

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function InboxAiDraftsCard() {
  const { period: globalPeriod } = usePeriod();
  const [period, setPeriod] = useState(globalPeriod);
  const [drafts, setDrafts] = useState<CloseDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [acting, setActing] = useState<{ id: string; action: ActingAction } | null>(null);
  const [error, setError] = useState("");
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  useEffect(() => { setPeriod(globalPeriod); }, [globalPeriod]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getCloseDrafts("draft");
      setDrafts(data.items);
    } catch (err) {
      const msg = getErrorMessage(err, "AI 草稿加载失败");
      setError(msg);
      void message.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleGenerate = useCallback(async () => {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      void message.error("请先选择有效的属期（YYYY-MM）");
      return;
    }
    setGenerating(true);
    try {
      const res = await generateCloseDrafts(period);
      void message.success(`已生成 ${res.generated} 条草稿，跳过 ${res.skipped} 条`);
      await load();
    } catch (err) {
      void message.error(getErrorMessage(err, "生成草稿失败"));
    } finally {
      setGenerating(false);
    }
  }, [period, load]);

  const handleApprove = useCallback(async (id: string) => {
    setActing({ id, action: "approve" });
    try {
      await approveCloseDraft(id);
      void message.success("已生成草稿凭证，待过账");
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      void message.error(getErrorMessage(err, "批准草稿失败"));
    } finally {
      setActing(null);
    }
  }, []);

  const handleReject = useCallback(async (id: string) => {
    setActing({ id, action: "reject" });
    try {
      await rejectCloseDraft(id, rejectReasons[id]?.trim() || undefined);
      void message.success("已驳回该草稿");
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      setRejectReasons((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      void message.error(getErrorMessage(err, "驳回草稿失败"));
    } finally {
      setActing(null);
    }
  }, [rejectReasons]);

  const visible = drafts.slice(0, MAX_VISIBLE);

  return (
    <section className="v3-section-shell" data-testid="inbox-ai-drafts">
      <Space style={{ justifyContent: "space-between", width: "100%", flexWrap: "wrap" }}>
        <Space size={8}>
          <Text strong>🤖 AI 草稿</Text>
          {drafts.length > 0 && <Tag color="processing">{drafts.length} 项待批准</Tag>}
        </Space>
        <Space size={8}>
          <DatePicker
            picker="month"
            size="small"
            allowClear={false}
            value={period ? dayjs(`${period}-01`) : null}
            format="YYYY-MM"
            onChange={(d) => { if (d) setPeriod(d.format("YYYY-MM")); }}
            aria-label="AI 草稿生成属期"
          />
          <Button size="small" icon={<ThunderboltOutlined />} loading={generating} onClick={() => void handleGenerate()}>
            生成本期草稿
          </Button>
        </Space>
      </Space>

      <Alert
        type="info"
        showIcon
        banner
        message="AI 仅生成草稿凭证，批准后仍需在凭证中心过账入账"
        style={{ marginTop: 10, borderRadius: 8, fontSize: 12 }}
      />

      {error && <Alert type="error" showIcon message="加载失败" description={error} style={{ marginTop: 10 }} />}

      {loading ? (
        <div style={{ padding: "24px 0", textAlign: "center" }}><Spin /></div>
      ) : drafts.length === 0 ? (
        <Empty
          style={{ margin: "16px 0" }}
          image={<RobotOutlined style={{ fontSize: 32, color: "#94a3b8" }} />}
          description={
            <Space direction="vertical" size={2}>
              <Text>暂无待批准草稿</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                点击「生成本期草稿」让 AI 为未入账事项起草分录。
              </Text>
            </Space>
          }
        />
      ) : (
        <Space direction="vertical" size={10} style={{ width: "100%", marginTop: 10 }}>
          {visible.map((draft) => (
            <InboxAiDraftItem
              key={draft.id}
              draft={draft}
              reason={rejectReasons[draft.id] ?? ""}
              onReasonChange={(value) => setRejectReasons((prev) => ({ ...prev, [draft.id]: value }))}
              acting={acting?.id === draft.id ? acting.action : null}
              onApprove={() => void handleApprove(draft.id)}
              onReject={() => void handleReject(draft.id)}
            />
          ))}
          {drafts.length > MAX_VISIBLE && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              还有 {drafts.length - MAX_VISIBLE} 条待批准草稿，批准/驳回后自动刷新显示。
            </Text>
          )}
        </Space>
      )}
    </section>
  );
}
