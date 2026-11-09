// Package secure protects private keys at rest. The master key must be backed up
// together with the database, and must never be included in deployment bundles.
package secure

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
)

type Vault struct{ aead cipher.AEAD }

func New(key []byte) (*Vault, error) {
	if len(key) != 32 {
		return nil, errors.New("master key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Vault{aead: aead}, nil
}

// LoadKey uses exclusive creation so concurrent first starts cannot overwrite a key.
func LoadKey(path, envHex string) ([]byte, error) {
	if envHex != "" {
		key, err := hex.DecodeString(envHex)
		if err != nil || len(key) != 32 {
			return nil, errors.New("STCP_MASTER_KEY must contain 64 hexadecimal characters")
		}
		return key, nil
	}
	key, err := os.ReadFile(path)
	if err == nil {
		if len(key) != 32 {
			return nil, errors.New("invalid master key file")
		}
		if err := os.Chmod(path, 0600); err != nil {
			return nil, err
		}
		return key, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	key = make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return nil, fmt.Errorf("create master key: %w", err)
	}
	defer f.Close()
	if _, err := f.Write(key); err != nil {
		return nil, err
	}
	if err := f.Sync(); err != nil {
		return nil, err
	}
	return key, nil
}

func (v *Vault) Seal(plain []byte, identity string) ([]byte, error) {
	nonce := make([]byte, v.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return v.aead.Seal(nonce, nonce, plain, []byte(identity)), nil
}

func (v *Vault) Open(sealed []byte, identity string) ([]byte, error) {
	n := v.aead.NonceSize()
	if len(sealed) < n {
		return nil, errors.New("invalid encrypted private key")
	}
	return v.aead.Open(nil, sealed[:n], sealed[n:], []byte(identity))
}
