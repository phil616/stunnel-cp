package service

import (
	"archive/zip"
	"bytes"
	"context"
	"io"
	"reflect"
	"strings"
	"testing"

	"github.com/phil616/stunnel-cp/internal/domain"
)

func TestPlatformWhitelist(t *testing.T) {
	for input, want := range map[string]Platform{"": PlatformUnix, "unix": PlatformUnix, " UNIX ": PlatformUnix, "Windows": PlatformWindows} {
		got, err := ParsePlatform(input)
		if err != nil || got != want {
			t.Fatalf("%q: %q %v", input, got, err)
		}
	}
	for _, input := range []string{"linux", "darwin", "windows\npid = no", " ", "../windows"} {
		if _, err := ParsePlatform(input); err == nil {
			t.Fatalf("accepted %q", input)
		}
		if _, err := Config(domain.Tunnel{}, Platform(input)); err == nil {
			t.Fatalf("renderer accepted %q", input)
		}
	}
}

func TestPlatformExportsPreserveTLSAndSecrets(t *testing.T) {
	s := testService(t)
	a, _, server := fixtures(t, s)
	ctx := context.Background()
	c, err := s.Issue(ctx, CertificateInput{CAID: a.ID, Name: "client", CommonName: "client", Purpose: "client", Algorithm: "ECDSA-P256", Days: 30})
	if err != nil {
		t.Fatal(err)
	}
	client, err := s.SaveTunnel(ctx, domain.Tunnel{Name: "client", Mode: "client", Accept: "127.0.0.1:16379", Connect: "127.0.0.1:6380", CertificateID: c.ID, PeerName: "redis.example.com", TLSMin: "TLSv1.3", Enabled: true}, "")
	if err != nil {
		t.Fatal(err)
	}
	for _, tun := range []domain.Tunnel{server, client} {
		t.Run(tun.Mode, func(t *testing.T) {
			unix, _ := Config(tun, PlatformUnix)
			for _, platform := range []Platform{PlatformUnix, PlatformWindows} {
				config, err := Config(tun, platform)
				if err != nil {
					t.Fatal(err)
				}
				if platform == PlatformWindows {
					if strings.Contains(config, "foreground =") || strings.Contains(config, "pid =") {
						t.Fatal("Unix option in Windows configuration")
					}
					if config != strings.Replace(unix, "foreground = yes\npid =\n", "", 1) {
						t.Fatal("platform changed TLS configuration")
					}
				}
				for _, want := range []string{"verifyChain = yes", "requireCert = yes", "CRLfile = certificates/ca.crl", "CAfile = certificates/ca.pem", "sslVersionMin = " + tun.TLSMin} {
					if !strings.Contains(config, want) {
						t.Fatal(want)
					}
				}
				if tun.Mode == "client" && !strings.Contains(config, "checkHost = redis.example.com\nsni = redis.example.com") {
					t.Fatal("identity validation lost")
				}
				data, name, err := s.ExportTunnel(ctx, tun.ID, false, platform)
				if err != nil || name != tun.Name+"-"+string(platform)+".conf" || string(data) != config {
					t.Fatalf("config export %s %v", name, err)
				}
				data, name, err = s.ExportTunnel(ctx, tun.ID, true, platform)
				if err != nil || name != tun.Name+"-"+string(platform)+".zip" {
					t.Fatalf("ZIP export %s %v", name, err)
				}
				zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
				if err != nil {
					t.Fatal(err)
				}
				files := map[string]string{}
				for _, f := range zr.File {
					r, e := f.Open()
					if e != nil {
						t.Fatal(e)
					}
					b, e := io.ReadAll(r)
					r.Close()
					if e != nil {
						t.Fatal(e)
					}
					files[f.Name] = string(b)
					if f.Name == "certificates/key.pem" && f.Mode().Perm() != 0600 {
						t.Fatal("key permissions")
					}
				}
				if len(files) != 6 || files["stunnel.conf"] != config || !strings.Contains(files["certificates/key.pem"], "PRIVATE KEY") || !strings.Contains(files["certificates/ca.crl"], "X509 CRL") {
					t.Fatal("invalid ZIP")
				}
				readme := files["README.md"]
				for _, want := range []string{tun.Mode, tun.Accept, tun.Connect, "工作目录", "CRL", "私钥", "重载"} {
					if !strings.Contains(readme, want) {
						t.Fatal("README missing " + want)
					}
				}
				if platform == PlatformWindows {
					for _, want := range []string{"Set-Location", `.\tstunnel.exe .\stunnel.conf`, "DLL", "Ctrl+C"} {
						if !strings.Contains(readme, want) {
							t.Fatal(want)
						}
					}
					for _, bad := range []string{"chmod", "apt-get", "pid =", "foreground ="} {
						if strings.Contains(readme, bad) {
							t.Fatal("Unix instruction in Windows README: " + bad)
						}
					}
				} else {
					for _, want := range []string{"sudo apt-get update", "sudo apt-get install -y stunnel4", "chmod 600 certificates/key.pem", "stunnel4 ./stunnel.conf"} {
						if !strings.Contains(readme, want) {
							t.Fatal(want)
						}
					}
				}
			}
			stored, err := s.Store.Tunnel(ctx, tun.ID)
			if err != nil || !reflect.DeepEqual(tun, stored) {
				t.Fatal("export mutated tunnel")
			}
			tun.Enabled = false
			if _, err = s.SaveTunnel(ctx, tun, tun.ID); err != nil {
				t.Fatal(err)
			}
			for _, p := range []Platform{PlatformUnix, PlatformWindows} {
				if _, _, err = s.ExportTunnel(ctx, tun.ID, true, p); err == nil {
					t.Fatal("exported disabled tunnel")
				}
			}
		})
	}
	ip := client
	ip.PeerName = "127.0.0.1"
	config, _ := Config(ip, PlatformWindows)
	if !strings.Contains(config, "checkIP = 127.0.0.1") || strings.Contains(config, "sni =") {
		t.Fatal("IP identity changed")
	}
	if _, _, err = s.ExportTunnel(ctx, server.ID, true, Platform("invalid")); err == nil {
		t.Fatal("export accepted invalid platform")
	}
	if _, err = s.SaveTunnel(ctx, client, client.ID); err != nil {
		t.Fatal(err)
	}
	if err = s.Revoke(ctx, c.ID); err != nil {
		t.Fatal(err)
	}
	for _, p := range []Platform{PlatformUnix, PlatformWindows} {
		if _, _, err = s.ExportTunnel(ctx, client.ID, true, p); err == nil {
			t.Fatal("exported revoked certificate")
		}
	}
	snap, err := s.Store.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	exports := 0
	for _, event := range snap.Audit {
		if event.Action == "export" && event.Resource == "tunnel" {
			exports++
		}
	}
	if exports != 8 {
		t.Fatalf("successful exports not audited: %d", exports)
	}
}
