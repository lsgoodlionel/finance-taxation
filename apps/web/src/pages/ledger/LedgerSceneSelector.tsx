import React from "react";
import type { LedgerSceneKey, LedgerSceneOption } from "./types";

type LedgerSceneSelectorProps = {
  activeScene: LedgerSceneKey;
  options: LedgerSceneOption[];
  onChange: (key: LedgerSceneKey) => void;
};

export function LedgerSceneSelector({ activeScene, options, onChange }: LedgerSceneSelectorProps) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "12px"
      }}
    >
      {options.map((option) => {
        const active = option.key === activeScene;
        return (
          <button
            key={option.key}
            onClick={() => onChange(option.key)}
            style={{
              textAlign: "left",
              padding: "16px",
              borderRadius: "18px",
              border: active ? "1px solid rgba(30,42,55,0.24)" : "1px solid rgba(20,40,60,0.08)",
              background: active ? "rgba(30,42,55,0.92)" : "rgba(255,255,255,0.82)",
              color: active ? "#fff" : "#1e2a37",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }}
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
