package service

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
)

// CheckVault binds this database to its master key and rejects a wrong key at
// startup, before accepting requests that could create mixed-key records.
func (s *Service) CheckVault(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	const identity = "stunnel-cp/vault-check/v1"
	want := []byte("stunnel-cp master key verification")
	sealed, err := s.Store.VaultCheck(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		sealed, err = s.Vault.Seal(want, identity)
		if err != nil {
			return err
		}
		if err = s.Store.SetVaultCheck(ctx, sealed); err != nil {
			return err
		}
		sealed, err = s.Store.VaultCheck(ctx)
	}
	if err != nil {
		return err
	}
	plain, err := s.Vault.Open(sealed, identity)
	if err != nil || !bytes.Equal(plain, want) {
		return errors.New("master key does not match database; restore the original master.key or STCP_MASTER_KEY")
	}
	return nil
}
