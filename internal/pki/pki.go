// Package pki implements a private, single-tier CA with narrowly scoped leaf
// certificates. All key generation and signing use crypto/rand and crypto/x509.
package pki

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"math/big"
	"net"
	"time"

	"github.com/phil616/stunnel-cp/internal/domain"
)

type Material struct {
	Certificate *x509.Certificate
	PEM         string
	Key         []byte
}

func generateKey(algorithm string) (crypto.Signer, error) {
	switch algorithm {
	case "ECDSA-P256":
		return ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	case "RSA-3072":
		return rsa.GenerateKey(rand.Reader, 3072)
	default:
		return nil, errors.New("unsupported key algorithm")
	}
}
func serial() (*big.Int, error) {
	n, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 159))
	if err != nil {
		return nil, err
	}
	return n.Add(n, big.NewInt(1)), nil
}
func encode(template, parent *x509.Certificate, key, signer crypto.Signer) (Material, error) {
	der, err := x509.CreateCertificate(rand.Reader, template, parent, key.Public(), signer)
	if err != nil {
		return Material{}, err
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return Material{}, err
	}
	pk, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return Material{}, err
	}
	return Material{Certificate: cert, PEM: string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})), Key: pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: pk})}, nil
}
func CreateCA(name, organization, algorithm string, days int) (Material, error) {
	key, err := generateKey(algorithm)
	if err != nil {
		return Material{}, err
	}
	sn, err := serial()
	if err != nil {
		return Material{}, err
	}
	now := time.Now().UTC()
	template := &x509.Certificate{SerialNumber: sn, Subject: pkix.Name{CommonName: name, Organization: []string{organization}}, NotBefore: now.Add(-5 * time.Minute), NotAfter: now.AddDate(0, 0, days), IsCA: true, BasicConstraintsValid: true, MaxPathLen: 0, MaxPathLenZero: true, KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageCRLSign | x509.KeyUsageDigitalSignature}
	return encode(template, template, key, key)
}
func Parse(certPEM string, keyPEM []byte) (*x509.Certificate, crypto.Signer, error) {
	cb, _ := pem.Decode([]byte(certPEM))
	kb, _ := pem.Decode(keyPEM)
	if cb == nil || kb == nil {
		return nil, nil, errors.New("invalid PEM material")
	}
	cert, err := x509.ParseCertificate(cb.Bytes)
	if err != nil {
		return nil, nil, err
	}
	key, err := x509.ParsePKCS8PrivateKey(kb.Bytes)
	if err != nil {
		return nil, nil, err
	}
	signer, ok := key.(crypto.Signer)
	if !ok {
		return nil, nil, errors.New("unsupported signing key")
	}
	return cert, signer, nil
}
func Issue(caPEM string, caKey []byte, cn, purpose, algorithm string, sans []string, days int) (Material, error) {
	ca, signer, err := Parse(caPEM, caKey)
	if err != nil {
		return Material{}, err
	}
	key, err := generateKey(algorithm)
	if err != nil {
		return Material{}, err
	}
	sn, err := serial()
	if err != nil {
		return Material{}, err
	}
	now := time.Now().UTC()
	expiry := now.AddDate(0, 0, days)
	if expiry.After(ca.NotAfter) {
		return Material{}, errors.New("certificate lifetime exceeds CA lifetime")
	}
	template := &x509.Certificate{SerialNumber: sn, Subject: pkix.Name{CommonName: cn, Organization: ca.Subject.Organization}, NotBefore: now.Add(-5 * time.Minute), NotAfter: expiry, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageDigitalSignature}
	if algorithm == "RSA-3072" {
		template.KeyUsage |= x509.KeyUsageKeyEncipherment
	}
	if purpose == "server" {
		template.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}
	} else {
		template.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}
	}
	for _, san := range sans {
		if ip := net.ParseIP(san); ip != nil {
			template.IPAddresses = append(template.IPAddresses, ip)
		} else {
			template.DNSNames = append(template.DNSNames, san)
		}
	}
	return encode(template, ca, key, signer)
}
func Fingerprint(cert *x509.Certificate) string {
	sum := sha256.Sum256(cert.Raw)
	return hex.EncodeToString(sum[:])
}

func CRL(caPEM string, caKey []byte, certificates []domain.Certificate) ([]byte, time.Time, error) {
	ca, key, err := Parse(caPEM, caKey)
	if err != nil {
		return nil, time.Time{}, err
	}
	now := time.Now().UTC()
	next := now.Add(7 * 24 * time.Hour)
	if next.After(ca.NotAfter) {
		next = ca.NotAfter
	}
	entries := make([]x509.RevocationListEntry, 0)
	for _, c := range certificates {
		if c.RevokedAt != nil {
			sn, ok := new(big.Int).SetString(c.Serial, 10)
			if !ok {
				return nil, time.Time{}, errors.New("invalid certificate serial")
			}
			entries = append(entries, x509.RevocationListEntry{SerialNumber: sn, RevocationTime: *c.RevokedAt, ReasonCode: 0})
		}
	}
	der, err := x509.CreateRevocationList(rand.Reader, &x509.RevocationList{Number: big.NewInt(now.UnixNano()), ThisUpdate: now.Add(-time.Minute), NextUpdate: next, RevokedCertificateEntries: entries}, ca, key)
	if err != nil {
		return nil, time.Time{}, err
	}
	return pem.EncodeToMemory(&pem.Block{Type: "X509 CRL", Bytes: der}), next, nil
}
