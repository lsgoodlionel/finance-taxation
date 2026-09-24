/**
 * 新建经营事项的表单主体。
 *
 * 只负责字段与提交，不带卡片外壳：它现在由 EventCreateModal 装进对话框里，
 * 由列表区的「新建事项」按钮触发。改造前这张表单和事项列表左右并排常驻首屏，
 * 占了 1.2fr 的宽度——而用户此刻要么想登记一笔新的、要么想查已有的某一笔，
 * 不会同时做这两件事。
 */
import React from "react";
import type { Counterparty } from "../../lib/api";
import { Term } from "../../components/ui/Term";

type EventFormState = {
  type: string;
  title: string;
  description: string;
  department: string;
  occurredOn: string;
  amount: string;
  currency?: string;
  counterpartyId?: string;
  source?: string;
  /** 应税行为类别（税目口径）。空串 = 没选。 */
  taxableCategory?: string;
};

/** 服务端给的类别可选项。清单与税率提示都来自服务端，前端不另写一份。 */
type TaxableCategoryOption = {
  value: string;
  label: string;
  rateCode: string;
  rateHint: string;
};

type EventTypeOption = {
  value: string;
  label: string;
};

type EventCreatePanelProps = {
  form: EventFormState;
  isBusy: boolean;
  isSaving: boolean;
  options: EventTypeOption[];
  counterparties: Counterparty[];
  taxableCategories: TaxableCategoryOption[];
  /** 当前生效的纳税人身份；null = 还没登记，税率提示只是按一般计税估的。 */
  taxpayerType: string | null;
  onChange(next: EventFormState): void;
  onSubmit(): void;
};

export function EventCreatePanel({
  form,
  isBusy,
  isSaving,
  options,
  counterparties,
  taxableCategories,
  taxpayerType,
  onChange,
  onSubmit
}: EventCreatePanelProps) {
  return (
    <div>
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="form-group">
            <label className="form-label">类型</label>
            <select
              className="form-select"
              value={form.type}
              onChange={(event) => onChange({ ...form, type: event.target.value })}
            >
              {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">部门</label>
            <input
              className="form-input"
              value={form.department}
              onChange={(event) => onChange({ ...form, department: event.target.value })}
            />
          </div>
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label className="form-label">标题</label>
            <input
              className="form-input"
              value={form.title}
              onChange={(event) => onChange({ ...form, title: event.target.value })}
              placeholder="请输入事项标题"
            />
          </div>
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label className="form-label">描述</label>
            <textarea
              className="form-textarea"
              value={form.description}
              onChange={(event) => onChange({ ...form, description: event.target.value })}
              rows={3}
              placeholder="请输入事项描述"
            />
          </div>
          <div className="form-group">
            <label className="form-label">发生日期</label>
            <input
              className="form-input"
              type="date"
              value={form.occurredOn}
              onChange={(event) => onChange({ ...form, occurredOn: event.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">金额</label>
            <input
              className="form-input"
              value={form.amount}
              onChange={(event) => onChange({ ...form, amount: event.target.value })}
              placeholder="选填"
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">往来单位</label>
          <select
            className="form-input"
            value={form.counterpartyId ?? ""}
            onChange={(event) => onChange({ ...form, counterpartyId: event.target.value })}
          >
            <option value="">
              {counterparties.length === 0 ? "还没有往来单位档案" : "选填 —— 不选则这笔进不了账龄表"}
            </option>
            {counterparties.map((item) => (
              <option key={item.id} value={item.id ?? ""}>
                {item.name}
              </option>
            ))}
          </select>
          <p className="form-hint">
            应收应付类<Term k="account">科目</Term>靠它分户。不填的话这笔只是余额里的
            一个数字，看不出是谁欠的、欠了多久，也没法把收款和欠款对上。
          </p>
        </div>
        <div className="form-group">
          <label className="form-label">应税行为类别</label>
          <select
            className="form-input"
            value={form.taxableCategory ?? ""}
            onChange={(event) => onChange({ ...form, taxableCategory: event.target.value })}
          >
            <option value="">按公司主营类别</option>
            {taxableCategories.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label} · {item.rateHint}
              </option>
            ))}
          </select>
          <p className="form-hint">
            决定这笔按几个点算<Term k="vat">增值税</Term>。既卖货又做服务的公司要
            逐笔选——一笔咨询收入按销售货物算，税会多收一倍还多。公司也没配主营
            类别时，这笔在税务<Term k="working-paper">底稿</Term>上会显示「税目待确认」，
            不进合计、也导不出申报表，而不是默默按某个税率算。
            {taxpayerType === null && (
              <>
                {" "}
                <strong>
                  贵公司还没登记纳税人身份，上面的税率是按一般计税估的，
                  实际按登记后的身份算。
                </strong>
              </>
            )}
          </p>
        </div>
        <div className="mt-16">
          <button
            className="btn btn-primary"
            onClick={onSubmit}
            disabled={isBusy || !form.title.trim()}
          >
            {isSaving ? "创建中…" : "创建事项"}
          </button>
        </div>
    </div>
  );
}
