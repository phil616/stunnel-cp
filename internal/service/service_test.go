package service

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/phil616/stunnel-cp/internal/domain"
	"github.com/phil616/stunnel-cp/internal/secure"
	"github.com/phil616/stunnel-cp/internal/store"
)

func testService(t *testing.T) *Service {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	v, err := secure.New(bytes.Repeat([]byte{1}, 32))
	if err != nil {
		t.Fatal(err)
	}
	return New(db, v)
}
func fixtures(t *testing.T, s *Service) (domain.Authority, domain.Certificate, domain.Tunnel) {
	t.Helper()
	ctx := context.Background()
	a, err := s.CreateCA(ctx, CAInput{Name: "Test CA", Organization: "Test Org", Algorithm: "ECDSA-P256", Days: 3650})
	if err != nil {
		t.Fatal(err)
	}
	c, err := s.Issue(ctx, CertificateInput{CAID: a.ID, Name: "Test server", CommonName: "localhost", Purpose: "server", Algorithm: "ECDSA-P256", SANs: []string{"localhost", "127.0.0.1"}, Days: 365})
	if err != nil {
		t.Fatal(err)
	}
	tunnel, err := s.SaveTunnel(ctx, domain.Tunnel{Name: "test-server", Mode: "server", Accept: "127.0.0.1:6380", Connect: "127.0.0.1:6379", CertificateID: c.ID, TLSMin: "TLSv1.2", Enabled: true}, "")
	if err != nil {
		t.Fatal(err)
	}
	return a, c, tunnel
}
func TestDeploymentBundleAndRevocation(t *testing.T) {
	s := testService(t)
	a, c, tunnel := fixtures(t, s)
	ctx := context.Background()
	stored, err := s.Store.Certificate(ctx, c.ID)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(stored.Key, []byte("PRIVATE KEY")) {
		t.Fatal("database contains plaintext private key")
	}
	data, _, err := s.ExportTunnel(ctx, tunnel.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{"stunnel.conf": false, "certificates/cert.pem": false, "certificates/key.pem": false, "certificates/ca.pem": false, "certificates/ca.crl": false, "README.md": false}
	for _, f := range reader.File {
		if _, ok := want[f.Name]; !ok {
			t.Fatalf("unexpected deployment file %s", f.Name)
		}
		want[f.Name] = true
		r, err := f.Open()
		if err != nil {
			t.Fatal(err)
		}
		content, err := io.ReadAll(r)
		r.Close()
		if err != nil {
			t.Fatal(err)
		}
		if f.Name == "certificates/key.pem" {
			if f.Mode().Perm() != 0600 {
				t.Fatal("private key ZIP permissions")
			}
			if !bytes.Contains(content, []byte("PRIVATE KEY")) {
				t.Fatal("no private key")
			}
		}
		if f.Name == "stunnel.conf" {
			for _, directive := range []string{"verifyChain = yes", "requireCert = yes", "CRLfile = certificates/ca.crl", "sslVersionMin = TLSv1.2"} {
				if !strings.Contains(string(content), directive) {
					t.Fatalf("missing %s", directive)
				}
			}
		}
	}
	for name, found := range want {
		if !found {
			t.Fatalf("missing file %s", name)
		}
	}
	if err = s.DeleteCA(ctx, a.ID); err == nil {
		t.Fatal("deleted CA with issued certificates")
	}
	if err = s.Revoke(ctx, c.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err = s.ExportTunnel(ctx, tunnel.ID, true); err == nil {
		t.Fatal("exported revoked tunnel")
	}
	if _, _, err = s.ExportCertificate(ctx, c.ID); err == nil {
		t.Fatal("exported revoked certificate key")
	}
	snap, err := s.Store.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	tunnel.Enabled = false
	if _, err = s.SaveTunnel(ctx, tunnel, tunnel.ID); err != nil {
		t.Fatalf("cannot disable a tunnel with a revoked certificate: %v", err)
	}
	if snap.Certificates[0].RevokedAt == nil {
		t.Fatal("revocation not persisted")
	}
	found := false
	for _, a := range snap.Audit {
		if a.Action == "revoke" {
			found = true
		}
	}
	if !found {
		t.Fatal("revocation not audited")
	}
}
func TestInputRejectsConfigInjectionAndWrongPurpose(t *testing.T) {
	s := testService(t)
	a, c, tunnel := fixtures(t, s)
	ctx := context.Background()
	cases := []domain.Tunnel{tunnel, tunnel, tunnel, tunnel, tunnel, tunnel}
	cases[0].Name = "x]\nexec = /bin/sh"
	cases[1].Connect = "localhost:443\nverifyChain = no"
	cases[2].Accept = "127.0.0.1:0"
	cases[3].Mode = "client"
	cases[3].PeerName = "localhost"
	cases[4].TLSMin = "TLSv1"
	cases[5].Connect = "a b:443"
	for _, in := range cases {
		_, err := s.SaveTunnel(ctx, in, "")
		var e *Error
		if !errors.As(err, &e) || e.Status != 400 {
			t.Fatalf("invalid input accepted: %+v / %v", in, err)
		}
	}
	if _, err := s.Issue(ctx, CertificateInput{CAID: a.ID, Name: "bad", CommonName: "bad", Purpose: "server", Algorithm: "ECDSA-P256", SANs: []string{"a\nverifyChain=no"}, Days: 3}); err == nil {
		t.Fatal("bad SAN accepted")
	}
	if _, err := s.SaveTunnel(ctx, domain.Tunnel{Name: "client", Mode: "client", CertificateID: c.ID, TLSMin: "TLSv1.2", Accept: "127.0.0.1:9000", Connect: "localhost:6380", PeerName: "localhost"}, ""); err == nil {
		t.Fatal("wrong EKU accepted")
	}
}
func TestDatabasePersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "persist.db")
	db, err := store.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	v, _ := secure.New(bytes.Repeat([]byte{1}, 32))
	s := New(db, v)
	_, c, tunnel := fixtures(t, s)
	if err = db.Close(); err != nil {
		t.Fatal(err)
	}
	db, err = store.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s = New(db, v)
	if _, _, err = s.ExportTunnel(context.Background(), tunnel.ID, true); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("database file permissions: %v", err)
	}
	snap, err := s.Store.Snapshot(context.Background())
	if err != nil || len(snap.Certificates) != 1 || snap.Certificates[0].ID != c.ID {
		t.Fatal("data lost on reopen")
	}
}

func TestVaultRejectsWrongMasterKey(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.CheckVault(ctx); err != nil {
		t.Fatal(err)
	}
	if err := s.CheckVault(ctx); err != nil {
		t.Fatal(err)
	}
	wrong, _ := secure.New(bytes.Repeat([]byte{9}, 32))
	other := New(s.Store, wrong)
	if err := other.CheckVault(ctx); err == nil {
		t.Fatal("wrong master key accepted at startup")
	}
}
