import React, { type ReactNode } from "react";

export const TEMPLATE_EMPTY_VALUE = "—";
export const TEMPLATE_EMPTY_LIST_TEXT = "无";

export interface TemplateFieldRow {
  label: string;
  value: string;
}

export function normalizeTemplateText(
  value: string | null | undefined,
  fallback = TEMPLATE_EMPTY_VALUE
) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

export function TemplateSection(props: { title: string; children?: ReactNode }) {
  return (
    <section>
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}

export function TemplateKeyValueTable(props: { rows: TemplateFieldRow[] }) {
  return (
    <table>
      <tbody>
        {props.rows.map((row, index) => (
          <tr key={index}>
            <td>{row.label}</td>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TemplateCallout(props: { children?: ReactNode }) {
  return <div className="note">{props.children}</div>;
}

export function TemplateBulletList(props: { items: string[]; emptyText?: string }) {
  const items = props.items.length > 0 ? props.items : [props.emptyText ?? TEMPLATE_EMPTY_LIST_TEXT];

  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
