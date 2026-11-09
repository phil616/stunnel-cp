package domain

import "time"

type Authority struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Organization string    `json:"organization"`
	Algorithm    string    `json:"algorithm"`
	Serial       string    `json:"serial"`
	Fingerprint  string    `json:"fingerprint"`
	NotBefore    time.Time `json:"not_before"`
	NotAfter     time.Time `json:"not_after"`
	CreatedAt    time.Time `json:"created_at"`
	PEM          string    `json:"-"`
	Key          []byte    `json:"-"`
}

type Certificate struct {
	ID          string     `json:"id"`
	CAID        string     `json:"ca_id"`
	Name        string     `json:"name"`
	CommonName  string     `json:"common_name"`
	Purpose     string     `json:"purpose"`
	SANs        []string   `json:"sans"`
	Algorithm   string     `json:"algorithm"`
	Serial      string     `json:"serial"`
	Fingerprint string     `json:"fingerprint"`
	NotBefore   time.Time  `json:"not_before"`
	NotAfter    time.Time  `json:"not_after"`
	RevokedAt   *time.Time `json:"revoked_at"`
	CreatedAt   time.Time  `json:"created_at"`
	PEM         string     `json:"-"`
	Key         []byte     `json:"-"`
}

type Tunnel struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	Mode          string    `json:"mode"`
	Accept        string    `json:"accept"`
	Connect       string    `json:"connect"`
	CertificateID string    `json:"certificate_id"`
	PeerName      string    `json:"peer_name"`
	TLSMin        string    `json:"tls_min"`
	Enabled       bool      `json:"enabled"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type Audit struct {
	ID        int64     `json:"id"`
	Action    string    `json:"action"`
	Resource  string    `json:"resource"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type Snapshot struct {
	Authorities  []Authority   `json:"authorities"`
	Certificates []Certificate `json:"certificates"`
	Tunnels      []Tunnel      `json:"tunnels"`
	Audit        []Audit       `json:"audit"`
}
