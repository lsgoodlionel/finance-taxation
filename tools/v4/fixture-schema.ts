const scenarioKinds = [
  "purchase_expense",
  "travel_expense",
  "contract_revenue"
] as const;

export type ScenarioKind = (typeof scenarioKinds)[number];

export interface CompanyFixture {
  id: string;
  name: string;
  parentId?: string;
}

export interface DepartmentFixture {
  id: string;
  companyId: string;
  name: string;
  leaderUserId: string;
}

export interface OrganizationFixture {
  group: CompanyFixture;
  subsidiaries: CompanyFixture[];
  departments: DepartmentFixture[];
}

export interface UserFixture {
  id: string;
  companyId: string;
  departmentId: string;
  username: string;
  displayName: string;
  role: "chairman" | "employee" | "manager" | "accountant" | "cashier" | "tax" | "auditor";
  roleCode: string;
}

export interface ScenarioFixture {
  id: string;
  kind: ScenarioKind;
  input: Record<string, unknown>;
  expected: {
    amount: number;
    documentTypes: string[];
    classification?: string;
    accounting: string;
    tax: string;
    exceptions: string[];
    risks: string[];
    requiresFinalAuthorization: boolean;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} is required`);
  }
}

function requireStringArray(value: unknown, path: string): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  if (value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${path} must contain only non-empty strings`);
  }
}

function validateCompanyFixture(value: unknown, path: string): asserts value is CompanyFixture {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  requireString(value.id, `${path}.id`);
  requireString(value.name, `${path}.name`);
  if (value.parentId !== undefined) {
    requireString(value.parentId, `${path}.parentId`);
  }
}

export function validateOrganizationFixture(
  value: unknown
): asserts value is OrganizationFixture {
  if (!isRecord(value)) {
    throw new Error("organization fixture must be an object");
  }
  validateCompanyFixture(value.group, "organization.group");
  if (!Array.isArray(value.subsidiaries) || value.subsidiaries.length === 0) {
    throw new Error("organization.subsidiaries must be a non-empty array");
  }
  value.subsidiaries.forEach((company, index) =>
    validateCompanyFixture(company, `organization.subsidiaries[${index}]`)
  );
  if (!Array.isArray(value.departments) || value.departments.length === 0) {
    throw new Error("organization.departments must be a non-empty array");
  }
  value.departments.forEach((department, index) => {
    const path = `organization.departments[${index}]`;
    if (!isRecord(department)) {
      throw new Error(`${path} must be an object`);
    }
    requireString(department.id, `${path}.id`);
    requireString(department.companyId, `${path}.companyId`);
    requireString(department.name, `${path}.name`);
    requireString(department.leaderUserId, `${path}.leaderUserId`);
  });
}

export function validateUserFixture(value: unknown): asserts value is UserFixture {
  if (!isRecord(value)) {
    throw new Error("user fixture must be an object");
  }
  requireString(value.id, "user.id");
  requireString(value.companyId, "user.companyId");
  requireString(value.departmentId, "user.departmentId");
  requireString(value.username, "user.username");
  if (!value.username.startsWith("v4_")) {
    throw new Error("user.username must start with v4_");
  }
  requireString(value.displayName, "user.displayName");
  const roles = ["chairman", "employee", "manager", "accountant", "cashier", "tax", "auditor"];
  if (!roles.includes(value.role as string)) {
    throw new Error(`user.role must be one of ${roles.join(", ")}`);
  }
  requireString(value.roleCode, "user.roleCode");
}

export function validateScenarioFixture(value: unknown): asserts value is ScenarioFixture {
  if (!isRecord(value)) {
    throw new Error("fixture must be an object");
  }

  requireString(value.id, "fixture.id");
  if (!scenarioKinds.includes(value.kind as ScenarioKind)) {
    throw new Error(
      `fixture.kind must be one of ${scenarioKinds.join(", ")}`
    );
  }
  if (!isRecord(value.input)) {
    throw new Error("fixture.input must be an object");
  }
  if (!isRecord(value.expected)) {
    throw new Error("fixture.expected must be an object");
  }

  const expected = value.expected;
  if (
    typeof expected.amount !== "number" ||
    !Number.isFinite(expected.amount) ||
    expected.amount <= 0
  ) {
    throw new Error("expected.amount must be a positive number");
  }
  requireStringArray(expected.documentTypes, "expected.documentTypes");
  if (expected.documentTypes.length === 0) {
    throw new Error("expected.documentTypes must contain at least one document type");
  }
  requireString(expected.accounting, "expected.accounting");
  requireString(expected.tax, "expected.tax");
  requireStringArray(expected.exceptions, "expected.exceptions");
  requireStringArray(expected.risks, "expected.risks");
  if (typeof expected.requiresFinalAuthorization !== "boolean") {
    throw new Error("expected.requiresFinalAuthorization must be a boolean");
  }
}
