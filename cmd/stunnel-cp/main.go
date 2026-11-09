package main

import (
	"context"
	"crypto/tls"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/phil616/stunnel-cp/internal/buildinfo"
	"github.com/phil616/stunnel-cp/internal/config"
	"github.com/phil616/stunnel-cp/internal/httpapi"
	"github.com/phil616/stunnel-cp/internal/secure"
	"github.com/phil616/stunnel-cp/internal/service"
	"github.com/phil616/stunnel-cp/internal/store"
	"github.com/phil616/stunnel-cp/web"
)

func main() {
	showVersion := flag.Bool("version", false, "Print version and exit")
	flag.Parse()
	if *showVersion {
		fmt.Printf("stunnel-cp %s\ncommit: %s\nbuilt: %s\n", buildinfo.Version, buildinfo.Commit, buildinfo.Date)
		return
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if err = os.MkdirAll(cfg.DataDir, 0700); err != nil {
		return err
	}
	if err = os.Chmod(cfg.DataDir, 0700); err != nil {
		return err
	}
	// Refuse to silently generate a new master key for an existing database.
	keyPath := filepath.Join(cfg.DataDir, "master.key")
	dbPath := filepath.Join(cfg.DataDir, "stunnel.db")
	if info, e := os.Stat(dbPath); e == nil && info.Size() > 0 && os.Getenv("STCP_MASTER_KEY") == "" {
		if _, e = os.Stat(keyPath); e != nil {
			return errors.New("existing database has no master.key; restore the original master key")
		}
	}
	key, err := secure.LoadKey(keyPath, os.Getenv("STCP_MASTER_KEY"))
	if err != nil {
		return err
	}
	vault, err := secure.New(key)
	if err != nil {
		return err
	}
	db, err := store.Open(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()
	svc := service.New(db, vault)
	if err := svc.CheckVault(context.Background()); err != nil {
		return err
	}
	srv := &http.Server{Addr: cfg.Address, Handler: httpapi.New(svc, cfg, web.Assets(), logger), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 << 10, TLSConfig: &tls.Config{MinVersion: tls.VersionTLS12}}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	result := make(chan error, 1)
	go func() {
		scheme := "http"
		if cfg.TLSCert != "" {
			scheme = "https"
		}
		logger.Info("stunnel control plane listening", "url", scheme+"://"+cfg.Address, "data_dir", cfg.DataDir)
		if cfg.TLSCert != "" {
			result <- srv.ListenAndServeTLS(cfg.TLSCert, cfg.TLSKey)
		} else {
			result <- srv.ListenAndServe()
		}
	}()
	select {
	case err := <-result:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdown)
	}
}
