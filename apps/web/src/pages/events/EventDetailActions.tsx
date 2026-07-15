import type { BusinessEventStatus } from "@finance-taxation/domain-model";
import { useI18n, EVENT_STATUS_LABELS } from "../../lib/i18n";

const STATUS_OPTION_KEYS: BusinessEventStatus[] = [
  "draft", "awaiting_documents", "awaiting_approval", "analyzed", "blocked"
];

export interface EventDetailActionsProps {
  statusDraft: BusinessEventStatus;
  isBusy: boolean;
  onStatusDraftChange: (status: BusinessEventStatus) => void;
  onAnalyze: () => void;
  onRiskCheck: () => void;
  onStatusUpdate: () => void;
}

export function EventDetailActions({
  statusDraft,
  isBusy,
  onStatusDraftChange,
  onAnalyze,
  onRiskCheck,
  onStatusUpdate
}: EventDetailActionsProps) {
  const { t } = useI18n();
  return (
    <div className="flex-row">
      <select
        className="form-select"
        style={{ width: "auto" }}
        value={statusDraft}
        onChange={(e) => onStatusDraftChange(e.target.value as BusinessEventStatus)}
      >
        {STATUS_OPTION_KEYS.map((s) => <option key={s} value={s}>{t(EVENT_STATUS_LABELS, s)}</option>)}
      </select>
      <button
        className="btn btn-outline btn-sm"
        onClick={onAnalyze}
        disabled={isBusy}
      >
        AI 拆解
      </button>
      <button
        className="btn btn-outline btn-sm"
        onClick={onRiskCheck}
        disabled={isBusy}
      >
        风险检查
      </button>
      <button
        className="btn btn-primary btn-sm"
        onClick={onStatusUpdate}
        disabled={isBusy}
      >
        更新状态
      </button>
    </div>
  );
}
