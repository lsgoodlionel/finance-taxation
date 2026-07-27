import React, { type ReactNode } from "react";

type Step = {
  key: string;
  title: string;
};

type StepWizardProps = {
  steps: Step[];
  currentKey: string;
  children: ReactNode;
};

export function StepWizard({ steps, currentKey, children }: StepWizardProps) {
  return (
    <section className="v3-step-wizard">
      <div className="v3-step-wizard__steps" role="list" aria-label="当前进度">
        {steps.map((step) => {
          const isActive = step.key === currentKey;
          return (
            <div
              key={step.key}
              role="listitem"
              className="v3-step-wizard__step"
              data-active={String(isActive)}
              aria-current={isActive ? "step" : undefined}
            >
              {step.title}
            </div>
          );
        })}
      </div>
      <div>{children}</div>
    </section>
  );
}
