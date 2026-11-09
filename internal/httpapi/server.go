// Package httpapi exposes the authenticated JSON API and embedded SPA.
package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/phil616/stunnel-cp/internal/buildinfo"
	"github.com/phil616/stunnel-cp/internal/config"
	"github.com/phil616/stunnel-cp/internal/domain"
	"github.com/phil616/stunnel-cp/internal/service"
	"golang.org/x/crypto/bcrypt"
)

type Server struct {
	svc     *service.Service
	config  config.Config
	log     *slog.Logger
	limiter limiter
}
type handler func(http.ResponseWriter, *http.Request) error
type contextKey string

const requestIDKey contextKey = "request_id"
const cookieName = "stcp_session"

func New(svc *service.Service, cfg config.Config, assets fs.FS, logger *slog.Logger) http.Handler {
	s := &Server{svc: svc, config: cfg, log: logger, limiter: limiter{entries: map[string]bucket{}}}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.wrap(func(w http.ResponseWriter, r *http.Request) error {
		if err := svc.Store.Ping(r.Context()); err != nil {
			return err
		}
		return writeJSON(w, 200, map[string]string{"status": "ok"})
	}))
	mux.HandleFunc("GET /api/status", s.wrap(s.status))
	mux.HandleFunc("POST /api/auth/setup", s.wrap(s.setup))
	mux.HandleFunc("POST /api/auth/login", s.wrap(s.login))
	mux.HandleFunc("POST /api/auth/logout", s.protect(s.logout))
	mux.HandleFunc("POST /api/account/password", s.protect(s.changePassword))
	mux.HandleFunc("GET /api/snapshot", s.protect(func(w http.ResponseWriter, r *http.Request) error {
		snap, err := svc.Store.Snapshot(r.Context())
		if err != nil {
			return err
		}
		return writeJSON(w, 200, snap)
	}))
	mux.HandleFunc("POST /api/authorities", s.protect(func(w http.ResponseWriter, r *http.Request) error {
		var in service.CAInput
		if err := decode(r, &in); err != nil {
			return err
		}
		a, err := svc.CreateCA(r.Context(), in)
		if err != nil {
			return err
		}
		return writeJSON(w, 201, a)
	}))
	mux.HandleFunc("DELETE /api/authorities/{id}", s.protect(func(w http.ResponseWriter, r *http.Request) error {
		if err := svc.DeleteCA(r.Context(), r.PathValue("id")); err != nil {
			return err
		}
		w.WriteHeader(204)
		return nil
	}))
	mux.HandleFunc("GET /api/authorities/{id}/certificate", s.protect(s.caCertificate))
	mux.HandleFunc("GET /api/authorities/{id}/crl", s.protect(s.caCRL))
	mux.HandleFunc("POST /api/certificates", s.protect(func(w http.ResponseWriter, r *http.Request) error {
		var in service.CertificateInput
		if err := decode(r, &in); err != nil {
			return err
		}
		c, err := svc.Issue(r.Context(), in)
		if err != nil {
			return err
		}
		return writeJSON(w, 201, c)
	}))
	mux.HandleFunc("POST /api/certificates/{id}/revoke", s.protect(func(w http.ResponseWriter, r *http.Request) error {
		if err := svc.Revoke(r.Context(), r.PathValue("id")); err != nil {
			return err
		}
		w.WriteHeader(204)
		return nil
	}))
	mux.HandleFunc("GET /api/certificates/{id}/bundle", s.protect(func(w http.ResponseWriter, r *http.Request) error {
		data, name, err := svc.ExportCertificate(r.Context(), r.PathValue("id"))
		if err != nil {
			return err
		}
		return download(w, data, name, "application/zip")
	}))
	mux.HandleFunc("POST /api/tunnels", s.protect(func(w http.ResponseWriter, r *http.Request) error { return s.saveTunnel(w, r, "") }))
	mux.HandleFunc("PUT /api/tunnels/{id}", s.protect(func(w http.ResponseWriter, r *http.Request) error { return s.saveTunnel(w, r, r.PathValue("id")) }))
	mux.HandleFunc("DELETE /api/tunnels/{id}", s.protect(func(w http.ResponseWriter, r *http.Request) error {
		if err := svc.DeleteTunnel(r.Context(), r.PathValue("id")); err != nil {
			return err
		}
		w.WriteHeader(204)
		return nil
	}))
	mux.HandleFunc("GET /api/tunnels/{id}/preview", s.protect(func(w http.ResponseWriter, r *http.Request) error {
		platform, err := exportPlatform(r)
		if err != nil {
			return err
		}
		t, err := svc.Store.Tunnel(r.Context(), r.PathValue("id"))
		if err != nil {
			return err
		}
		config, err := service.Config(t, platform)
		if err != nil {
			return err
		}
		return writeJSON(w, 200, map[string]string{"config": config, "platform": string(platform)})
	}))
	mux.HandleFunc("GET /api/tunnels/{id}/config", s.protect(func(w http.ResponseWriter, r *http.Request) error {
		platform, err := exportPlatform(r)
		if err != nil {
			return err
		}
		data, name, err := svc.ExportTunnel(r.Context(), r.PathValue("id"), false, platform)
		if err != nil {
			return err
		}
		return download(w, data, name, "text/plain; charset=utf-8")
	}))
	mux.HandleFunc("GET /api/tunnels/{id}/bundle", s.protect(func(w http.ResponseWriter, r *http.Request) error {
		platform, err := exportPlatform(r)
		if err != nil {
			return err
		}
		data, name, err := svc.ExportTunnel(r.Context(), r.PathValue("id"), true, platform)
		if err != nil {
			return err
		}
		return download(w, data, name, "application/zip")
	}))
	mux.HandleFunc("/api/", s.wrap(func(w http.ResponseWriter, r *http.Request) error { return service.NotFound() }))
	files := http.FileServer(http.FS(assets))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			s.fail(w, r, &service.Error{Status: 405, Message: "不支持此请求方法"})
			return
		}
		if r.URL.Path != "/" {
			if _, err := fs.Stat(assets, strings.TrimPrefix(r.URL.Path, "/")); err != nil {
				http.NotFound(w, r)
				return
			}
		}
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			index, err := fs.ReadFile(assets, "index.html")
			if err != nil {
				s.fail(w, r, err)
				return
			}
			nonce, _ := r.Context().Value(requestIDKey).(string)
			html := strings.ReplaceAll(string(index), "__STCP_CSP_NONCE__", nonce)
			http.ServeContent(w, r, "index.html", time.Time{}, strings.NewReader(html))
			return
		}
		files.ServeHTTP(w, r)
	})
	return s.middleware(mux)
}

func writeJSON(w http.ResponseWriter, status int, value any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(value)
}
func decode(r *http.Request, dest any) error {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		return &service.Error{Status: 415, Message: "请使用 application/json"}
	}
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(dest); err != nil {
		return service.Invalid("请求 JSON 格式错误或包含未知字段")
	}
	if err := d.Decode(new(any)); !errors.Is(err, io.EOF) {
		return service.Invalid("请求体只能包含一个 JSON 对象")
	}
	return nil
}
func download(w http.ResponseWriter, data []byte, name, contentType string) error {
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": name}))
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", fmt.Sprint(len(data)))
	_, err := w.Write(data)
	return err
}
func (s *Server) wrap(h handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := h(w, r); err != nil {
			s.fail(w, r, err)
		}
	}
}
func (s *Server) protect(h handler) http.HandlerFunc {
	return s.wrap(func(w http.ResponseWriter, r *http.Request) error {
		ok, err := s.authenticated(r)
		if err != nil {
			return err
		}
		if !ok {
			return &service.Error{Status: 401, Message: "请先登录"}
		}
		return h(w, r)
	})
}
func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	status, message := 500, "操作失败，请检查服务日志"
	var e *service.Error
	var sqliteErr interface{ Code() int }
	switch {
	case errors.As(err, &e):
		status, message = e.Status, e.Message
	case errors.Is(err, sql.ErrNoRows):
		status, message = 404, "资源不存在"
	case errors.As(err, &sqliteErr) && sqliteErr.Code()&255 == 19:
		status, message = 409, "名称已存在，或资源仍被其他配置引用"
	default:
		s.log.Error("request failed", "error", err, "request_id", r.Context().Value(requestIDKey))
	}
	_ = writeJSON(w, status, map[string]any{"error": message, "request_id": r.Context().Value(requestIDKey)})
}
func (s *Server) saveTunnel(w http.ResponseWriter, r *http.Request, id string) error {
	var in struct {
		Name          string `json:"name"`
		Description   string `json:"description"`
		Mode          string `json:"mode"`
		Accept        string `json:"accept"`
		Connect       string `json:"connect"`
		CertificateID string `json:"certificate_id"`
		PeerName      string `json:"peer_name"`
		TLSMin        string `json:"tls_min"`
		Enabled       bool   `json:"enabled"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	t, err := s.svc.SaveTunnel(r.Context(), domain.Tunnel{Name: in.Name, Description: in.Description, Mode: in.Mode, Accept: in.Accept, Connect: in.Connect, CertificateID: in.CertificateID, PeerName: in.PeerName, TLSMin: in.TLSMin, Enabled: in.Enabled}, id)
	if err != nil {
		return err
	}
	status := 200
	if id == "" {
		status = 201
	}
	return writeJSON(w, status, t)
}
func (s *Server) caCertificate(w http.ResponseWriter, r *http.Request) error {
	a, err := s.svc.Store.Authority(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	if err = s.svc.Store.Record(r.Context(), "export", "authority", a.Name); err != nil {
		return err
	}
	return download(w, []byte(a.PEM), "ca-"+a.ID[:12]+".pem", "application/x-pem-file")
}
func (s *Server) caCRL(w http.ResponseWriter, r *http.Request) error {
	id := r.PathValue("id")
	data, _, err := s.svc.CRL(r.Context(), id)
	if err != nil {
		return err
	}
	if err = s.svc.Store.Record(r.Context(), "export", "crl", id); err != nil {
		return err
	}
	return download(w, data, "ca-"+id[:12]+".crl", "application/pkix-crl")
}

func hashToken(value string) string {
	hash := sha256.Sum256([]byte(value))
	return hex.EncodeToString(hash[:])
}
func (s *Server) authenticated(r *http.Request) (bool, error) {
	cookie, err := r.Cookie(cookieName)
	if err != nil {
		return false, nil
	}
	if len(cookie.Value) != 64 {
		return false, nil
	}
	return s.svc.Store.ValidSession(r.Context(), hashToken(cookie.Value))
}
func (s *Server) status(w http.ResponseWriter, r *http.Request) error {
	configured, err := s.svc.Store.Configured(r.Context())
	if err != nil {
		return err
	}
	ok, err := s.authenticated(r)
	if err != nil {
		return err
	}
	username := ""
	if ok {
		username, _, err = s.svc.Store.Credentials(r.Context())
		if err != nil {
			return err
		}
	}
	return writeJSON(w, 200, map[string]any{"setup_required": !configured, "authenticated": ok, "username": username, "version": buildinfo.Version})
}

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

var usernamePattern = regexp.MustCompile(`^[a-zA-Z0-9_.-]{3,32}$`)

func (s *Server) setup(w http.ResponseWriter, r *http.Request) error {
	if !s.limiter.allow(r.RemoteAddr) {
		return &service.Error{Status: 429, Message: "尝试次数过多，请一分钟后重试"}
	}
	configured, err := s.svc.Store.Configured(r.Context())
	if err != nil {
		return err
	}
	if configured {
		return service.Conflict("系统已完成初始化，请登录")
	}
	var in credentials
	if err = decode(r, &in); err != nil {
		return err
	}
	if !usernamePattern.MatchString(in.Username) || len(in.Password) < 12 || len(in.Password) > 72 {
		return service.Invalid("用户名需为 3–32 位字母、数字或 _.-，密码需为 12–72 字节")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), 12)
	if err != nil {
		return err
	}
	if err = s.svc.Store.Setup(r.Context(), in.Username, hash); err != nil {
		return err
	}
	return s.session(w, r, in.Username)
}
func (s *Server) login(w http.ResponseWriter, r *http.Request) error {
	if !s.limiter.allow(r.RemoteAddr) {
		return &service.Error{Status: 429, Message: "尝试次数过多，请一分钟后重试"}
	}
	var in credentials
	if err := decode(r, &in); err != nil {
		return err
	}
	username, hash, err := s.svc.Store.Credentials(r.Context())
	if errors.Is(err, sql.ErrNoRows) {
		return service.Conflict("请先初始化管理员账户")
	}
	if err != nil {
		return err
	}
	// Always evaluate the password hash, even for an unknown username.
	validPassword := bcrypt.CompareHashAndPassword(hash, []byte(in.Password)) == nil
	if subtle.ConstantTimeCompare([]byte(username), []byte(in.Username)) != 1 || !validPassword {
		return &service.Error{Status: 401, Message: "用户名或密码错误"}
	}
	if err = s.svc.Store.Record(r.Context(), "login", "account", username); err != nil {
		return err
	}
	return s.session(w, r, username)
}
func (s *Server) session(w http.ResponseWriter, r *http.Request, username string) error {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return err
	}
	token := hex.EncodeToString(buf)
	expiry := time.Now().Add(s.config.SessionTTL)
	if err := s.svc.Store.CreateSession(r.Context(), hashToken(token), expiry); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: token, Path: "/", HttpOnly: true, Secure: s.config.SecureCookie, SameSite: http.SameSiteStrictMode, MaxAge: int(s.config.SessionTTL.Seconds()), Expires: expiry})
	return writeJSON(w, 200, map[string]string{"username": username})
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) error {
	if cookie, err := r.Cookie(cookieName); err == nil {
		if err = s.svc.Store.DeleteSession(r.Context(), hashToken(cookie.Value)); err != nil {
			return err
		}
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", HttpOnly: true, Secure: s.config.SecureCookie, SameSite: http.SameSiteStrictMode, MaxAge: -1})
	w.WriteHeader(204)
	return nil
}

type bucket struct {
	start time.Time
	count int
}
type limiter struct {
	mu      sync.Mutex
	entries map[string]bucket
}

func (l *limiter) allow(remote string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	ip, _, err := net.SplitHostPort(remote)
	if err != nil {
		ip = remote
	}
	now := time.Now()
	for k, v := range l.entries {
		if now.Sub(v.start) > time.Minute {
			delete(l.entries, k)
		}
	}
	b := l.entries[ip]
	if now.Sub(b.start) > time.Minute {
		b = bucket{start: now}
	}
	b.count++
	l.entries[ip] = b
	return b.count <= 10 && len(l.entries) <= 10000
}

type response struct {
	http.ResponseWriter
	status int
}

func (w *response) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
		w.ResponseWriter.WriteHeader(status)
	}
}
func (w *response) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(200)
	}
	return w.ResponseWriter.Write(data)
}
func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		buf := make([]byte, 16)
		if _, err := rand.Read(buf); err != nil {
			http.Error(w, "entropy unavailable", 500)
			return
		}
		id := hex.EncodeToString(buf)
		r = r.WithContext(context.WithValue(r.Context(), requestIDKey, id))
		rw := &response{ResponseWriter: w}
		rw.Header().Set("X-Request-ID", id)
		rw.Header().Set("X-Content-Type-Options", "nosniff")
		rw.Header().Set("X-Frame-Options", "DENY")
		rw.Header().Set("Referrer-Policy", "no-referrer")
		rw.Header().Set("Cache-Control", "no-store")
		rw.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'nonce-"+id+"'; style-src-attr 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		if s.config.SecureCookie {
			rw.Header().Set("Strict-Transport-Security", "max-age=31536000")
		}
		defer func() {
			if recovered := recover(); recovered != nil {
				s.log.Error("panic recovered", "request_id", id, "panic", fmt.Sprint(recovered))
				if rw.status == 0 {
					s.fail(rw, r, errors.New("internal panic"))
				}
			}
			status := rw.status
			if status == 0 {
				status = 200
			}
			s.log.Info("http request", "request_id", id, "method", r.Method, "path", r.URL.Path, "status", status, "duration_ms", time.Since(start).Milliseconds())
		}()
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			if r.Header.Get("X-CSRF-Protection") != "1" {
				s.fail(rw, r, &service.Error{Status: 403, Message: "缺少请求来源校验标记"})
				return
			}
			if origin := r.Header.Get("Origin"); origin != "" {
				u, err := url.Parse(origin)
				if err != nil || u.Host != r.Host || (u.Scheme != "http" && u.Scheme != "https") {
					s.fail(rw, r, &service.Error{Status: 403, Message: "不允许跨站请求"})
					return
				}
			}
			if site := r.Header.Get("Sec-Fetch-Site"); site == "cross-site" {
				s.fail(rw, r, &service.Error{Status: 403, Message: "不允许跨站请求"})
				return
			}
		}
		r.Body = http.MaxBytesReader(rw, r.Body, 16<<10)
		next.ServeHTTP(rw, r)
	})
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) error {
	if !s.limiter.allow(r.RemoteAddr) {
		return &service.Error{Status: 429, Message: "尝试次数过多，请一分钟后重试"}
	}
	var in struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if len(in.New) < 12 || len(in.New) > 72 {
		return service.Invalid("新密码需为 12–72 字节")
	}
	username, hash, err := s.svc.Store.Credentials(r.Context())
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword(hash, []byte(in.Current)) != nil {
		return service.Invalid("当前密码错误")
	}
	next, err := bcrypt.GenerateFromPassword([]byte(in.New), 12)
	if err != nil {
		return err
	}
	if err = s.svc.Store.ChangePassword(r.Context(), hash, next); errors.Is(err, sql.ErrNoRows) {
		return service.Conflict("账户密码已更改，请重新登录")
	} else if err != nil {
		return err
	}
	return s.session(w, r, username)
}

func exportPlatform(r *http.Request) (service.Platform, error) {
	values, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		return "", service.Invalid("导出参数格式错误")
	}
	if len(values["platform"]) > 1 {
		return "", service.Invalid("目标平台只能指定一次")
	}
	return service.ParsePlatform(values.Get("platform"))
}
