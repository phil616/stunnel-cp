package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestParseArgs(t *testing.T) {
	cases := []struct {
		args    []string
		path    string
		version bool
	}{
		{nil, "", false}, {[]string{"serve"}, "", false},
		{[]string{"serve", "-c", "config.yml"}, "config.yml", false},
		{[]string{"-c", "config.yml", "serve"}, "config.yml", false},
		{[]string{"-c=config.yml"}, "config.yml", false},
		{[]string{"serve", "--config", "config.yml"}, "config.yml", false},
		{[]string{"--version"}, "", true}, {[]string{"serve", "--version"}, "", true},
	}
	for _, tc := range cases {
		t.Run(strings.Join(tc.args, " "), func(t *testing.T) {
			got, err := parseArgs(tc.args)
			if err != nil || got.configPath != tc.path || got.version != tc.version {
				t.Fatalf("unexpected CLI parsing: %v", err)
			}
		})
	}
	for _, args := range [][]string{{"unknown"}, {"serve", "extra"}, {"serve", "serve"}, {"-c"}, {"serve", "-c"}, {"serve", "-c", ""}, {"-c", "", "serve"}, {"--unknown"}, {"serve", "--unknown"}, {"help", "other"}} {
		if _, err := parseArgs(args); err == nil {
			t.Fatalf("invalid arguments accepted: %q", args)
		}
	}
	for _, args := range [][]string{{"-h"}, {"--help"}, {"serve", "--help"}, {"help"}, {"help", "serve"}} {
		if _, err := parseArgs(args); !errors.Is(err, flag.ErrHelp) {
			t.Fatalf("help failed: %q %v", args, err)
		}
	}
}

func TestHelpVersionAndInvalidArgumentsDoNotStartServer(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "must-not-create")
	t.Setenv("STCP_DATA_DIR", dataDir)
	t.Setenv("STCP_ADDR", "invalid")
	cases := []struct {
		args   []string
		code   int
		output string
	}{
		{[]string{"serve", "--help"}, 0, "Usage:"}, {[]string{"--version"}, 0, "commit:"},
		{[]string{"serve", "-c", "missing.yml", "--version"}, 0, "commit:"},
		{[]string{"serve", "extra"}, 2, ""}, {[]string{"--unknown"}, 2, ""},
	}
	for _, tc := range cases {
		var stdout, stderr bytes.Buffer
		if code := execute(tc.args, &stdout, &stderr); code != tc.code {
			t.Fatalf("exit code %d, want %d", code, tc.code)
		}
		if tc.output != "" && (!strings.Contains(stdout.String(), tc.output) || stderr.Len() != 0) {
			t.Fatal("help or version output missing")
		}
		if tc.code == 2 && stderr.Len() == 0 {
			t.Fatal("invalid CLI arguments did not report an error")
		}
	}
	if _, err := os.Stat(dataDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("non-server commands created a data directory")
	}
}

// Run the same CLI entrypoint in an isolated process without inheriting any
// application configuration. No production data directories are used.
func TestCLIHelperProcess(t *testing.T) {
	if os.Getenv("STCP_CLI_HELPER_PROCESS") != "1" {
		return
	}
	for i, arg := range os.Args {
		if arg == "--" {
			os.Exit(execute(os.Args[i+1:], os.Stdout, os.Stderr))
		}
	}
	os.Exit(99)
}

func TestServeWithYAMLAndFileMasterKey(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "config with spaces.yml")
	content := "addr: 127.0.0.1:0\ndata_dir: ./state\nmaster_key: '" + strings.Repeat("a", 64) + "'\nsession_ttl: 1h\n"
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	for _, args := range [][]string{{"serve", "-c", path}, {"-c", path, "serve"}, {"-c", path}, nil} {
		name := "legacy"
		if len(args) != 0 {
			name = args[0]
		}
		t.Run(name, func(t *testing.T) {
			cmd := exec.Command(os.Args[0], append([]string{"-test.run=^TestCLIHelperProcess$", "--"}, args...)...)
			for _, value := range os.Environ() {
				name, _, _ := strings.Cut(value, "=")
				if !strings.HasPrefix(strings.ToUpper(name), "STCP_") {
					cmd.Env = append(cmd.Env, value)
				}
			}
			cmd.Env = append(cmd.Env, "STCP_CLI_HELPER_PROCESS=1")
			if len(args) == 0 {
				cmd.Env = append(cmd.Env, "STCP_ADDR=127.0.0.1:0", "STCP_DATA_DIR="+filepath.Join(root, "state"), "STCP_MASTER_KEY="+strings.Repeat("a", 64))
			}
			stdout, err := cmd.StdoutPipe()
			if err != nil {
				t.Fatal(err)
			}
			var stderr bytes.Buffer
			cmd.Stderr = &stderr
			if err = cmd.Start(); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { cmd.Process.Kill(); cmd.Wait() })
			address := make(chan string, 1)
			go func() {
				scanner := bufio.NewScanner(stdout)
				for scanner.Scan() {
					var record struct {
						Msg string
						URL string
					}
					if json.Unmarshal(scanner.Bytes(), &record) == nil && record.Msg == "stunnel control plane listening" {
						address <- record.URL
					}
				}
				close(address)
			}()
			var url string
			select {
			case url = <-address:
			case <-time.After(15 * time.Second):
				t.Fatal("CLI did not start")
			}
			if url == "" {
				t.Fatal("CLI exited before opening a listener")
			}
			client := http.Client{Timeout: 3 * time.Second}
			response, err := client.Get(url + "/api/status")
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			var status map[string]any
			if err = json.NewDecoder(response.Body).Decode(&status); err != nil || response.StatusCode != 200 || status["setup_required"] != true {
				t.Fatal("configured server did not respond")
			}
			if _, err = os.Stat(filepath.Join(root, "state", "stunnel.db")); err != nil {
				t.Fatal("file-relative data directory not used")
			}
			if _, err = os.Stat(filepath.Join(root, "state", "master.key")); !errors.Is(err, os.ErrNotExist) {
				t.Fatal("file-supplied master key ignored")
			}
		})
	}
}
