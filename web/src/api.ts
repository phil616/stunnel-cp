export interface Authority {
  id: string;
  name: string;
  organization: string;
  algorithm: string;
  serial: string;
  fingerprint: string;
  not_before: string;
  not_after: string;
  created_at: string;
}
export interface Certificate {
  id: string;
  ca_id: string;
  name: string;
  common_name: string;
  purpose: "server" | "client";
  sans: string[];
  algorithm: string;
  serial: string;
  fingerprint: string;
  not_before: string;
  not_after: string;
  revoked_at: string | null;
  created_at: string;
}
export interface Tunnel {
  id: string;
  name: string;
  description: string;
  mode: "server" | "client";
  accept: string;
  connect: string;
  certificate_id: string;
  peer_name: string;
  tls_min: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}
export interface Audit {
  id: number;
  action: string;
  resource: string;
  name: string;
  created_at: string;
}
export interface Snapshot {
  authorities: Authority[];
  certificates: Certificate[];
  tunnels: Tunnel[];
  audit: Audit[];
}
export interface Status {
  setup_required: boolean;
  authenticated: boolean;
  username: string;
  version: string;
}
export const emptySnapshot: Snapshot = {
  authorities: [],
  certificates: [],
  tunnels: [],
  audit: [],
};
async function request(path: string, options: RequestInit = {}) {
  const response = await fetch("/api" + path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Protection": "1",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: "服务暂时不可用" }));
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(body.error || `请求失败 (${response.status})`);
  }
  return response;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await request(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function download(path: string) {
  const response = await request(path);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download =
    response.headers
      .get("Content-Disposition")
      ?.match(/filename="?([^";]+)/)?.[1] || "download";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function certificateState(c: Certificate) {
  if (c.revoked_at) return "revoked";
  if (new Date(c.not_after).getTime() <= Date.now()) return "expired";
  if (new Date(c.not_after).getTime() - Date.now() < 30 * 86400000)
    return "expiring";
  return "valid";
}
export function date(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function dateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
