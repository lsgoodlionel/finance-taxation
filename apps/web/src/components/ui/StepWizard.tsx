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
      <div className="v3-step-wizard__steps">
        {steps.map((step) => (
          <div key={step.key} className="v3-step-wizard__step" data-active={String(step.key === currentKey)}>
            {step.title}
          </div>
        ))}
      </div>
      <div>{children}</div>
    </section>
  );
}
