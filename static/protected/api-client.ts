/**
 * api-client.ts
 *
 * Usage:
 *   const api = createApiClient({ baseUrl: "https://api.example.com" })
 *
 *   const res = await api.get("/api/advertisement", { query: { page: 1 } })
 *   if (res.ok) res.data // fully typed
 *
 *   const res = await api.get("/api/advertisement/:id", { params: { id: 1 } })
 *   const res = await api.post("/api/advertisement", { body: { ... } })
 *   const res = await api.patch("/api/advertisement/:id", { params: { id: 1 }, body: { title: "x" } })
 *   const res = await api.delete("/api/advertisement/:id", { params: { id: 1 } })
 */

import type { ApiRoutes } from "./contract";

// ─── Primitives ───────────────────────────────────────────────────────────────

type Methods = "get" | "post" | "put" | "patch" | "delete";
type AllPaths = ApiRoutes["path"];

/** Paths that have at least one route for a given method */
type PathsFor<M extends Methods> = Extract<ApiRoutes, { method: M }>["path"];

/** Full route interface for a concrete method + path */
type RouteFor<M extends Methods, P extends AllPaths> = Extract<
  ApiRoutes,
  { method: M; path: P }
>;

type NeverRecord = Record<string, never>;
type Flatten<T> = { [K in keyof T]: T[K] } & {};

// ─── Options builder ──────────────────────────────────────────────────────────
// Produces exactly the keys the route needs — no extras, no missing.
// Routes with nothing to pass yield `{}` so the arg can be omitted.

type OptsFor<M extends Methods, P extends PathsFor<M>> =
  RouteFor<M, P & AllPaths> extends {
    body: infer B;
    query: infer Q;
    params: infer Pm;
  }
    ? Flatten<
        (B extends NeverRecord ? unknown : { body: B }) &
          (Q extends NeverRecord ? unknown : { query: Q }) &
          (Pm extends NeverRecord ? unknown : { params: Pm })
      >
    : Record<string, never>;

type ResFor<M extends Methods, P extends PathsFor<M>> = RouteFor<
  M,
  P & AllPaths
>["response"];

// ─── Result ───────────────────────────────────────────────────────────────────

export type ApiSuccess<T> = {
  ok: true;
  status: number;
  data: T;
  headers: Headers;
};
export type ApiError = {
  ok: false;
  status: number;
  message: string;
  data?: unknown;
  headers: Headers;
};
export type ApiResult<T> = ApiSuccess<T> | ApiError;

// ─── Config ───────────────────────────────────────────────────────────────────

export interface ApiClientConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
  onUnauthorized?: () => void;
}

// ─── Internal fetch ───────────────────────────────────────────────────────────

function interpolatePath(
  tpl: string,
  params?: Record<string, unknown>,
): string {
  if (!params) return tpl;
  return tpl.replace(/:([a-zA-Z_]\w*)/g, (_, k) => {
    const v = params[k];
    if (v == null) throw new Error(`Missing param "${k}" for "${tpl}"`);
    return encodeURIComponent(String(v));
  });
}

function buildQs(q?: Record<string, unknown>): string {
  if (!q) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v == null) continue;
    Array.isArray(v)
      ? v.forEach((x) => p.append(k, String(x)))
      : p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function coreFetch<T>(
  cfg: ApiClientConfig,
  method: string,
  tpl: string,
  opts?: {
    body?: unknown;
    query?: Record<string, unknown>;
    params?: Record<string, unknown>;
  },
  extraHeaders?: Record<string, string>,
): Promise<ApiResult<T>> {
  const url =
    (cfg.baseUrl ?? "") +
    interpolatePath(tpl, opts?.params) +
    buildQs(opts?.query);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(cfg.headers ?? {}),
    ...(extraHeaders ?? {}),
  };

  const noBody = method === "GET" || method === "DELETE";
  const init: RequestInit = {
    method,
    headers,
    credentials: "include",
    ...(noBody || opts?.body === undefined
      ? {}
      : { body: JSON.stringify(opts.body) }),
  };

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    return {
      ok: false,
      status: 0,
      message: e instanceof Error ? e.message : "Network error",
      headers: new Headers(),
    };
  }

  if (res.status === 401) cfg.onUnauthorized?.();

  let body: unknown;
  try {
    body = res.headers.get("content-type")?.includes("application/json")
      ? await res.json()
      : await res.text();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as Record<string, unknown>).message)
        : res.statusText;
    return {
      ok: false,
      status: res.status,
      message,
      data: body,
      headers: res.headers,
    };
  }
  return {
    ok: true,
    status: res.status,
    data: body as T,
    headers: res.headers,
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createApiClient(config: ApiClientConfig = {}) {
  // Each method is a standalone generic function — no shared generic builder.
  // This lets TS resolve P independently per call without widening it.
  return {
    get<P extends PathsFor<"get">>(
      path: P,
      opts: OptsFor<"get", P>,
      headers?: Record<string, string>,
    ): Promise<ApiResult<ResFor<"get", P>>> {
      return coreFetch(config, "GET", path, opts as never, headers);
    },

    post<P extends PathsFor<"post">>(
      path: P,
      opts: OptsFor<"post", P>,
      headers?: Record<string, string>,
    ): Promise<ApiResult<ResFor<"post", P>>> {
      return coreFetch(config, "POST", path, opts as never, headers);
    },

    put<P extends PathsFor<"put">>(
      path: P,
      opts: OptsFor<"put", P>,
      headers?: Record<string, string>,
    ): Promise<ApiResult<ResFor<"put", P>>> {
      return coreFetch(config, "PUT", path, opts as never, headers);
    },

    patch<P extends PathsFor<"patch">>(
      path: P,
      opts: OptsFor<"patch", P>,
      headers?: Record<string, string>,
    ): Promise<ApiResult<ResFor<"patch", P>>> {
      return coreFetch(config, "PATCH", path, opts as never, headers);
    },

    delete<P extends PathsFor<"delete">>(
      path: P,
      opts: OptsFor<"delete", P>,
      headers?: Record<string, string>,
    ): Promise<ApiResult<ResFor<"delete", P>>> {
      return coreFetch(config, "DELETE", path, opts as never, headers);
    },

    /** Update config at runtime (e.g. set auth token after login) */
    configure(updates: Partial<ApiClientConfig>) {
      Object.assign(config, updates);
    },
  };
}
