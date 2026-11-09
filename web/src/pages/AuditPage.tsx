import { Table } from "@mantine/core";
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
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>操作</Table.Th>
                <Table.Th>资源类型</Table.Th>
                <Table.Th>资源名称</Table.Th>
                <Table.Th>记录编号</Table.Th>
                <Table.Th>时间</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {snapshot.audit.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    <span className="audit-action">
                      <span className="activity-icon">
                        <Check size={13} />
                      </span>
                      {actionLabel(a.action)}
                    </span>
                  </Table.Td>
                  <Table.Td>{resourceLabel(a.resource)}</Table.Td>
                  <Table.Td>{a.name}</Table.Td>
                  <Table.Td className="mono muted">
                    #{a.id.toString().padStart(4, "0")}
                  </Table.Td>
                  <Table.Td className="mono muted">
                    {date(a.created_at)}{" "}
                    {dateTime(a.created_at).split(" ").pop()}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      ) : (
        <Empty icon={Activity} title="还没有操作记录" />
      )}
    </section>
  );
}
