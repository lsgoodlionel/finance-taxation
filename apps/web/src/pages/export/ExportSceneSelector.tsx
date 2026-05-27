import React from "react";

export type ExportSceneKey =
  | "payroll"
  | "reports"
  | "tax"
  | "packages"
  | "documents"
  | "risk"
  | "rnd"
  | "vouchers";

export type ExportSceneOption = {
  key: ExportSceneKey;
  title: string;
  description: string;
  emoji: string;
};

type ExportSceneSelectorProps = {
  activeScene: ExportSceneKey;
  options: ExportSceneOption[];
  onChange: (key: ExportSceneKey) => void;
};

export function ExportSceneSelector({ activeScene, options, onChange }: ExportSceneSelectorProps) {
  return (
    <section className="v3-scene-grid">
      {options.map((option) => {
        const active = option.key === activeScene;
        return (
          <button
            key={option.key}
            onClick={() => onChange(option.key)}
            className="v3-scene-card"
            data-active={active}
          >
            <span style={{ fontSize: "22px" }}>{option.emoji}</span>
            <strong style={{ fontSize: "14px" }}>{option.title}</strong>
            <span style={{ fontSize: "12px", lineHeight: 1.5, opacity: active ? 0.88 : 0.72 }}>{option.description}</span>
          </button>
        );
      })}
    </section>
  );
}
