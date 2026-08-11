package buildinfo

// GitSHA is set at link time via -ldflags or overridden by GIT_SHA env at runtime.
var GitSHA = "unknown"

// Version is a short product revision label for ops status.
func Version() string {
	if GitSHA == "" || GitSHA == "unknown" {
		return "unknown"
	}
	if len(GitSHA) > 12 {
		return GitSHA[:12]
	}
	return GitSHA
}
