import { CircleHelp } from "lucide-react";

export function CertificateHelp({
  context,
}: {
  context: "certificate" | "client";
}) {
  return (
    <details className="certificate-help">
      <summary>
        <CircleHelp size={14} />
        {context === "certificate"
          ? "SAN 与 CN 填写规则"
          : "地址与证书匹配规则"}
      </summary>
      {context === "certificate" ? (
        <p>
          服务端 SAN 填写预期校验的域名或 IP。DNS SAN 匹配时，CN 可以不同；使用
          IP 校验必须有 IP 类型 SAN。客户端证书的 CN 无需匹配服务端域名。
        </p>
      ) : (
        <p>
          转发目标是实际连接地址，可与证书身份不同。身份填域名时生成 checkHost
          和同值 SNI；填 IP 时生成 checkIP。保存配置不会验证远端实际证书。
        </p>
      )}
      <a
        className="text-link"
        href="/#pki-guide"
        target="_blank"
        rel="noopener noreferrer"
      >
        查看完整证书规范（新标签页）
      </a>
    </details>
  );
}
