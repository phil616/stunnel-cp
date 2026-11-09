package service

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io/fs"
	"time"
)

type file struct {
	Name    string
	Content []byte
	Mode    fs.FileMode
}

func archive(files []file) ([]byte, error) {
	var b bytes.Buffer
	zw := zip.NewWriter(&b)
	for _, f := range files {
		header := &zip.FileHeader{Name: f.Name, Method: zip.Deflate}
		header.SetMode(f.Mode)
		header.Modified = time.Now().UTC()
		w, err := zw.CreateHeader(header)
		if err != nil {
			return nil, err
		}
		if _, err = w.Write(f.Content); err != nil {
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}

func (s *Service) ExportCertificate(ctx context.Context, id string) ([]byte, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, err := s.Store.Certificate(ctx, id)
	if err != nil {
		return nil, "", err
	}
	if !usable(c) {
		return nil, "", Conflict("已过期或吊销的证书不能导出私钥")
	}
	a, err := s.Store.Authority(ctx, c.CAID)
	if err != nil {
		return nil, "", err
	}
	key, err := s.Vault.Open(c.Key, c.ID)
	if err != nil {
		return nil, "", err
	}
	crl, next, err := s.crl(ctx, a.ID)
	if err != nil {
		return nil, "", err
	}
	data, err := archive([]file{{"cert.pem", []byte(c.PEM), 0644}, {"key.pem", key, 0600}, {"ca.pem", []byte(a.PEM), 0644}, {"ca.crl", crl, 0644}, {"README.txt", []byte(fmt.Sprintf("Private key: keep key.pem secret and chmod 600 key.pem.\nCRL expires at %s; refresh it before expiry and after revocation.\n", next.Format(time.RFC3339))), 0644}})
	if err != nil {
		return nil, "", err
	}
	if err = s.Store.Record(ctx, "export", "certificate", c.Name); err != nil {
		return nil, "", err
	}
	return data, "certificate-" + c.ID[:12] + ".zip", nil
}

func (s *Service) ExportTunnel(ctx context.Context, id string, bundle bool, platform Platform) ([]byte, string, error) {
	platform, err := ParsePlatform(string(platform))
	if err != nil {
		return nil, "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	t, err := s.Store.Tunnel(ctx, id)
	if err != nil {
		return nil, "", err
	}
	if !t.Enabled {
		return nil, "", Conflict("请先启用此配置，再导出部署文件")
	}
	c, err := s.Store.Certificate(ctx, t.CertificateID)
	if err != nil {
		return nil, "", err
	}
	if !usable(c) {
		return nil, "", Conflict("关联证书已过期或吊销，请更换证书")
	}
	config, err := Config(t, platform)
	if err != nil {
		return nil, "", err
	}
	conf := []byte(config)
	name := t.Name + "-" + string(platform) + ".conf"
	if bundle {
		a, err := s.Store.Authority(ctx, c.CAID)
		if err != nil {
			return nil, "", err
		}
		key, err := s.Vault.Open(c.Key, c.ID)
		if err != nil {
			return nil, "", err
		}
		crl, next, err := s.crl(ctx, a.ID)
		if err != nil {
			return nil, "", err
		}
		readme := renderDeploymentReadme(t, platform, next)

		conf, err = archive([]file{{"stunnel.conf", conf, 0644}, {"certificates/cert.pem", []byte(c.PEM), 0644}, {"certificates/key.pem", key, 0600}, {"certificates/ca.pem", []byte(a.PEM), 0644}, {"certificates/ca.crl", crl, 0644}, {"README.md", []byte(readme), 0644}})
		if err != nil {
			return nil, "", err
		}
		name = t.Name + "-" + string(platform) + ".zip"
	}
	if err = s.Store.Record(ctx, "export", "tunnel", t.Name); err != nil {
		return nil, "", err
	}
	return conf, name, nil
}
