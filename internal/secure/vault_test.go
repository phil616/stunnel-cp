package secure

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestVaultAuthenticatesIdentityAndCiphertext(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	v, err := New(key)
	if err != nil {
		t.Fatal(err)
	}
	plain := []byte("sensitive private key")
	sealed, err := v.Seal(plain, "certificate-a")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(sealed, plain) {
		t.Fatal("plaintext leaked")
	}
	opened, err := v.Open(sealed, "certificate-a")
	if err != nil || !bytes.Equal(opened, plain) {
		t.Fatalf("roundtrip: %v", err)
	}
	if _, err = v.Open(sealed, "certificate-b"); err == nil {
		t.Fatal("accepted wrong identity")
	}
	sealed[len(sealed)-1] ^= 1
	if _, err = v.Open(sealed, "certificate-a"); err == nil {
		t.Fatal("accepted tampering")
	}
	for _, data := range [][]byte{nil, {1, 2, 3}} {
		if _, err = v.Open(data, "certificate-a"); err == nil {
			t.Fatal("accepted truncated ciphertext")
		}
	}
	other, _ := New(bytes.Repeat([]byte{8}, 32))
	if _, err = other.Open(sealed, "certificate-a"); err == nil {
		t.Fatal("accepted wrong master key")
	}
}
func TestLoadKeyPersistsWithPrivatePermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "master.key")
	key, err := LoadKey(path, "")
	if err != nil {
		t.Fatal(err)
	}
	again, err := LoadKey(path, "")
	if err != nil || !bytes.Equal(key, again) {
		t.Fatal("master key was not preserved")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("unsafe permissions: %v", info.Mode())
	}
	if _, err = LoadKey(path, "bad"); err == nil {
		t.Fatal("accepted malformed environment key")
	}
}
