import { Table } from "@mantine/core";
import { CodeBlock } from "../components/CodeBlock";

const cases = [
  {
    situation: "用 IP 连接，证书只有 DNS SAN",
    result: "可以成功",
    action:
      "转发目标填 IP:端口，证书身份填预期服务的 DNS SAN；无需给证书增加该 IP。",
  },
  {
    situation: "CN 不同，但 DNS SAN 匹配",
    result: "可以成功",
    action: "使用匹配的 DNS SAN 作为证书身份；不需要仅为统一 CN 而重新签发。",
  },
  {
    situation: "CN 匹配，但已有 DNS SAN 均不匹配",
    result: "校验失败",
    action:
      "确认目标服务身份；若预期名称正确，重新签发包含该 DNS SAN 的服务端证书并部署，修改 CN 无法修复。",
  },
  {
    situation: "证书身份填 IP，但证书只有 DNS SAN",
    result: "校验失败",
    action:
      "需要按域名认证时改填预期 DNS SAN；需要按 IP 认证时重新签发含该 IP 类型 SAN 的证书。",
  },
  {
    situation: "SNI 选择了错误的虚拟服务或证书",
    result: "可能被拒绝或校验失败",
    action:
      "核对预期服务域名和服务端 SNI 路由。本项目以同一个域名生成 SNI 和 checkHost。",
  },
  {
    situation: "客户端证书 CN 与服务端域名不同",
    result: "不影响服务端名称校验",
    action:
      "客户端选择自己的 ClientAuth 证书；确保服务端信任其签发 CA，证书有效且未吊销。",
  },
];

export function CertificateIdentityGuide({
  copy,
}: {
  copy: (value: string) => Promise<void>;
}) {
  return (
    <>
      <section className="panel docs-section">
        <h2>连接地址、SNI 与证书身份</h2>
        <div className="table-scroll">
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>项目</Table.Th>
                <Table.Th>作用与填写方式</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>转发目标 / connect</Table.Td>
                <Table.Td>
                  实际 TCP 连接地址，填写主机名或 IP
                  加端口。此地址可以与证书中的名称不同。
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>服务端证书身份</Table.Td>
                <Table.Td>
                  期望认证的服务域名或 IP，不带协议和端口。IPv6
                  身份不加方括号，连接地址则使用 [IPv6]:端口。
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>checkHost / checkIP</Table.Td>
                <Table.Td>
                  验证服务端出示的证书是否属于预期 DNS 名称或
                  IP，需同时通过证书链校验。
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>SNI</Table.Td>
                <Table.Td>
                  客户端在 TLS
                  握手中发送的服务名称，供服务端选择虚拟服务或证书。证书本身没有
                  SNI 字段；SNI 不负责认证。
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>SAN</Table.Td>
                <Table.Td>
                  证书声明的 DNS 名称或 IP。域名和 IP 是不同的 SAN
                  类型，不能相互替代。
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>CN</Table.Td>
                <Table.Td>
                  证书的通用名称。DNS 名称校验优先使用 DNS SAN，不能通过匹配 CN
                  来绕过不匹配的 DNS SAN。
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </div>
        <p>
          DNS 身份可以匹配证书中的通配符：<code>*.example.com</code> 可匹配{" "}
          <code>redis.example.com</code>，不匹配 <code>example.com</code> 或{" "}
          <code>a.b.example.com</code>
          。表单中的证书身份应填写具体名称，不填写通配符。
        </p>
        <p>
          兼容性说明：stunnel 使用 OpenSSL 的名称匹配规则，默认在没有 DNS SAN
          时可回退检查 CN。本项目要求服务端证书填写
          SAN，但没有额外关闭此兼容回退；部署时应按 SAN 配置，不依赖仅有 CN
          的旧证书。
        </p>
      </section>
      <section className="panel docs-section">
        <h2>名称不一致时如何处理</h2>
        <p>
          以下结果均假设网络可达，CA 信任、证书用途、有效期和 CRL 检查已通过。
        </p>
        <div className="table-scroll">
          <Table className="identity-cases">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>情况</Table.Th>
                <Table.Th>结果</Table.Th>
                <Table.Th>处理办法</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {cases.map((item) => (
                <Table.Tr key={item.situation}>
                  <Table.Td data-label="情况">{item.situation}</Table.Td>
                  <Table.Td data-label="结果">{item.result}</Table.Td>
                  <Table.Td data-label="处理办法">{item.action}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
        <p>
          修复前先确认连接到预期服务。证书缺少预期 SAN
          时，应重新签发并部署正确证书，不要为消除报错而随意接受其他身份，也不要关闭证书链或名称校验。
        </p>
      </section>
      <section className="panel docs-section">
        <h2>示例：用 IP 连接，按域名认证</h2>
        <p>
          服务位于 <code>10.0.0.8:6380</code>，服务端证书包含{" "}
          <code>DNS:redis.example.com</code>。客户端按下表填写，证书 CN
          可以与该域名不同。
        </p>
        <div className="table-scroll">
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>表单字段</Table.Th>
                <Table.Th>值</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>工作模式</Table.Td>
                <Table.Td>客户端</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>监听地址</Table.Td>
                <Table.Td>
                  <code>127.0.0.1:16379</code>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>转发目标</Table.Td>
                <Table.Td>
                  <code>10.0.0.8:6380</code>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>身份认证证书</Table.Td>
                <Table.Td>本客户端的 ClientAuth 证书</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>服务端证书身份</Table.Td>
                <Table.Td>
                  <code>redis.example.com</code>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </div>
        <CodeBlock
          label="生成的客户端配置片段"
          code={
            "client = yes\naccept = 127.0.0.1:16379\nconnect = 10.0.0.8:6380\nverifyChain = yes\nrequireCert = yes\ncheckHost = redis.example.com\nsni = redis.example.com"
          }
          copy={copy}
        />
        <p>
          上面仅展示关键指令，实际部署使用完整部署包。若身份填写{" "}
          <code>10.0.0.8</code>，则生成 <code>checkIP = 10.0.0.8</code>
          ，服务端证书必须包含该 IP 类型 SAN。
        </p>
      </section>
      <section className="panel docs-section">
        <h2>本项目的校验范围</h2>
        <ul>
          <li>
            服务端证书必须有 SAN，服务端 / 客户端证书分别使用 ServerAuth /
            ClientAuth。
          </li>
          <li>
            客户端的证书身份是 DNS 名称时，同时生成同值 checkHost 和 SNI；是 IP
            时生成 checkIP，不显式配置 SNI，是否发送 SNI 取决于 stunnel
            的默认行为。
          </li>
          <li>
            客户端选择的证书用于证明客户端自身身份。服务端当前信任同一 CA
            下通过用途、有效期及吊销检查的客户端证书，没有单独的客户端 CN
            白名单。
          </li>
          <li>
            保存时检查输入格式及本端证书状态，不连接远端验证其证书。“可部署”不表示已经通过远端握手验证。
          </li>
          <li>
            每个服务端隧道使用一张证书，未配置按 SNI
            选择证书的虚拟服务。表单也不支持分别设置不同的 SNI
            和校验名称；此类高级场景需要单独维护相应 stunnel 配置。
          </li>
        </ul>
      </section>
      <section className="panel docs-section">
        <h2>检查实际出示的证书</h2>
        <p>在服务端部署目录检查其证书中的 CN、SAN、签发机构和有效期：</p>
        <CodeBlock
          label="检查服务端证书"
          code="openssl x509 -in certificates/cert.pem -noout -subject -issuer -dates -ext subjectAltName"
          copy={copy}
        />
        <p>
          在客户端部署目录执行下列命令，用本客户端的证书和私钥测试远端
          mTLS。将地址和预期域名替换为实际值，并检查验证结果及 stunnel 日志。
        </p>
        <CodeBlock
          label="测试远端证书与域名"
          code={
            "openssl s_client \\\n  -connect 10.0.0.8:6380 \\\n  -servername redis.example.com \\\n  -verify_hostname redis.example.com \\\n  -verify_return_error \\\n  -CAfile certificates/ca.pem \\\n  -cert certificates/cert.pem \\\n  -key certificates/key.pem"
          }
          copy={copy}
        />
        <p>
          该诊断命令验证 CA、域名及 mTLS 握手，不自动加载部署包的 CRL；吊销与
          CRL 状态仍需结合 stunnel
          日志检查。修改证书或配置后，重新导出、部署并重载 stunnel。
        </p>
        <p className="docs-sources">
          规则依据：
          <a
            href="https://www.stunnel.org/auth.html"
            target="_blank"
            rel="noreferrer"
          >
            stunnel 认证说明
          </a>{" "}
          ·{" "}
          <a
            href="https://www.stunnel.org/manual.html"
            target="_blank"
            rel="noreferrer"
          >
            stunnel 配置手册
          </a>{" "}
          ·{" "}
          <a
            href="https://docs.openssl.org/3.0/man3/X509_check_host/"
            target="_blank"
            rel="noreferrer"
          >
            OpenSSL 名称匹配规则
          </a>
        </p>
      </section>
    </>
  );
}
