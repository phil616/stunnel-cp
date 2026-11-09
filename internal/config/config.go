package config

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"
)

type Config struct {
	Address      string
	DataDir      string
	SecureCookie bool
	SessionTTL   time.Duration
	TLSCert      string
	TLSKey       string
}

func Load() (Config, error) {
	c := Config{Address: env("STCP_ADDR", "127.0.0.1:8080"), DataDir: env("STCP_DATA_DIR", "./data"), SecureCookie: os.Getenv("STCP_SECURE_COOKIE") == "true", SessionTTL: 12 * time.Hour, TLSCert: os.Getenv("STCP_TLS_CERT"), TLSKey: os.Getenv("STCP_TLS_KEY")}
	if _, _, err := net.SplitHostPort(c.Address); err != nil {
		return c, fmt.Errorf("invalid STCP_ADDR: %w", err)
	}
	if (c.TLSCert == "") != (c.TLSKey == "") {
		return c, fmt.Errorf("STCP_TLS_CERT and STCP_TLS_KEY must be set together")
	}
	if c.TLSCert != "" {
		c.SecureCookie = true
	}
	path, err := filepath.Abs(c.DataDir)
	if err != nil {
		return c, err
	}
	c.DataDir = path
	return c, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
