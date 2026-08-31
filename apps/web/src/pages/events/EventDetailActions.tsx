import React from "react";
import type { BusinessEventStatus } from "@finance-taxation/domain-model";
import { useI18n, EVENT_STATUS_LABELS } from "../../lib/i18n";
import type { TaxableCategoryOption } from "../../lib/api-events";

const STATUS_OPTION_KEYS: BusinessEventStatus[] = [
  "draft", "awaiting_documents", "awaiting_approval", "analyzed", "blocked"
];

export interface EventDetailActionsProps {
  statusDraft: BusinessEventStatus;
  isBusy: boolean;
  /** 可选的应税行为类别。为空表示清单没拉到，此时不渲染改正入口。 */
  taxableCategories: TaxableCategoryOption[];
  /** 当前选中的类别；空串 = 按公司主营类别。 */
  categoryDraft: string;
  onCategoryDraftChange: (category: string) => void;
  onCategoryUpdate: () => void;
  onStatusDraftChange: (status: BusinessEventStatus) => void;
  onAnalyze: () => void;
  onRiskCheck: () => void;
  onStatusUpdate: () => void;
}

export function EventDetailActions({
  statusDraft,
  isBusy,
  taxableCategories,
  categoryDraft,
  onCategoryDraftChange,
  onCategoryUpdate,
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
      {/*
        改正入口。只在建的时候能选等于假设用户不会选错——而事项建好之后
        可能已经派生了税项与凭证，重建的代价远大于改一个字段，
        用户的实际做法会是将错就错，那笔业务就一直按错的税率算下去。

        清单没拉到时整块不渲染：给一个空选择器看起来像「没有类别可选」，
        那是误导。
      */}
      {taxableCategories.length > 0 && (
        <>
          <select
            className="form-select"
            style={{ width: "auto" }}
            aria-label="应税行为类别"
            value={categoryDraft}
            onChange={(e) => onCategoryDraftChange(e.target.value)}
          >
            <option value="">按公司主营类别</option>
            {taxableCategories.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label} · {item.rateHint}
              </option>
            ))}
          </select>
          <button
            className="btn btn-outline btn-sm"
            onClick={onCategoryUpdate}
            disabled={isBusy}
          >
            更新税目
          </button>
        </>
      )}
    </div>
  );
}
