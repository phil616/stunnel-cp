import { UnstyledButton, Button } from "@mantine/core";
import {
  Activity,
  ArrowRight,
  FileCode2,
  Network,
  ShieldCheck,
} from "lucide-react";
import { Empty } from "../components/ui";
import { certificateState, dateTime } from "../api";
import { actionLabel, resourceLabel } from "../format";
import type { Snapshot, Tunnel } from "../api";
import type { ReactNode } from "react";
import type { Page } from "../types";
export function OverviewPage({
  snapshot,
  go,
  tunnelTable,
  ready,
}: {
  snapshot: Snapshot;
  go: (page: Page) => void;
  tunnelTable: (items: Tunnel[], compact?: boolean) => ReactNode;
  ready: (t: Tunnel) => boolean;
}) {
  const valid = snapshot.certificates.filter((c) =>
    ["valid", "expiring"].includes(certificateState(c)),
  ).length;
  const expiring = snapshot.certificates.filter((c) =>
    ["expiring", "expired"].includes(certificateState(c)),
  ).length;
  return (
    <>
      <div className="stats-grid">
        {[
          {
            label: "隧道配置",
            value: snapshot.tunnels.length,
            icon: Network,
            foot: `${snapshot.tunnels.filter(ready).length} 个可部署`,
            page: "tunnels" as Page,
          },
          {
            label: "有效证书",
            value: valid,
            icon: FileCode2,
            page: "certificates" as Page,
          },
          {
            label: "证书颁发机构",
            value: snapshot.authorities.length,
            icon: ShieldCheck,
            page: "authorities" as Page,
          },
          {
            label: "到期提醒",
            value: expiring,
            icon: Activity,
            foot: "30 天内到期或已过期",
            page: "certificates" as Page,
          },
        ].map(({ label, value, icon: Icon, foot, page }) => (
          <UnstyledButton
            className="stat-card"
            key={label}
            onClick={() => go(page)}
          >
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>{value}</strong>
            <small aria-hidden={!foot}>{foot || "\u00a0"}</small>
          </UnstyledButton>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>最近的隧道</h2>
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => go("tunnels")}
            >
              全部
              <ArrowRight size={14} />
            </Button>
          </div>
          {tunnelTable(snapshot.tunnels.slice(0, 5), true)}
        </section>
        <section className="panel recent-activity">
          <div className="panel-heading">
            <h2>最近活动</h2>
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => go("audit")}
            >
              全部
              <ArrowRight size={14} />
            </Button>
          </div>
          {snapshot.audit.length ? (
            <div className="activity-list">
              {snapshot.audit.slice(0, 5).map((a) => (
                <div className="activity-row" key={a.id}>
                  <div>
                    <strong>
                      {actionLabel(a.action)}
                      {resourceLabel(a.resource)}
                    </strong>
                    <span>{a.name}</span>
                  </div>
                  <time>{dateTime(a.created_at)}</time>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={Activity} title="暂无记录" />
          )}
        </section>
      </div>
    </>
  );
}
