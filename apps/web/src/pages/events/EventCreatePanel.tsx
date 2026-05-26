import React from "react";

type EventFormState = {
  type: string;
  title: string;
  description: string;
  department: string;
  occurredOn: string;
  amount: string;
  currency?: string;
  source?: string;
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
  onChange(next: EventFormState): void;
  onSubmit(): void;
};

export function EventCreatePanel({ form, isBusy, isSaving, options, onChange, onSubmit }: EventCreatePanelProps) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">新建经营事项</span>
      </div>
      <div className="card-body">
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
    </div>
  );
}
