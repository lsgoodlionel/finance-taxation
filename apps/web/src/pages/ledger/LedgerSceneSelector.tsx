import React from "react";
import type { LedgerSceneKey, LedgerSceneOption } from "./types";

type LedgerSceneSelectorProps = {
  activeScene: LedgerSceneKey;
  options: LedgerSceneOption[];
  onChange: (key: LedgerSceneKey) => void;
};

export function LedgerSceneSelector({ activeScene, options, onChange }: LedgerSceneSelectorProps) {
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
