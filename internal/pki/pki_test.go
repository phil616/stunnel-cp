package pki

import (
	"crypto/x509"
	"encoding/pem"
	"testing"
	"time"

	"github.com/phil616/stunnel-cp/internal/domain"
)

func TestCertificatePurposesSANsAndCRL(t *testing.T) {
	ca, err := CreateCA("Test Root", "Test Org", "ECDSA-P256", 3650)
	if err != nil {
		t.Fatal(err)
	}
	if !ca.Certificate.IsCA || ca.Certificate.MaxPathLen != 0 || !ca.Certificate.MaxPathLenZero {
		t.Fatal("root constraints missing")
	}
	roots := x509.NewCertPool()
	roots.AddCert(ca.Certificate)
	server, err := Issue(ca.PEM, ca.Key, "server", "server", "ECDSA-P256", []string{"localhost", "127.0.0.1", "::1"}, 365)
	if err != nil {
		t.Fatal(err)
	}
	client, err := Issue(ca.PEM, ca.Key, "client", "client", "RSA-3072", nil, 365)
	if err != nil {
		t.Fatal(err)
	}
	for _, host := range []string{"localhost", "127.0.0.1", "::1"} {
		if _, err = server.Certificate.Verify(x509.VerifyOptions{Roots: roots, DNSName: host, KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = client.Certificate.Verify(x509.VerifyOptions{Roots: roots, KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}}); err != nil {
		t.Fatal(err)
	}
	if _, err = client.Certificate.Verify(x509.VerifyOptions{Roots: roots, KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}); err == nil {
		t.Fatal("client certificate accepted for server authentication")
	}
	if _, err = server.Certificate.Verify(x509.VerifyOptions{Roots: roots, DNSName: "attacker.invalid"}); err == nil {
		t.Fatal("wrong hostname accepted")
	}
	revokedAt := time.Now().UTC().Truncate(time.Second)
	crlPEM, next, err := CRL(ca.PEM, ca.Key, []domain.Certificate{{Serial: client.Certificate.SerialNumber.String(), RevokedAt: &revokedAt}, {Serial: server.Certificate.SerialNumber.String()}})
	if err != nil {
		t.Fatal(err)
	}
	block, _ := pem.Decode(crlPEM)
	if block == nil {
		t.Fatal("invalid CRL PEM")
	}
	crl, err := x509.ParseRevocationList(block.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	if err = crl.CheckSignatureFrom(ca.Certificate); err != nil {
		t.Fatal(err)
	}
	if len(crl.RevokedCertificateEntries) != 1 || crl.RevokedCertificateEntries[0].SerialNumber.Cmp(client.Certificate.SerialNumber) != 0 {
		t.Fatal("wrong revocation entries")
	}
	if time.Until(next) > 7*24*time.Hour || time.Until(next) < 6*24*time.Hour {
		t.Fatal("unexpected CRL expiry")
	}
	if _, err = Issue(ca.PEM, ca.Key, "long", "client", "ECDSA-P256", nil, 4000); err == nil {
		t.Fatal("leaf outlived CA")
	}
}
