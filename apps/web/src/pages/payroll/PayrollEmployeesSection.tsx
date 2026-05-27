import React, { type ReactNode } from "react";

type PayrollEmployeesSectionProps = {
  toolbar: ReactNode;
  form?: ReactNode;
  list: ReactNode;
};

export function PayrollEmployeesSection({ toolbar, form, list }: PayrollEmployeesSectionProps) {
  return (
    <>
      {toolbar}
      {form}
      {list}
    </>
  );
}
