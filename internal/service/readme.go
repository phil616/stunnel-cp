package service

import (
	"fmt"
	"time"

	"github.com/phil616/stunnel-cp/internal/domain"
)

func renderDeploymentReadme(t domain.Tunnel, platform Platform, crlExpires time.Time) string {
	title := "Unix / Linux"
	if platform == PlatformWindows {
		title = "Windows"
	}
	text := fmt.Sprintf("# %s — %s mTLS 部署\n\n模式：%s\n监听地址：%s\n转发目标：%s\n\n本 ZIP 仅包含 stunnel.conf、证书、叶私钥、CA 和 CRL，不包含 stunnel 可执行程序或依赖库。\n需要 stunnel 5.x 与 OpenSSL 1.1.1+。先检查监听端口、防火墙和转发目标。\n所有证书路径相对于运行时工作目录，必须在解压目录中启动。\n\n", t.Name, title, t.Mode, t.Accept, t.Connect)
	if platform == PlatformWindows {
		text += fmt.Sprintf(`## 原生控制台启动

1. 从 https://www.stunnel.org/downloads.html 获取官方 Windows 发行安装器。
2. 在安装器中选择可选的 tstunnel.exe 命令行组件；也可在另一台机器安装后，从安装目录的 bin 目录复制该组件。
3. 将 tstunnel.exe 及同一发行版所需的匹配 OpenSSL / 运行时 DLL 放到本部署包根目录。不要混用版本，也不要假设仅复制一个 EXE 就能运行。
4. 解压到仅允许运行账户访问的目录，限制其他账户读取 certificates/key.pem。
5. 在 PowerShell 中进入实际解压目录并直接启动。以下路径仅为示例，请替换：

`+"```powershell\n"+`Set-Location 'C:\Services\%s'
.\tstunnel.exe .\stunnel.conf
`+"```\n"+`
tstunnel.exe 是原生 Console CLI，前台运行会显示日志；无需注册 Windows Service，也无需 GUI。
停止时可用 Ctrl+C，或通过进程管理工具针对该进程的 PID 停止。
`, t.Name)
	} else {
		text += fmt.Sprintf(`## 直接命令行启动

Debian / Ubuntu 默认使用发行版软件包：

`+"```bash\n"+`sudo apt-get update
sudo apt-get install -y stunnel4

# 以下解压路径仅为示例，请替换为实际目录
cd /opt/%s
chmod 700 .
chmod 600 certificates/key.pem
stunnel4 ./stunnel.conf
`+"```\n"+`
apt 仅适用于相应发行版。其他 Linux / macOS 请使用各自官方包管理器安装，并用 command -v stunnel4 或 command -v stunnel 确认可执行文件名称。
此配置直接前台运行，用 Ctrl+C 停止；不要求配置系统服务。如需守护进程，可另行配置进程管理器并设置正确的工作目录，避免与发行版默认实例冲突。
`, t.Name)
	}
	text += fmt.Sprintf(`
## 双向认证与维护

连接两端使用同一个 CA 签发的有效证书，服务端 / 客户端证书用途必须对应。
客户端的 checkHost 或 checkIP 必须匹配预期服务端证书身份。
CRL 有效至 %s；请在到期前下载新 CRL，替换所有对端的 certificates/ca.crl 并重载或重启 stunnel。
吊销证书后也须立即分发更新的 CRL；已下载的部署包和运行进程不会自动更新。
certificates/key.pem 包含敏感私钥，请限制访问、通过安全通道传输，不要提交到代码仓库。
控制台不启动或监控 stunnel 进程。
`, crlExpires.UTC().Format(time.RFC3339))
	return text
}
