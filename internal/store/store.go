// Package store owns SQLite persistence. Mutations and their audit entries commit
// in one transaction; private key ciphertext is never returned by list methods.
package store

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"time"

	"github.com/phil616/stunnel-cp/internal/domain"
	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

type Store struct{ db *sql.DB }

func Open(path string) (*Store, error) {
	if path != ":memory:" {
		f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
		if err != nil {
			return nil, err
		}
		f.Close()
		if err := os.Chmod(path, 0600); err != nil {
			return nil, err
		}
	}
	dsn := "file:" + url.PathEscape(path) + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(FULL)"
	if path == ":memory:" {
		dsn = ":memory:"
	}
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys = ON;"); err != nil {
		db.Close()
		return nil, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		db.Close()
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, schema); err != nil {
		tx.Rollback()
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	if err := tx.Commit(); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error                   { return s.db.Close() }
func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

func audit(ctx context.Context, tx *sql.Tx, action, resource, name string) error {
	_, err := tx.ExecContext(ctx, "INSERT INTO audit(action,resource,name,created_at) VALUES(?,?,?,?)", action, resource, name, time.Now().UTC().Format(time.RFC3339Nano))
	return err
}

func (s *Store) Mutate(ctx context.Context, action, resource, name, query string, args ...any) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return sql.ErrNoRows
	}
	if err := audit(ctx, tx, action, resource, name); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) Record(ctx context.Context, action, resource, name string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := audit(ctx, tx, action, resource, name); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) CreateAuthority(ctx context.Context, a domain.Authority) error {
	data, err := json.Marshal(a)
	if err != nil {
		return err
	}
	return s.Mutate(ctx, "create", "authority", a.Name, "INSERT INTO authorities VALUES(?,?,?,?,?)", a.ID, a.Name, string(data), a.PEM, a.Key)
}
func (s *Store) CreateCertificate(ctx context.Context, c domain.Certificate) error {
	data, err := json.Marshal(c)
	if err != nil {
		return err
	}
	return s.Mutate(ctx, "issue", "certificate", c.Name, "INSERT INTO certificates VALUES(?,?,?,?,?,?)", c.ID, c.CAID, c.Name, string(data), c.PEM, c.Key)
}
func (s *Store) SaveTunnel(ctx context.Context, t domain.Tunnel, create bool) error {
	data, err := json.Marshal(t)
	if err != nil {
		return err
	}
	if create {
		return s.Mutate(ctx, "create", "tunnel", t.Name, "INSERT INTO tunnels VALUES(?,?,?,?)", t.ID, t.CertificateID, t.Name, string(data))
	}
	return s.Mutate(ctx, "update", "tunnel", t.Name, "UPDATE tunnels SET certificate_id=?,name=?,metadata=? WHERE id=?", t.CertificateID, t.Name, string(data), t.ID)
}
func (s *Store) Revoke(ctx context.Context, c domain.Certificate) error {
	data, err := json.Marshal(c)
	if err != nil {
		return err
	}
	return s.Mutate(ctx, "revoke", "certificate", c.Name, "UPDATE certificates SET metadata=? WHERE id=?", string(data), c.ID)
}
func (s *Store) DeleteTunnel(ctx context.Context, t domain.Tunnel) error {
	return s.Mutate(ctx, "delete", "tunnel", t.Name, "DELETE FROM tunnels WHERE id=?", t.ID)
}
func (s *Store) DeleteAuthority(ctx context.Context, a domain.Authority) error {
	return s.Mutate(ctx, "delete", "authority", a.Name, "DELETE FROM authorities WHERE id=?", a.ID)
}

func (s *Store) Authority(ctx context.Context, id string) (a domain.Authority, err error) {
	var data string
	var key []byte
	var cert string
	err = s.db.QueryRowContext(ctx, "SELECT metadata,certificate_pem,encrypted_key FROM authorities WHERE id=?", id).Scan(&data, &cert, &key)
	if err != nil {
		return
	}
	err = json.Unmarshal([]byte(data), &a)
	a.Key = key
	a.PEM = cert
	return
}
func (s *Store) Certificate(ctx context.Context, id string) (c domain.Certificate, err error) {
	var data string
	var key []byte
	var cert string
	err = s.db.QueryRowContext(ctx, "SELECT metadata,certificate_pem,encrypted_key FROM certificates WHERE id=?", id).Scan(&data, &cert, &key)
	if err != nil {
		return
	}
	err = json.Unmarshal([]byte(data), &c)
	c.Key = key
	c.PEM = cert
	return
}
func (s *Store) Tunnel(ctx context.Context, id string) (t domain.Tunnel, err error) {
	var data string
	err = s.db.QueryRowContext(ctx, "SELECT metadata FROM tunnels WHERE id=?", id).Scan(&data)
	if err != nil {
		return
	}
	err = json.Unmarshal([]byte(data), &t)
	return
}

func list[T any](ctx context.Context, tx *sql.Tx, query string) ([]T, error) {
	items := make([]T, 0)
	rows, err := tx.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var data string
		var item T
		if err := rows.Scan(&data); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(data), &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Store) Snapshot(ctx context.Context) (out domain.Snapshot, err error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	if out.Authorities, err = list[domain.Authority](ctx, tx, "SELECT metadata FROM authorities ORDER BY rowid DESC"); err != nil {
		return
	}
	if out.Certificates, err = list[domain.Certificate](ctx, tx, "SELECT metadata FROM certificates ORDER BY rowid DESC"); err != nil {
		return
	}
	if out.Tunnels, err = list[domain.Tunnel](ctx, tx, "SELECT metadata FROM tunnels ORDER BY rowid DESC"); err != nil {
		return
	}
	out.Audit = make([]domain.Audit, 0)
	rows, err := tx.QueryContext(ctx, "SELECT id,action,resource,name,created_at FROM audit ORDER BY id DESC LIMIT 100")
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var a domain.Audit
		var at string
		if err = rows.Scan(&a.ID, &a.Action, &a.Resource, &a.Name, &at); err != nil {
			rows.Close()
			return out, err
		}
		a.CreatedAt, err = time.Parse(time.RFC3339Nano, at)
		if err != nil {
			rows.Close()
			return out, err
		}
		out.Audit = append(out.Audit, a)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return out, err
	}
	return out, tx.Commit()
}

func (s *Store) Configured(ctx context.Context) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, "SELECT count(*) FROM users").Scan(&n)
	return n > 0, err
}
func (s *Store) Setup(ctx context.Context, username string, hash []byte) error {
	return s.Mutate(ctx, "setup", "account", username, "INSERT INTO users VALUES(1,?,?,?)", username, hash, time.Now().UTC().Format(time.RFC3339Nano))
}
func (s *Store) Credentials(ctx context.Context) (username string, hash []byte, err error) {
	err = s.db.QueryRowContext(ctx, "SELECT username,password_hash FROM users WHERE id=1").Scan(&username, &hash)
	return
}
func (s *Store) CreateSession(ctx context.Context, hash string, expires time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, "DELETE FROM sessions WHERE expires_at <= ?", time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO sessions VALUES(?,?,1)", hash, expires.UTC().Format(time.RFC3339Nano)); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM sessions WHERE token_hash NOT IN (SELECT token_hash FROM sessions ORDER BY expires_at DESC LIMIT 20)"); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) ValidSession(ctx context.Context, hash string) (bool, error) {
	var expiry string
	err := s.db.QueryRowContext(ctx, "SELECT expires_at FROM sessions WHERE token_hash=?", hash).Scan(&expiry)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	t, err := time.Parse(time.RFC3339Nano, expiry)
	return time.Now().Before(t), err
}
func (s *Store) DeleteSession(ctx context.Context, hash string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM sessions WHERE token_hash=?", hash)
	return err
}

func (s *Store) VaultCheck(ctx context.Context) ([]byte, error) {
	var value []byte
	err := s.db.QueryRowContext(ctx, "SELECT value FROM settings WHERE key='vault_check'").Scan(&value)
	return value, err
}
func (s *Store) SetVaultCheck(ctx context.Context, value []byte) error {
	_, err := s.db.ExecContext(ctx, "INSERT OR IGNORE INTO settings(key,value) VALUES('vault_check',?)", value)
	return err
}
func (s *Store) ChangePassword(ctx context.Context, oldHash, newHash []byte) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, "UPDATE users SET password_hash=? WHERE id=1 AND password_hash=?", newHash, oldHash)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return sql.ErrNoRows
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM sessions"); err != nil {
		return err
	}
	if err = audit(ctx, tx, "password_change", "account", "administrator"); err != nil {
		return err
	}
	return tx.Commit()
}
