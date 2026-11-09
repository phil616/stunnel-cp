package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var environmentNames = []string{"STCP_ADDR", "STCP_DATA_DIR", "STCP_MASTER_KEY", "STCP_SECURE_COOKIE", "STCP_SESSION_TTL", "STCP_TLS_CERT", "STCP_TLS_KEY"}

func cleanEnvironment(t *testing.T) {
	t.Helper()
	for _, name := range environmentNames {
		t.Setenv(name, "")
	}
}
func configFile(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yml")
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestDefaultsDoNotImplicitlyLoadFile(t *testing.T) {
	cleanEnvironment(t)
	cwd := t.TempDir()
	t.Chdir(cwd)
	if err := os.WriteFile("config.yml", []byte("broken: ["), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := Load("")
	if err != nil {
		t.Fatal(err)
	}
	if got.Address != "127.0.0.1:8080" || got.DataDir != filepath.Join(cwd, "data") || got.SessionTTL != 12*time.Hour || got.SecureCookie || got.MasterKey != "" {
		t.Fatal("defaults changed")
	}
}

func TestFilePathsAndMasterKey(t *testing.T) {
	cleanEnvironment(t)
	t.Chdir(t.TempDir())
	key := strings.Repeat("a", 64)
	path := configFile(t, "addr: '[::1]:8443'\ndata_dir: ./state\nmaster_key: '"+key+"'\nsecure_cookie: false\nsession_ttl: 2h\ntls_cert: ./tls/cert.pem\ntls_key: ./tls/key.pem\n")
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	base := filepath.Dir(path)
	if got.Address != "[::1]:8443" || got.DataDir != filepath.Join(base, "state") || got.TLSCert != filepath.Join(base, "tls", "cert.pem") || got.TLSKey != filepath.Join(base, "tls", "key.pem") {
		t.Fatal("file paths are not relative to the file directory")
	}
	if !got.SecureCookie || got.SessionTTL != 2*time.Hour || got.MasterKey != key {
		t.Fatal("file settings not applied")
	}
	encoded, err := json.Marshal(got)
	if err != nil || strings.Contains(string(encoded), key) {
		t.Fatal("master key exposed by JSON")
	}
}

func TestEnvironmentOverridesFileIncludingFalse(t *testing.T) {
	cleanEnvironment(t)
	cwd := t.TempDir()
	t.Chdir(cwd)
	path := configFile(t, "addr: '127.0.0.1:8081'\ndata_dir: ./file-state\nsecure_cookie: true\nsession_ttl: 2h\nmaster_key: '"+strings.Repeat("a", 64)+"'\n")
	t.Setenv("STCP_ADDR", "127.0.0.1:8082")
	t.Setenv("STCP_DATA_DIR", "./env-state")
	t.Setenv("STCP_SECURE_COOKIE", "false")
	t.Setenv("STCP_SESSION_TTL", "30m")
	t.Setenv("STCP_MASTER_KEY", strings.Repeat("b", 64))
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if got.Address != "127.0.0.1:8082" || got.DataDir != filepath.Join(cwd, "env-state") || got.SecureCookie || got.SessionTTL != 30*time.Minute || got.MasterKey != strings.Repeat("b", 64) {
		t.Fatal("environment precedence failed")
	}
	t.Setenv("STCP_TLS_CERT", "env-cert.pem")
	t.Setenv("STCP_TLS_KEY", "env-key.pem")
	got, err = Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if !got.SecureCookie || got.TLSCert != filepath.Join(cwd, "env-cert.pem") || got.TLSKey != filepath.Join(cwd, "env-key.pem") {
		t.Fatal("TLS paths or secure-cookie enforcement changed")
	}
}

func TestOmittedSettingsAndEmptyEnvironment(t *testing.T) {
	cleanEnvironment(t)
	cwd := t.TempDir()
	t.Chdir(cwd)
	got, err := Load(configFile(t, "{}\n"))
	if err != nil {
		t.Fatal(err)
	}
	if got.DataDir != filepath.Join(cwd, "data") || got.SessionTTL != 12*time.Hour {
		t.Fatal("omitted fields moved the default data directory")
	}
	got, err = Load(configFile(t, "addr: '127.0.0.1:9090'\n"))
	if err != nil || got.Address != "127.0.0.1:9090" {
		t.Fatal("empty environment overrode a file setting")
	}
}

func TestInvalidFileFailsWithoutDisclosingValues(t *testing.T) {
	cleanEnvironment(t)
	const secret = "do-not-disclose-this-value"
	cases := map[string]string{
		"unknown": "unknown_field: true\n", "duplicate": "addr: '127.0.0.1:8080'\naddr: '127.0.0.1:8081'\n",
		"multiple": "addr: '127.0.0.1:8080'\n---\naddr: '127.0.0.1:8081'\n", "trailing broken document": "{}\n---\n[",
		"syntax": "addr: [", "empty": "", "null": "null", "sequence": "- addr: '127.0.0.1:8080'",
		"boolean": "secure_cookie: ['" + secret + "']", "duration type": "session_ttl: [1,2]",
		"blank directory": "data_dir: '   '", "empty directory": "data_dir: ''",
		"address": "addr: '" + secret + "'", "port": "addr: '127.0.0.1:65536'", "named port": "addr: '127.0.0.1:http'",
		"duration": "session_ttl: '" + secret + "'", "short duration": "session_ttl: 1s", "long duration": "session_ttl: 721h",
		"TLS pair": "tls_cert: cert.pem", "master key": "master_key: '" + secret + "'", "master key hex": "master_key: '" + strings.Repeat("g", 64) + "'",
	}
	for name, content := range cases {
		t.Run(name, func(t *testing.T) {
			got, err := Load(configFile(t, content))
			if err == nil {
				t.Fatal("invalid configuration accepted")
			}
			if strings.Contains(err.Error(), secret) || got.MasterKey != "" {
				t.Fatal("configuration error disclosed secret input")
			}
		})
	}
}

func TestInvalidEnvironment(t *testing.T) {
	for name, value := range map[string]string{"STCP_ADDR": "localhost:not-a-port", "STCP_SECURE_COOKIE": "not-a-bool", "STCP_SESSION_TTL": "invalid", "STCP_MASTER_KEY": "private-invalid-value"} {
		t.Run(name, func(t *testing.T) {
			cleanEnvironment(t)
			t.Setenv(name, value)
			if _, err := Load(""); err == nil || strings.Contains(err.Error(), value) {
				t.Fatal("invalid environment accepted or echoed")
			}
		})
	}
}

func TestMissingAndOversizedConfig(t *testing.T) {
	cleanEnvironment(t)
	if _, err := Load(filepath.Join(t.TempDir(), "missing.yml")); err == nil {
		t.Fatal("missing configuration silently ignored")
	}
	if _, err := Load(configFile(t, strings.Repeat("#", maxConfigSize+1))); err == nil {
		t.Fatal("oversized file accepted")
	}
}
