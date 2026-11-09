import { TextInput, Table, UnstyledButton } from "@mantine/core";
import {
  Download,
  FileCode2,
  Fingerprint,
  Search,
  ShieldX,
} from "lucide-react";
import { CertBadge, Empty, IconButton } from "../components/ui";
import { certificateState, date } from "../api";
import type { Snapshot, Certificate, Authority } from "../api";
import type { Editor } from "../components/EditorModal";

export function CertificatesPage({
  snapshot,
  query,
  setQuery,
  filteredCerts,
  setDetail,
  exportFile,
  revoke,
  setEditor,
}: {
  snapshot: Snapshot;
  query: string;
  setQuery: (value: string) => void;
  filteredCerts: Certificate[];
  setDetail: (resource: Certificate | Authority | null) => void;
  exportFile: (path: string) => Promise<void>;
  revoke: (certificate: Certificate) => void;
  setEditor: (editor: Editor) => void;
}) {
  return (
    <>
      <section className="panel">
        <div className="list-toolbar">
          <h2>
            全部证书{" "}
            <span className="count">{snapshot.certificates.length}</span>
          </h2>
          <TextInput
            aria-label="搜索证书"
            placeholder="搜索名称、CN 或 SAN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leftSection={<Search size={16} />}
          />
        </div>
        {filteredCerts.length ? (
          <div className="table-scroll">
            <Table className="resource-table certificate-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>证书名称</Table.Th>
                  <Table.Th>用途 / SAN</Table.Th>
                  <Table.Th>签发机构</Table.Th>
                  <Table.Th>有效期至</Table.Th>
                  <Table.Th>状态</Table.Th>
                  <Table.Th className="align-right">操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredCerts.map((c) => (
                  <Table.Tr key={c.id}>
                    <Table.Td className="resource-primary">
                      <UnstyledButton
                        className="resource-name"
                        onClick={() => setDetail(c)}
                      >
                        <span className="table-icon">
                          <FileCode2 size={17} />
                        </span>
                        <span>
                          <strong>{c.name}</strong>
                          <small>{c.common_name}</small>
                        </span>
                      </UnstyledButton>
                    </Table.Td>
                    <Table.Td
                      className="resource-field resource-purpose"
                      data-label="用途 / SAN"
                    >
                      <div>
                        <span className="purpose">
                          {c.purpose === "server" ? "服务端" : "客户端"}
                        </span>
                        <small className="cell-sub" title={c.sans.join(", ")}>
                          {c.sans.join(", ") || "无 SAN"}
                        </small>
                      </div>
                    </Table.Td>
                    <Table.Td
                      className="resource-field resource-issuer"
                      data-label="签发机构"
                    >
                      {snapshot.authorities.find((a) => a.id === c.ca_id)?.name}
                    </Table.Td>
                    <Table.Td
                      className="resource-field resource-expiry mono"
                      data-label="有效期至"
                    >
                      {date(c.not_after)}
                    </Table.Td>
                    <Table.Td className="resource-status">
                      <CertBadge certificate={c} />
                    </Table.Td>
                    <Table.Td className="resource-actions">
                      <div className="row-actions">
                        <IconButton
                          icon={Fingerprint}
                          label={`查看 ${c.name} 详情`}
                          onClick={() => setDetail(c)}
                        />
                        <IconButton
                          icon={Download}
                          label={`下载 ${c.name} 证书包`}
                          disabled={
                            !["valid", "expiring"].includes(certificateState(c))
                          }
                          onClick={() =>
                            exportFile(`/certificates/${c.id}/bundle`)
                          }
                        />
                        <IconButton
                          icon={ShieldX}
                          danger
                          label={`吊销 ${c.name}`}
                          disabled={!!c.revoked_at}
                          onClick={() => revoke(c)}
                        />
                      </div>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        ) : (
          <Empty
            icon={FileCode2}
            title={query ? "没有匹配的证书" : "暂无证书"}
            action={query ? undefined : () => setEditor({ type: "cert" })}
            label="签发证书"
          />
        )}
      </section>
    </>
  );
}
