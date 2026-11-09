// Package config loads defaults, an optional YAML file, and environment overrides.
package config

import (
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"go.yaml.in/yaml/v4"
)

const maxConfigSize = 1 << 20

type Config struct {
	Address      string
	DataDir      string
	MasterKey    string `json:"-"`
	SecureCookie bool
	SessionTTL   time.Duration
	TLSCert      string
	TLSKey       string
}

// Pointers distinguish omitted paths from explicitly configured paths. Defaults
// and environment paths retain their original working-directory semantics.
type fileConfig struct {
	Address      *string `yaml:"addr"`
	DataDir      *string `yaml:"data_dir"`
	MasterKey    *string `yaml:"master_key"`
	SecureCookie *bool   `yaml:"secure_cookie"`
	SessionTTL   *string `yaml:"session_ttl"`
	TLSCert      *string `yaml:"tls_cert"`
	TLSKey       *string `yaml:"tls_key"`
}

// Load reads only the explicitly selected file. Nonempty environment variables
// take precedence over file values, which take precedence over defaults.
func Load(configPath string) (Config, error) {
	c := Config{Address: "127.0.0.1:8080", DataDir: "./data"}
	ttl := "12h"
	if configPath != "" {
		f, base, err := readFile(configPath)
		if err != nil {
			return Config{}, err
		}
		if f.Address != nil {
			c.Address = *f.Address
		}
		if f.DataDir != nil {
			c.DataDir = filePath(base, *f.DataDir)
		}
		if f.MasterKey != nil {
			c.MasterKey = *f.MasterKey
		}
		if f.SecureCookie != nil {
			c.SecureCookie = *f.SecureCookie
		}
		if f.SessionTTL != nil {
			ttl = *f.SessionTTL
		}
		if f.TLSCert != nil {
			c.TLSCert = filePath(base, *f.TLSCert)
		}
		if f.TLSKey != nil {
			c.TLSKey = filePath(base, *f.TLSKey)
		}
	}
	override("STCP_ADDR", &c.Address)
	override("STCP_DATA_DIR", &c.DataDir)
	override("STCP_MASTER_KEY", &c.MasterKey)
	override("STCP_TLS_CERT", &c.TLSCert)
	override("STCP_TLS_KEY", &c.TLSKey)
	override("STCP_SESSION_TTL", &ttl)
	if value := os.Getenv("STCP_SECURE_COOKIE"); value != "" {
		var err error
		c.SecureCookie, err = strconv.ParseBool(value)
		if err != nil {
			return Config{}, fmt.Errorf("invalid STCP_SECURE_COOKIE: expected true or false")
		}
	}
	_, port, err := net.SplitHostPort(c.Address)
	if err != nil {
		return Config{}, fmt.Errorf("addr / STCP_ADDR must be a valid host:port address")
	}
	number, err := strconv.Atoi(port)
	if err != nil || number < 0 || number > 65535 {
		return Config{}, fmt.Errorf("addr / STCP_ADDR port must be a number between 0 and 65535")
	}
	if strings.TrimSpace(c.DataDir) == "" {
		return Config{}, fmt.Errorf("data_dir / STCP_DATA_DIR must not be empty")
	}
	if (c.TLSCert == "") != (c.TLSKey == "") {
		return Config{}, fmt.Errorf("tls_cert and tls_key / STCP_TLS_CERT and STCP_TLS_KEY must be set together")
	}
	if c.TLSCert != "" {
		c.SecureCookie = true
	}
	c.SessionTTL, err = time.ParseDuration(ttl)
	if err != nil || c.SessionTTL < time.Minute || c.SessionTTL > 30*24*time.Hour {
		return Config{}, fmt.Errorf("session_ttl / STCP_SESSION_TTL must be a duration between 1m and 720h")
	}
	if c.MasterKey != "" {
		key, err := hex.DecodeString(c.MasterKey)
		if err != nil || len(key) != 32 {
			return Config{}, fmt.Errorf("master_key / STCP_MASTER_KEY must contain 64 hexadecimal characters")
		}
	}
	for _, path := range []*string{&c.DataDir, &c.TLSCert, &c.TLSKey} {
		if *path == "" {
			continue
		}
		absolute, err := filepath.Abs(*path)
		if err != nil {
			return Config{}, fmt.Errorf("resolve configured path: %w", err)
		}
		*path = absolute
	}
	return c, nil
}

func readFile(path string) (*fileConfig, string, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, "", fmt.Errorf("resolve config file: %w", err)
	}
	f, err := os.Open(absolute)
	if err != nil {
		return nil, "", fmt.Errorf("open config file: %w", err)
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxConfigSize+1))
	if err != nil {
		return nil, "", fmt.Errorf("read config file: %w", err)
	}
	if len(data) > maxConfigSize {
		return nil, "", fmt.Errorf("config file exceeds 1 MiB")
	}
	var c *fileConfig
	if err := yaml.Load(data, &c, yaml.WithKnownFields(), yaml.WithUniqueKeys()); err != nil {
		// Decoder errors may quote input values, including a master key. Do not
		// include the original error or source excerpts in startup logs.
		return nil, "", fmt.Errorf("invalid YAML config: check syntax, field names, duplicate fields, and value types")
	}
	if c == nil {
		return nil, "", fmt.Errorf("config file must contain a YAML mapping")
	}
	return c, filepath.Dir(absolute), nil
}

func filePath(base, value string) string {
	if strings.TrimSpace(value) == "" || filepath.IsAbs(value) {
		return value
	}
	return filepath.Join(base, value)
}

func override(name string, target *string) {
	if value := os.Getenv(name); value != "" {
		*target = value
	}
}
