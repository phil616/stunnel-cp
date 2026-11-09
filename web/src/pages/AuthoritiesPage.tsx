import { UnstyledButton, Button } from "@mantine/core";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Copy,
  Download,
  Fingerprint,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Badge, Empty, IconButton } from "../components/ui";
import { api, date } from "../api";
import type { Snapshot, Certificate, Authority } from "../api";
import type { Confirmation } from "../types";
import type { Editor } from "../components/EditorModal";

export function AuthoritiesPage({
  snapshot,
  setDetail,
  exportFile,
  copy,
  setConfirmation,
  refresh,
  notify,
  setEditor,
}: {
  snapshot: Snapshot;
  setDetail: (resource: Certificate | Authority | null) => void;
  exportFile: (path: string) => Promise<void>;
  copy: (value: string) => Promise<void>;
  setConfirmation: (confirmation: Confirmation | null) => void;
  refresh: () => Promise<void>;
  notify: (message: string, error?: boolean) => void;
  setEditor: (editor: Editor) => void;
}) {
  if (!snapshot.authorities.length)
    return (
      <section className="panel">
        <Empty
          icon={ShieldCheck}
          title="暂无证书颁发机构"
          action={() => setEditor({ type: "ca" })}
          label="创建证书颁发机构"
        />
      </section>
    );
  return (
    <>
      <div className="ca-grid">
        {snapshot.authorities.map((a) => (
          <section className="panel ca-card" key={a.id}>
            <div className="ca-card-top">
              <span className="ca-icon">
                <ShieldCheck size={25} />
              </span>
              <div className="ca-card-menu">
                <Badge
                  kind={
                    new Date(a.not_after).getTime() > Date.now()
                      ? "valid"
                      : "expired"
                  }
                >
                  {new Date(a.not_after).getTime() > Date.now()
                    ? "有效信任根"
                    : "已过期"}
                </Badge>{" "}
                <IconButton
                  icon={Trash2}
                  danger
                  label={`删除 ${a.name}`}
                  disabled={snapshot.certificates.some((c) => c.ca_id === a.id)}
                  onClick={() =>
                    setConfirmation({
                      title: `删除 CA「${a.name}」`,
                      description:
                        "该操作无法撤销。此 CA 的证书与私钥将从数据库删除。",
                      action: async () => {
                        await api(`/authorities/${a.id}`, "DELETE");
                        await refresh();
                        notify("CA 已删除");
                      },
                    })
                  }
                />
              </div>
            </div>
            <UnstyledButton className="ca-name" onClick={() => setDetail(a)}>
              {a.name}
              <ArrowUpRight size={16} />
            </UnstyledButton>
            <p>{a.organization}</p>
            <dl>
              <div>
                <dt>签名密钥</dt>
                <dd>{a.algorithm}</dd>
              </div>
              <div>
                <dt>有效期至</dt>
                <dd>{date(a.not_after)}</dd>
              </div>
              <div>
                <dt>已签发证书</dt>
                <dd>
                  {snapshot.certificates.filter((c) => c.ca_id === a.id).length}{" "}
                  张
                </dd>
              </div>
            </dl>
            <div className="ca-fingerprint">
              <Fingerprint size={14} />
              <span>{a.fingerprint.slice(0, 28)}…</span>
              <IconButton
                icon={Copy}
                label={`复制 ${a.name} 指纹`}
                onClick={() => copy(a.fingerprint)}
              />
            </div>
            <div className="ca-card-actions">
              <Button
                variant="default"
                size="sm"
                onClick={() => exportFile(`/authorities/${a.id}/certificate`)}
              >
                <Download size={14} />
                CA 证书
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => exportFile(`/authorities/${a.id}/crl`)}
              >
                <ArrowDownToLine size={14} />
                吊销列表
              </Button>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
