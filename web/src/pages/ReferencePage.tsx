import { Table } from "@mantine/core";
import { CodeBlock } from "../components/CodeBlock";
import { CertificateIdentityGuide } from "./CertificateIdentityGuide";
export function ReferencePage({
  page,
  copy,
}: {
  page: "pki-guide" | "operations";
  copy: (value: string) => Promise<void>;
}) {
  if (page === "pki-guide")
    return (
      <div className="docs-page">
        <CertificateIdentityGuide copy={copy} />
        <section className="panel docs-section">
          <h2>证书字段</h2>
          <div className="table-scroll">
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>字段</Table.Th>
                  <Table.Th>填写规则</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>签发 CA</Table.Td>
                  <Table.Td>服务端和客户端选择同一 CA。</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>用途</Table.Td>
                  <Table.Td>
                    服务端使用 ServerAuth，客户端使用 ClientAuth。
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>CN</Table.Td>
                  <Table.Td>
                    通用名称，最多 64 字符。本项目的服务端证书必须另填 SAN。
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>SAN</Table.Td>
                  <Table.Td>
                    DNS 名称、通配符 DNS 或 IP，逗号或换行分隔；服务端必填。
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>算法</Table.Td>
                  <Table.Td>ECDSA-P256 或 RSA-3072。</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>有效期</Table.Td>
                  <Table.Td>
                    CA 为 1–7300 天；证书为 1–825 天，不能超过 CA 到期时间。
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </div>
          <p>
            客户端对端身份匹配服务端 SAN。DNS 使用 checkHost 和 SNI，IP 使用
            checkIP。服务端信任同一 CA 下所有有效客户端证书。
          </p>
        </section>
        <section className="panel docs-section">
          <h2>吊销与 CRL</h2>
          <ol>
            <li>吊销证书后，控制台立即禁止导出该证书和关联隧道。</li>
            <li>
              在 CA 页面下载新的吊销列表，替换所有对端的{" "}
              <code>certificates/ca.crl</code>。
            </li>
            <li>重载或重启 stunnel，使吊销生效。</li>
          </ol>
          <p>
            CRL 最长有效 7
            天，请在到期前更新。已下载的部署包和运行进程不会自动更新。吊销不可撤销。
          </p>
        </section>
        <section className="panel docs-section">
          <h2>续期与 CA 管理</h2>
          <p>
            签发新证书，在隧道中更换关联证书，然后重新导出和部署。确认旧证书不再使用后再吊销。
          </p>
          <p>
            CA 私钥不提供下载。已签发证书保留记录，有签发记录的 CA 不能删除。
          </p>
        </section>
        <section className="panel docs-section">
          <h2>连接失败排查</h2>
          <ul>
            <li>检查两端证书用途、签发 CA 和有效期。</li>
            <li>确认客户端对端身份与服务端证书 SAN 一致。</li>
            <li>检查 CRL 是否过期或证书是否已吊销。</li>
            <li>检查监听端口、防火墙、DNS 和实际业务服务。</li>
          </ul>
          <CodeBlock
            label="检查证书与 CRL"
            code={
              "openssl x509 -in certificates/cert.pem -noout -subject -issuer -dates -ext subjectAltName\nopenssl crl -in certificates/ca.crl -noout -lastupdate -nextupdate\nstunnel stunnel.conf"
            }
            copy={copy}
          />
        </section>
      </div>
    );
  return (
    <div className="docs-page">
      <section className="panel docs-section">
        <h2>控制台启动</h2>
        <CodeBlock
          label="运行控制台"
          code="./stunnel-cp serve -c config.yml"
          copy={copy}
        />
        <CodeBlock
          label="config.yml"
          code={
            "addr: 127.0.0.1:8080\ndata_dir: ./data\nsecure_cookie: false\nsession_ttl: 12h"
          }
          copy={copy}
        />
        <p>
          环境变量优先于 YAML
          文件，未填写项使用默认值。文件中填写的相对路径以配置文件目录为基准；环境变量和默认路径以启动目录为基准。
          直接运行 <code>./stunnel-cp</code> 仍兼容，只有指定 <code>-c</code>{" "}
          才加载文件。
        </p>
        <p>
          默认监听本机。对外访问前完成初始化，并配置 HTTPS。反向代理需保留
          Host，并设置 <code>STCP_SECURE_COOKIE=true</code>；不支持子路径代理。
        </p>
        <div className="table-scroll">
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>环境变量</Table.Th>
                <Table.Th>默认值 / 作用</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>
                  <code>STCP_ADDR</code>
                </Table.Td>
                <Table.Td>127.0.0.1:8080</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <code>STCP_DATA_DIR</code>
                </Table.Td>
                <Table.Td>./data</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <code>STCP_SECURE_COOKIE</code>
                </Table.Td>
                <Table.Td>false；HTTPS 反向代理时设为 true</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <code>STCP_TLS_CERT / STCP_TLS_KEY</code>
                </Table.Td>
                <Table.Td>
                  直接提供 HTTPS 的证书与私钥路径，必须同时设置
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <code>STCP_SESSION_TTL</code>
                </Table.Td>
                <Table.Td>12h；允许 1m–720h</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <code>STCP_MASTER_KEY</code>
                </Table.Td>
                <Table.Td>
                  可选，64 位十六进制主密钥，替代 master.key 文件
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </div>
      </section>
      <section className="panel docs-section">
        <h2>备份与恢复</h2>
        <ol>
          <li>
            停止控制台，完整备份数据目录，包括数据库、WAL 文件和{" "}
            <code>master.key</code>。
          </li>
          <li>恢复整个目录，并为运行用户设置访问权限。</li>
          <li>使用同一主密钥启动控制台，检查证书和配置。</li>
        </ol>
        <p>
          通过环境变量或 YAML
          提供主密钥时，需单独备份密钥及配置。不要在线只复制数据库文件，也不要重新生成主密钥。部署包含明文叶私钥，应限制访问。
        </p>
      </section>
      <section className="panel docs-section">
        <h2>账户与升级</h2>
        <p>
          点击侧栏用户名修改密码，其他会话立即失效。会话默认 12
          小时后过期，可通过 session_ttl 调整；登录限流为每 IP 每分钟 10 次。
        </p>
        <p>
          升级前停服备份数据目录，再替换二进制。发布包已内嵌前端，运行时不需要
          Node.js。使用 <code>./stunnel-cp --version</code> 检查版本。
        </p>
      </section>
      <section className="panel docs-section">
        <h2>常见问题</h2>
        <dl className="docs-faq">
          <dt>启动提示主密钥不匹配</dt>
          <dd>
            恢复原始 master.key，或检查 STCP_MASTER_KEY 是否与数据库对应。
          </dd>
          <dt>HTTPS 下无法保持登录</dt>
          <dd>检查 Secure Cookie 设置、反向代理 Host 和访问协议。</dd>
          <dt>Docker 数据目录不可写</dt>
          <dd>宿主挂载目录需允许 UID/GID 65532:65532 访问。</dd>
          <dt>如何确认服务就绪</dt>
          <dd>
            请求 /healthz；返回 ok 表示控制台和数据库可用，不代表隧道正在运行。
          </dd>
        </dl>
      </section>
    </div>
  );
}
