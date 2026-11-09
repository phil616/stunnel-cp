package service

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/phil616/stunnel-cp/internal/domain"
)

// Opt in with STCP_STUNNEL_BIN=/absolute/path/to/stunnel4 go test ./internal/service -run TestStunnelMTLS -v.
func TestStunnelMTLS(t *testing.T) {
	binary := os.Getenv("STCP_STUNNEL_BIN")
	if binary == "" {
		t.Skip("set STCP_STUNNEL_BIN to run real stunnel integration")
	}
	platform := PlatformUnix
	if runtime.GOOS == "windows" {
		platform = PlatformWindows
	}
	s := testService(t)
	ctx := context.Background()
	backend, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()
	go func() {
		for {
			conn, err := backend.Accept()
			if err != nil {
				return
			}
			go func() { defer conn.Close(); conn.SetDeadline(time.Now().Add(5 * time.Second)); io.Copy(conn, conn) }()
		}
	}()
	freeAddress := func() string {
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		addr := ln.Addr().String()
		ln.Close()
		return addr
	}
	serverAddr, clientAddr := freeAddress(), freeAddress()
	a, err := s.CreateCA(ctx, CAInput{Name: "Integration Root", Organization: "Tests", Algorithm: "ECDSA-P256", Days: 3650})
	if err != nil {
		t.Fatal(err)
	}
	issue := func(name, purpose string, sans []string) domain.Certificate {
		c, err := s.Issue(ctx, CertificateInput{CAID: a.ID, Name: name, CommonName: name, Purpose: purpose, Algorithm: "ECDSA-P256", SANs: sans, Days: 365})
		if err != nil {
			t.Fatal(err)
		}
		return c
	}
	serverCert := issue("localhost", "server", []string{"localhost", "127.0.0.1"})
	clientCert := issue("client", "client", nil)
	makeTunnel := func(name, mode, accept, connect, certID, peer string) domain.Tunnel {
		tunnel, err := s.SaveTunnel(ctx, domain.Tunnel{Name: name, Mode: mode, Accept: accept, Connect: connect, CertificateID: certID, PeerName: peer, TLSMin: "TLSv1.2", Enabled: true}, "")
		if err != nil {
			t.Fatal(err)
		}
		return tunnel
	}
	server := makeTunnel("server", "server", serverAddr, backend.Addr().String(), serverCert.ID, "")
	client := makeTunnel("client", "client", clientAddr, serverAddr, clientCert.ID, "localhost")
	extract := func(tunnel domain.Tunnel) string {
		data, _, err := s.ExportTunnel(ctx, tunnel.ID, true, platform)
		if err != nil {
			t.Fatal(err)
		}
		reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			t.Fatal(err)
		}
		dir := t.TempDir()
		for _, f := range reader.File {
			target := filepath.Join(dir, filepath.FromSlash(f.Name))
			if err = os.MkdirAll(filepath.Dir(target), 0700); err != nil {
				t.Fatal(err)
			}
			r, err := f.Open()
			if err != nil {
				t.Fatal(err)
			}
			content, err := io.ReadAll(r)
			r.Close()
			if err != nil {
				t.Fatal(err)
			}
			if err = os.WriteFile(target, content, f.Mode().Perm()); err != nil {
				t.Fatal(err)
			}
		}
		return dir
	}
	serverDir, clientDir := extract(server), extract(client)
	start := func(dir, address string) func() {
		logPath := filepath.Join(dir, fmt.Sprintf("stunnel-%d.log", time.Now().UnixNano()))
		logFile, err := os.Create(logPath)
		if err != nil {
			t.Fatal(err)
		}
		cmd := exec.Command(binary, "stunnel.conf")
		cmd.Dir = dir
		cmd.Stdout = logFile
		cmd.Stderr = logFile
		if err = cmd.Start(); err != nil {
			logFile.Close()
			t.Fatal(err)
		}
		stopped := false
		stop := func() {
			if !stopped {
				stopped = true
				cmd.Process.Kill()
				cmd.Wait()
				logFile.Close()
				if t.Failed() {
					data, _ := os.ReadFile(logPath)
					t.Log(string(data))
				}
			}
		}
		t.Cleanup(stop)
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			conn, err := net.DialTimeout("tcp", address, 100*time.Millisecond)
			if err == nil {
				conn.Close()
				return stop
			}
			time.Sleep(20 * time.Millisecond)
		}
		stop()
		data, _ := os.ReadFile(logPath)
		t.Fatalf("stunnel failed to listen: %s", data)
		return stop
	}
	stopServer := start(serverDir, serverAddr)
	start(clientDir, clientAddr)
	exchange := func(conn net.Conn) error {
		defer conn.Close()
		conn.SetDeadline(time.Now().Add(3 * time.Second))
		payload := []byte("verified-through-real-stunnel")
		if _, err := conn.Write(payload); err != nil {
			return err
		}
		reply := make([]byte, len(payload))
		if _, err := io.ReadFull(conn, reply); err != nil {
			return err
		}
		if !bytes.Equal(payload, reply) {
			return fmt.Errorf("payload mismatch")
		}
		return nil
	}
	conn, err := net.DialTimeout("tcp", clientAddr, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if err = exchange(conn); err != nil {
		t.Fatalf("double stunnel mTLS forwarding failed: %v", err)
	}
	// Exercise stunnel's own checkHost/SNI rejection, not just Go's TLS verifier.
	wrongAddr := freeAddress()
	wrong := makeTunnel("wrong-identity", "client", wrongAddr, serverAddr, clientCert.ID, "wrong.invalid")
	stopWrong := start(extract(wrong), wrongAddr)
	wrongConn, err := net.DialTimeout("tcp", wrongAddr, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if err = exchange(wrongConn); err == nil {
		t.Fatal("stunnel client accepted a mismatched server identity")
	}
	stopWrong()
	roots := x509.NewCertPool()
	roots.AppendCertsFromPEM([]byte(a.PEM))
	pair, err := tls.LoadX509KeyPair(filepath.Join(clientDir, "certificates/cert.pem"), filepath.Join(clientDir, "certificates/key.pem"))
	if err != nil {
		t.Fatal(err)
	}
	dial := func(config *tls.Config) error {
		conn, err := tls.DialWithDialer(&net.Dialer{Timeout: time.Second}, "tcp", serverAddr, config)
		if err != nil {
			return err
		}
		return exchange(conn)
	}
	if err = dial(&tls.Config{RootCAs: roots, ServerName: "localhost", MinVersion: tls.VersionTLS12}); err == nil {
		t.Fatal("server accepted unauthenticated peer")
	}
	if err = dial(&tls.Config{RootCAs: roots, ServerName: "wrong.invalid", Certificates: []tls.Certificate{pair}, MinVersion: tls.VersionTLS12}); err == nil {
		t.Fatal("wrong server identity accepted")
	}
	if err = dial(&tls.Config{RootCAs: roots, ServerName: "localhost", Certificates: []tls.Certificate{pair}, MinVersion: tls.VersionTLS12}); err != nil {
		t.Fatalf("valid direct mTLS failed: %v", err)
	}
	if err = s.Revoke(ctx, clientCert.ID); err != nil {
		t.Fatal(err)
	}
	crl, _, err := s.CRL(ctx, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	stopServer()
	if err = os.WriteFile(filepath.Join(serverDir, "certificates/ca.crl"), crl, 0644); err != nil {
		t.Fatal(err)
	}
	start(serverDir, serverAddr)
	if err = dial(&tls.Config{RootCAs: roots, ServerName: "localhost", Certificates: []tls.Certificate{pair}, MinVersion: tls.VersionTLS12}); err == nil {
		t.Fatal("stunnel accepted revoked client after CRL update")
	}
	t.Log("real stunnel: mTLS forwarding, missing client certificate, wrong hostname, and CRL revocation verified")
}
