package buildinfo

import "os"

// GitSHA is set at link time via -ldflags.
var GitSHA = "unknown"

// ResolveGitSHA prefers the compiled API/worker SHA over a deploy-env value.
// Web-only deploys rewrite GIT_SHA in compose env; that must not masquerade as the API binary.
func ResolveGitSHA(envSHA string) string {
	if GitSHA != "" && GitSHA != "unknown" {
		return GitSHA
	}
	if envSHA != "" && envSHA != "unknown" {
		return envSHA
	}
	if v := os.Getenv("GIT_SHA"); v != "" && v != "unknown" {
		return v
	}
	return "unknown"
}

// Version is a short product revision label for ops status.
func Version() string {
	sha := ResolveGitSHA("")
	if len(sha) > 12 {
		return sha[:12]
	}
	return sha
}
