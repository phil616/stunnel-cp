import type { Tunnel } from "./api";
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "操作失败，请稍后重试";
export function tunnelInput(t: Tunnel) {
  return {
    name: t.name,
    description: t.description,
    mode: t.mode,
    accept: t.accept,
    connect: t.connect,
    certificate_id: t.certificate_id,
    peer_name: t.peer_name,
    tls_min: t.tls_min,
    enabled: t.enabled,
  };
}
export function actionLabel(action: string) {
  return (
    (
      {
        create: "创建",
        issue: "签发",
        revoke: "吊销",
        update: "更新",
        delete: "删除",
        export: "导出",
        setup: "初始化",
        login: "登录",
        password_change: "修改密码",
      } as Record<string, string>
    )[action] || action
  );
}
export function resourceLabel(resource: string) {
  return (
    (
      {
        authority: "证书颁发机构",
        certificate: "证书",
        tunnel: "隧道配置",
        account: "管理员账户",
        crl: "吊销列表",
      } as Record<string, string>
    )[resource] || resource
  );
}
