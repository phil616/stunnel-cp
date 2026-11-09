package service

import "strings"

// Platform describes an export target, independent of the control plane OS.
// It is never persisted as a property of a tunnel.
type Platform string

const (
	PlatformUnix    Platform = "unix"
	PlatformWindows Platform = "windows"
)

func ParsePlatform(value string) (Platform, error) {
	if value == "" {
		return PlatformUnix, nil
	}
	platform := Platform(strings.ToLower(strings.TrimSpace(value)))
	switch platform {
	case PlatformUnix, PlatformWindows:
		return platform, nil
	}
	return "", Invalid("目标平台必须为 windows 或 unix")
}
