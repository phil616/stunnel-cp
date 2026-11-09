import { Activity, Check } from "lucide-react";
import { Empty } from "../components/ui";
import { date, dateTime } from "../api";
import { actionLabel, resourceLabel } from "../format";
import type { Snapshot } from "../api";

export function AuditPage({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section className="panel">
      <div className="list-toolbar">
        <h2>最近 100 条操作记录</h2>
      </div>
      {snapshot.audit.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>操作</th>
                <th>资源类型</th>
                <th>资源名称</th>
                <th>记录编号</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.audit.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="audit-action">
                      <span className="activity-icon">
                        <Check size={13} />
                      </span>
                      {actionLabel(a.action)}
                    </span>
                  </td>
                  <td>{resourceLabel(a.resource)}</td>
                  <td>{a.name}</td>
                  <td className="mono muted">
                    #{a.id.toString().padStart(4, "0")}
                  </td>
                  <td className="mono muted">
                    {date(a.created_at)}{" "}
                    {dateTime(a.created_at).split(" ").pop()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={Activity} title="还没有操作记录" />
      )}
    </section>
  );
}
