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
          <div className="filter-input">
            <Search size={16} />
            <input
              aria-label="搜索证书"
              placeholder="搜索名称、CN 或 SAN…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {filteredCerts.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>证书名称</th>
                  <th>用途 / SAN</th>
                  <th>签发机构</th>
                  <th>有效期至</th>
                  <th>状态</th>
                  <th className="align-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredCerts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button
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
                      </button>
                    </td>
                    <td>
                      <span className="purpose">
                        {c.purpose === "server" ? "服务端" : "客户端"}
                      </span>
                      <small className="cell-sub" title={c.sans.join(", ")}>
                        {c.sans.join(", ") || "无 SAN"}
                      </small>
                    </td>
                    <td>
                      {snapshot.authorities.find((a) => a.id === c.ca_id)?.name}
                    </td>
                    <td className="mono">{date(c.not_after)}</td>
                    <td>
                      <CertBadge certificate={c} />
                    </td>
                    <td>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
