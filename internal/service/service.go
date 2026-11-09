// Package service coordinates validation, PKI, encrypted persistence and exports.
package service

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/phil616/stunnel-cp/internal/domain"
	"github.com/phil616/stunnel-cp/internal/pki"
	"github.com/phil616/stunnel-cp/internal/secure"
	"github.com/phil616/stunnel-cp/internal/store"
)

type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string      { return e.Message }
func Invalid(message string) error  { return &Error{400, message} }
func Conflict(message string) error { return &Error{409, message} }
func NotFound() error               { return &Error{404, "资源不存在"} }

type Service struct {
	Store *store.Store
	Vault *secure.Vault
	mu    sync.Mutex
}

func New(s *store.Store, v *secure.Vault) *Service { return &Service{Store: s, Vault: v} }
func newID() (string, error) {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	return hex.EncodeToString(b), err
}
func textOK(value string, min, max int) bool {
	if !utf8.ValidString(value) || len([]rune(value)) < min || len([]rune(value)) > max {
		return false
	}
	for _, r := range value {
		if unicode.IsControl(r) {
			return false
		}
	}
	return value == strings.TrimSpace(value)
}

type CAInput struct {
	Name         string `json:"name"`
	Organization string `json:"organization"`
	Algorithm    string `json:"algorithm"`
	Days         int    `json:"days"`
}
type CertificateInput struct {
	CAID       string   `json:"ca_id"`
	Name       string   `json:"name"`
	CommonName string   `json:"common_name"`
	Purpose    string   `json:"purpose"`
	SANs       []string `json:"sans"`
	Algorithm  string   `json:"algorithm"`
	Days       int      `json:"days"`
}

func validAlgorithm(value string) bool { return value == "ECDSA-P256" || value == "RSA-3072" }

func (s *Service) CreateCA(ctx context.Context, in CAInput) (domain.Authority, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var a domain.Authority
	if !textOK(in.Name, 1, 80) || !textOK(in.Organization, 1, 120) {
		return a, Invalid("请填写有效的 CA 名称和组织名称")
	}
	if !validAlgorithm(in.Algorithm) || in.Days < 1 || in.Days > 7300 {
		return a, Invalid("请选择支持的算法，有效期范围为 1–7300 天")
	}
	m, err := pki.CreateCA(in.Name, in.Organization, in.Algorithm, in.Days)
	if err != nil {
		return a, err
	}
	id, err := newID()
	if err != nil {
		return a, err
	}
	key, err := s.Vault.Seal(m.Key, id)
	if err != nil {
		return a, err
	}
	a = domain.Authority{ID: id, Name: in.Name, Organization: in.Organization, Algorithm: in.Algorithm, Serial: m.Certificate.SerialNumber.String(), Fingerprint: pki.Fingerprint(m.Certificate), NotBefore: m.Certificate.NotBefore, NotAfter: m.Certificate.NotAfter, CreatedAt: time.Now().UTC(), PEM: m.PEM, Key: key}
	return a, s.Store.CreateAuthority(ctx, a)
}

var dnsLabel = regexp.MustCompile(`^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$`)

func validDNS(host string, wildcard bool) bool {
	if wildcard {
		host = strings.TrimPrefix(host, "*.")
	}
	if len(host) > 253 || host == "" {
		return false
	}
	for _, label := range strings.Split(host, ".") {
		if !dnsLabel.MatchString(label) {
			return false
		}
	}
	return true
}
func (s *Service) Issue(ctx context.Context, in CertificateInput) (domain.Certificate, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var c domain.Certificate
	if !textOK(in.Name, 1, 80) || !textOK(in.CommonName, 1, 64) {
		return c, Invalid("请填写证书名称和通用名称（CN，最多 64 字符）")
	}
	if in.Purpose != "server" && in.Purpose != "client" {
		return c, Invalid("证书用途必须为 server 或 client")
	}
	if !validAlgorithm(in.Algorithm) || in.Days < 1 || in.Days > 825 {
		return c, Invalid("请选择支持的算法，有效期范围为 1–825 天")
	}
	if len(in.SANs) > 64 || (in.Purpose == "server" && len(in.SANs) == 0) {
		return c, Invalid("服务端证书至少需要一个 SAN，最多 64 个")
	}
	sans := make([]string, 0, len(in.SANs))
	seen := map[string]bool{}
	for _, san := range in.SANs {
		if net.ParseIP(san) == nil && !validDNS(san, true) {
			return c, Invalid("SAN 必须是有效的 DNS 名称或 IP 地址")
		}
		san = strings.ToLower(san)
		if !seen[san] {
			sans = append(sans, san)
			seen[san] = true
		}
	}
	a, err := s.Store.Authority(ctx, in.CAID)
	if errors.Is(err, sql.ErrNoRows) {
		return c, Invalid("请选择有效的签发 CA")
	}
	if err != nil {
		return c, err
	}
	if !time.Now().Before(a.NotAfter) {
		return c, Conflict("该 CA 已过期")
	}
	if time.Now().AddDate(0, 0, in.Days).After(a.NotAfter) {
		return c, Invalid("证书有效期不能超过 CA 剩余有效期")
	}
	key, err := s.Vault.Open(a.Key, a.ID)
	if err != nil {
		return c, err
	}
	m, err := pki.Issue(a.PEM, key, in.CommonName, in.Purpose, in.Algorithm, sans, in.Days)
	if err != nil {
		return c, err
	}
	id, err := newID()
	if err != nil {
		return c, err
	}
	sealed, err := s.Vault.Seal(m.Key, id)
	if err != nil {
		return c, err
	}
	c = domain.Certificate{ID: id, CAID: a.ID, Name: in.Name, CommonName: in.CommonName, Purpose: in.Purpose, SANs: sans, Algorithm: in.Algorithm, Serial: m.Certificate.SerialNumber.String(), Fingerprint: pki.Fingerprint(m.Certificate), NotBefore: m.Certificate.NotBefore, NotAfter: m.Certificate.NotAfter, CreatedAt: time.Now().UTC(), PEM: m.PEM, Key: sealed}
	return c, s.Store.CreateCertificate(ctx, c)
}

var tunnelName = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`)

func endpointOK(value string) bool {
	host, port, err := net.SplitHostPort(value)
	if err != nil || (net.ParseIP(host) == nil && !validDNS(host, false)) {
		return false
	}
	p, err := strconv.Atoi(port)
	return err == nil && p >= 1 && p <= 65535 && strconv.Itoa(p) == port
}
func usable(c domain.Certificate) bool {
	now := time.Now()
	return c.RevokedAt == nil && now.Before(c.NotAfter) && !now.Before(c.NotBefore)
}
func (s *Service) SaveTunnel(ctx context.Context, t domain.Tunnel, id string) (domain.Tunnel, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !tunnelName.MatchString(t.Name) {
		return t, Invalid("隧道名称使用 1–64 位字母、数字、连字符或下划线")
	}
	if !textOK(t.Description, 0, 500) {
		return t, Invalid("描述最多 500 字符且不能含控制字符")
	}
	if t.Mode != "server" && t.Mode != "client" {
		return t, Invalid("请选择服务端或客户端模式")
	}
	if !endpointOK(t.Accept) || !endpointOK(t.Connect) {
		return t, Invalid("监听和目标地址必须为有效的 host:port（IPv6 使用 [::1]:端口）")
	}
	if t.TLSMin != "TLSv1.2" && t.TLSMin != "TLSv1.3" {
		return t, Invalid("最低 TLS 版本必须为 TLSv1.2 或 TLSv1.3")
	}
	if t.Mode == "client" && net.ParseIP(t.PeerName) == nil && !validDNS(t.PeerName, false) {
		return t, Invalid("客户端模式必须指定服务端证书的 DNS 名称或 IP")
	}
	if t.Mode == "server" {
		t.PeerName = ""
	}
	c, err := s.Store.Certificate(ctx, t.CertificateID)
	if errors.Is(err, sql.ErrNoRows) {
		return t, Invalid("请选择有效的证书")
	}
	if err != nil {
		return t, err
	}
	if c.Purpose != t.Mode || (t.Enabled && !usable(c)) {
		return t, Invalid("证书用途必须与隧道模式一致；启用配置需要未过期、未吊销的证书")
	}
	if id == "" {
		t.ID, err = newID()
		if err != nil {
			return t, err
		}
		t.CreatedAt = time.Now().UTC()
	} else {
		old, err := s.Store.Tunnel(ctx, id)
		if errors.Is(err, sql.ErrNoRows) {
			return t, NotFound()
		}
		if err != nil {
			return t, err
		}
		t.ID = id
		t.CreatedAt = old.CreatedAt
	}
	t.UpdatedAt = time.Now().UTC()
	return t, s.Store.SaveTunnel(ctx, t, id == "")
}
func (s *Service) Revoke(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, err := s.Store.Certificate(ctx, id)
	if err != nil {
		return err
	}
	if c.RevokedAt != nil {
		return Conflict("证书已吊销")
	}
	now := time.Now().UTC()
	c.RevokedAt = &now
	return s.Store.Revoke(ctx, c)
}
func (s *Service) DeleteTunnel(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, err := s.Store.Tunnel(ctx, id)
	if err != nil {
		return err
	}
	return s.Store.DeleteTunnel(ctx, t)
}
func (s *Service) DeleteCA(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, err := s.Store.Authority(ctx, id)
	if err != nil {
		return err
	}
	return s.Store.DeleteAuthority(ctx, a)
}
func (s *Service) CRL(ctx context.Context, id string) ([]byte, time.Time, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.crl(ctx, id)
}
func (s *Service) crl(ctx context.Context, id string) ([]byte, time.Time, error) {
	a, err := s.Store.Authority(ctx, id)
	if err != nil {
		return nil, time.Time{}, err
	}
	if !time.Now().Before(a.NotAfter) {
		return nil, time.Time{}, Conflict("CA 已过期，无法签发有效 CRL")
	}
	key, err := s.Vault.Open(a.Key, a.ID)
	if err != nil {
		return nil, time.Time{}, err
	}
	snap, err := s.Store.Snapshot(ctx)
	if err != nil {
		return nil, time.Time{}, err
	}
	certs := make([]domain.Certificate, 0)
	for _, c := range snap.Certificates {
		if c.CAID == id {
			certs = append(certs, c)
		}
	}
	return pki.CRL(a.PEM, key, certs)
}

func Config(t domain.Tunnel) string {
	var b strings.Builder
	fmt.Fprintf(&b, "; Generated by stunnel control plane\n; Run from the extracted bundle directory\nforeground = yes\npid =\ndebug = notice\n\n[%s]\nclient = %s\naccept = %s\nconnect = %s\ncert = certificates/cert.pem\nkey = certificates/key.pem\nCAfile = certificates/ca.pem\nCRLfile = certificates/ca.crl\nverifyChain = yes\nrequireCert = yes\nsslVersionMin = %s\n", t.Name, map[bool]string{true: "yes", false: "no"}[t.Mode == "client"], t.Accept, t.Connect, t.TLSMin)
	if t.Mode == "client" {
		if net.ParseIP(t.PeerName) != nil {
			fmt.Fprintf(&b, "checkIP = %s\n", t.PeerName)
		} else {
			fmt.Fprintf(&b, "checkHost = %s\nsni = %s\n", t.PeerName, t.PeerName)
		}
	}
	return b.String()
}
