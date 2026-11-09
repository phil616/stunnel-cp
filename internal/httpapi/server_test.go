package httpapi

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/phil616/stunnel-cp/internal/config"
	"github.com/phil616/stunnel-cp/internal/domain"
	"github.com/phil616/stunnel-cp/internal/secure"
	"github.com/phil616/stunnel-cp/internal/service"
	"github.com/phil616/stunnel-cp/internal/store"
)

func testHandler(t *testing.T) (http.Handler, *service.Service) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	v, _ := secure.New(bytes.Repeat([]byte{4}, 32))
	svc := service.New(db, v)
	return New(svc, config.Config{SessionTTL: time.Hour, SecureCookie: true}, fstest.MapFS{"index.html": {Data: []byte("<html>stunnel</html>")}}, slog.New(slog.NewTextHandler(io.Discard, nil))), svc
}
func request(t *testing.T, h http.Handler, method, path string, body any, cookie *http.Cookie, csrf bool, origin string) *httptest.ResponseRecorder {
	t.Helper()
	var b bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&b).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	r := httptest.NewRequest(method, "https://console.test"+path, &b)
	r.Header.Set("Content-Type", "application/json")
	if csrf {
		r.Header.Set("X-CSRF-Protection", "1")
	}
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func requireStatus(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Fatalf("status %d, want %d: %s", w.Code, want, w.Body.String())
	}
}
func setup(t *testing.T, h http.Handler) *http.Cookie {
	t.Helper()
	w := request(t, h, "POST", "/api/auth/setup", map[string]string{"username": "admin", "password": "correct-horse-battery"}, nil, true, "https://console.test")
	requireStatus(t, w, 200)
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatal("missing session")
	}
	return cookies[0]
}
func TestAuthenticationCSRFAndSession(t *testing.T) {
	h, _ := testHandler(t)
	requireStatus(t, request(t, h, "GET", "/api/snapshot", nil, nil, false, ""), 401)
	requireStatus(t, request(t, h, "POST", "/api/auth/setup", map[string]string{}, nil, false, ""), 403)
	requireStatus(t, request(t, h, "POST", "/api/auth/setup", map[string]string{}, nil, true, "https://evil.test"), 403)
	requireStatus(t, request(t, h, "POST", "/api/auth/setup", map[string]string{"username": "admin", "password": "short"}, nil, true, ""), 400)
	cookie := setup(t, h)
	if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteStrictMode {
		t.Fatal("session cookie is not protected")
	}
	requireStatus(t, request(t, h, "POST", "/api/auth/setup", map[string]string{"username": "other", "password": "correct-horse-battery"}, nil, true, ""), 409)
	w := request(t, h, "GET", "/api/snapshot", nil, cookie, false, "")
	requireStatus(t, w, 200)
	if w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("Content-Security-Policy") == "" {
		t.Fatal("missing security headers")
	}
	requireStatus(t, request(t, h, "POST", "/api/authorities", map[string]string{}, cookie, true, "https://evil.test"), 403)
	requireStatus(t, request(t, h, "POST", "/api/auth/logout", nil, cookie, true, ""), 204)
	requireStatus(t, request(t, h, "GET", "/api/snapshot", nil, cookie, false, ""), 401)
	requireStatus(t, request(t, h, "POST", "/api/auth/login", map[string]string{"username": "admin", "password": "wrong"}, nil, true, ""), 401)
	requireStatus(t, request(t, h, "POST", "/api/auth/login", map[string]string{"username": "admin", "password": "correct-horse-battery"}, nil, true, ""), 200)
	requireStatus(t, request(t, h, "GET", "/api/does-not-exist", nil, nil, false, ""), 404)
}
func TestAPIWorkflowAndSecretRedaction(t *testing.T) {
	h, svc := testHandler(t)
	cookie := setup(t, h)
	w := request(t, h, "POST", "/api/authorities", map[string]any{"name": "Root CA", "organization": "Test", "algorithm": "ECDSA-P256", "days": 3650}, cookie, true, "")
	requireStatus(t, w, 201)
	var a domain.Authority
	if err := json.Unmarshal(w.Body.Bytes(), &a); err != nil {
		t.Fatal(err)
	}
	w = request(t, h, "POST", "/api/certificates", map[string]any{"ca_id": a.ID, "name": "server", "common_name": "localhost", "purpose": "server", "sans": []string{"localhost"}, "algorithm": "ECDSA-P256", "days": 365}, cookie, true, "")
	requireStatus(t, w, 201)
	var c domain.Certificate
	if err := json.Unmarshal(w.Body.Bytes(), &c); err != nil {
		t.Fatal(err)
	}
	w = request(t, h, "POST", "/api/tunnels", map[string]any{"name": "api-server", "mode": "server", "accept": "127.0.0.1:6380", "connect": "127.0.0.1:6379", "certificate_id": c.ID, "tls_min": "TLSv1.2", "enabled": true}, cookie, true, "")
	requireStatus(t, w, 201)
	var tunnel domain.Tunnel
	if err := json.Unmarshal(w.Body.Bytes(), &tunnel); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/snapshot", "/api/status", "/api/tunnels/" + tunnel.ID + "/preview"} {
		w = request(t, h, "GET", path, nil, cookie, false, "")
		requireStatus(t, w, 200)
		for _, secret := range []string{"PRIVATE KEY", "encrypted_key", "certificate_pem", "password_hash"} {
			if strings.Contains(w.Body.String(), secret) {
				t.Fatalf("secret leaked via %s", path)
			}
		}
	}
	w = request(t, h, "GET", "/api/tunnels/"+tunnel.ID+"/bundle", nil, cookie, false, "")
	requireStatus(t, w, 200)
	if w.Header().Get("Content-Type") != "application/zip" || !strings.Contains(w.Header().Get("Content-Disposition"), "api-server-unix.zip") {
		t.Fatal("invalid attachment headers")
	}
	// All export endpoints normalize the same explicit target; no platform is persisted.
	for _, query := range []string{"", "?platform=unix", "?platform=Windows", "?platform=%20UNIX%20"} {
		platform := "unix"
		if strings.Contains(query, "Windows") {
			platform = "windows"
		}
		base := "/api/tunnels/" + tunnel.ID
		preview := request(t, h, "GET", base+"/preview"+query, nil, cookie, false, "")
		requireStatus(t, preview, 200)
		var result struct {
			Config   string `json:"config"`
			Platform string `json:"platform"`
		}
		if err := json.Unmarshal(preview.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.Platform != platform {
			t.Fatal("wrong preview platform")
		}
		conf := request(t, h, "GET", base+"/config"+query, nil, cookie, false, "")
		requireStatus(t, conf, 200)
		if conf.Body.String() != result.Config || !strings.Contains(conf.Header().Get("Content-Disposition"), "api-server-"+platform+".conf") {
			t.Fatal("config differs from preview")
		}
		bundle := request(t, h, "GET", base+"/bundle"+query, nil, cookie, false, "")
		requireStatus(t, bundle, 200)
		if !strings.Contains(bundle.Header().Get("Content-Disposition"), "api-server-"+platform+".zip") {
			t.Fatal("wrong bundle filename")
		}
		zr, err := zip.NewReader(bytes.NewReader(bundle.Body.Bytes()), int64(bundle.Body.Len()))
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, f := range zr.File {
			if f.Name == "stunnel.conf" {
				r, e := f.Open()
				if e != nil {
					t.Fatal(e)
				}
				b, e := io.ReadAll(r)
				r.Close()
				if e != nil || string(b) != result.Config {
					t.Fatal("ZIP differs from preview")
				}
				found = true
			}
		}
		if !found {
			t.Fatal("ZIP has no config")
		}
	}
	for _, endpoint := range []string{"preview", "config", "bundle"} {
		path := "/api/tunnels/" + tunnel.ID + "/" + endpoint
		for _, query := range []string{"?platform=linux", "?platform=windows&platform=unix", "?platform=%20", "?platform=%ZZ"} {
			requireStatus(t, request(t, h, "GET", path+query, nil, cookie, false, ""), 400)
		}
		requireStatus(t, request(t, h, "GET", path+"?platform=windows", nil, nil, false, ""), 401)
	}

	requireStatus(t, request(t, h, "DELETE", "/api/authorities/"+a.ID, nil, cookie, true, ""), 409)
	requireStatus(t, request(t, h, "POST", "/api/certificates/"+c.ID+"/revoke", nil, cookie, true, ""), 204)
	requireStatus(t, request(t, h, "GET", "/api/tunnels/"+tunnel.ID+"/bundle?platform=windows", nil, cookie, false, ""), 409)
	w = request(t, h, "GET", "/api/authorities/"+a.ID+"/crl", nil, cookie, false, "")
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), "X509 CRL") {
		t.Fatal("missing CRL")
	}
	requireStatus(t, request(t, h, "POST", "/api/authorities", map[string]any{"unexpected": true}, cookie, true, ""), 400)
	snap, err := svc.Store.Snapshot(context.Background())
	if err != nil || len(snap.Audit) < 7 {
		t.Fatalf("missing audit history: %v", err)
	}
}
func TestLoginRateLimit(t *testing.T) {
	h, _ := testHandler(t)
	for range 10 {
		request(t, h, "POST", "/api/auth/login", map[string]string{}, nil, true, "")
	}
	requireStatus(t, request(t, h, "POST", "/api/auth/login", map[string]string{}, nil, true, ""), 429)
}

func TestPasswordRotationInvalidatesOtherSessions(t *testing.T) {
	h, _ := testHandler(t)
	old := setup(t, h)
	w := request(t, h, "POST", "/api/account/password", map[string]string{"current_password": "wrong", "new_password": "new-strong-password"}, old, true, "")
	requireStatus(t, w, 400)
	w = request(t, h, "POST", "/api/account/password", map[string]string{"current_password": "correct-horse-battery", "new_password": "new-strong-password"}, old, true, "")
	requireStatus(t, w, 200)
	next := w.Result().Cookies()[0]
	requireStatus(t, request(t, h, "GET", "/api/snapshot", nil, old, false, ""), 401)
	requireStatus(t, request(t, h, "GET", "/api/snapshot", nil, next, false, ""), 200)
	requireStatus(t, request(t, h, "POST", "/api/auth/login", map[string]string{"username": "admin", "password": "correct-horse-battery"}, nil, true, ""), 401)
	requireStatus(t, request(t, h, "POST", "/api/auth/login", map[string]string{"username": "admin", "password": "new-strong-password"}, nil, true, ""), 200)
}

func TestStylesHavePerResponseCSPNonce(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "nonce.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	vault, _ := secure.New(bytes.Repeat([]byte{4}, 32))
	assets := fstest.MapFS{"index.html": {Data: []byte(`<html><meta name="csp-nonce" content="__STCP_CSP_NONCE__"></html>`)}}
	h := New(service.New(db, vault), config.Config{SessionTTL: time.Hour}, assets, slog.New(slog.NewTextHandler(io.Discard, nil)))
	first := request(t, h, "GET", "/", nil, nil, false, "")
	requireStatus(t, first, 200)
	nonce := first.Header().Get("X-Request-ID")
	if len(nonce) != 32 || !strings.Contains(first.Body.String(), `content="`+nonce+`"`) {
		t.Fatal("HTML nonce not populated")
	}
	policy := first.Header().Get("Content-Security-Policy")
	if !strings.Contains(policy, "style-src 'self' 'nonce-"+nonce+"'") || !strings.Contains(policy, "script-src 'self';") {
		t.Fatal("unexpected CSP")
	}
	second := request(t, h, "GET", "/index.html", nil, nil, false, "")
	requireStatus(t, second, 200)
	if second.Header().Get("X-Request-ID") == nonce || strings.Contains(second.Body.String(), "__STCP_CSP_NONCE__") {
		t.Fatal("nonce reused or missing")
	}
}
