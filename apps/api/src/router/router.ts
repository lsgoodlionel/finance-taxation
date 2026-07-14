import type { ServerResponse } from "node:http";
import type { PermissionKey } from "@finance-taxation/domain-model";
import type { ApiRequest } from "../types.js";
import type { ObjectSchema } from "../utils/validate.js";

/**
 * Minimal, dependency-free router for the hand-rolled node:http server.
 *
 * It replaces the long sequential if/else dispatch in app.ts with a declarative
 * route table: each domain registers its routes, and the router resolves method
 * + path (including `:param` segments) in registration order — preserving the
 * original first-match-wins semantics of the if-chain.
 *
 * The router itself is pure matching logic (no auth/DB coupling) so it can be
 * unit-tested in isolation; auth/permission enforcement is applied by the
 * dispatcher around the resolved handler.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RouteParams = Record<string, string>;

/**
 * Permission requirement for a route. A single key requires that permission;
 * `{ anyOf }` passes when the caller holds at least one of the listed keys.
 */
export type RoutePermission = PermissionKey | { anyOf: readonly PermissionKey[] };

export type RouteHandler = (
  req: ApiRequest,
  res: ServerResponse,
  params: RouteParams
) => unknown | Promise<unknown>;

export interface RouteDef {
  method: HttpMethod;
  path: string;
  handler: RouteHandler;
  /** Require an authenticated session before invoking the handler. */
  auth?: boolean;
  /** Require a permission (or any-of a set) after authentication. */
  permission?: RoutePermission;
  /**
   * Optional declarative body validation (F9). When set on a POST/PUT/PATCH
   * route, dispatch validates `req.body` against it and returns 400 before the
   * handler runs. Does not mutate the body — handlers keep reading req.body.
   */
  bodySchema?: ObjectSchema;
  /**
   * F8: streaming/SSE or large-download route. When tenant RLS is enabled these
   * are NOT wrapped in a per-request tenant transaction (a stream cannot hold a
   * transaction connection for its whole duration); such handlers must scope
   * tenant reads themselves via `withTenantContext`.
   */
  streaming?: boolean;
}

export interface RouteMatch {
  route: RouteDef;
  params: RouteParams;
}

interface CompiledRoute {
  route: RouteDef;
  regex: RegExp;
  paramNames: string[];
}

const PARAM_SEGMENT = /^:(.+)$/;

function compile(route: RouteDef): CompiledRoute {
  const paramNames: string[] = [];
  const pattern = route.path
    .split("/")
    .map((segment) => {
      const paramMatch = segment.match(PARAM_SEGMENT);
      if (paramMatch) {
        paramNames.push(paramMatch[1] as string);
        return "([^/]+)"; // a single path segment
      }
      return escapeRegExp(segment);
    })
    .join("/");
  return { route, regex: new RegExp(`^${pattern}$`), paramNames };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export interface Router {
  register(route: RouteDef): void;
  match(method: string, pathname: string): RouteMatch | null;
  routes(): readonly RouteDef[];
}

export function createRouter(): Router {
  const compiled: CompiledRoute[] = [];

  return {
    register(route: RouteDef): void {
      compiled.push(compile(route));
    },
    match(method: string, pathname: string): RouteMatch | null {
      for (const entry of compiled) {
        if (entry.route.method !== method) {
          continue;
        }
        const result = entry.regex.exec(pathname);
        if (!result) {
          continue;
        }
        const params: RouteParams = {};
        entry.paramNames.forEach((name, index) => {
          params[name] = safeDecode(result[index + 1] as string);
        });
        return { route: entry.route, params };
      }
      return null;
    },
    routes(): readonly RouteDef[] {
      return compiled.map((entry) => entry.route);
    }
  };
}
