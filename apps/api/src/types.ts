import type { IncomingMessage } from "node:http";

export interface AuthContext {
  companyId: string;
  userId: string;
  username: string;
  departmentId: string | null;
  departmentName: string | null;
  roleCodes: string[];
  token: string;
}

export interface ApiRequest extends IncomingMessage {
  auth?: AuthContext;
  body?: unknown;
}
