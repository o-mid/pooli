package buildinfo

import "testing"

func TestResolveGitSHAPrefersCompiled(t *testing.T) {
	prev := GitSHA
	t.Cleanup(func() { GitSHA = prev })

	GitSHA = "compiledsha1234567890"
	if got := ResolveGitSHA("envsha-should-lose"); got != "compiledsha1234567890" {
		t.Fatalf("got %s", got)
	}

	GitSHA = "unknown"
	if got := ResolveGitSHA("envsha-wins"); got != "envsha-wins" {
		t.Fatalf("got %s", got)
	}

	GitSHA = ""
	if got := ResolveGitSHA(""); got != "unknown" {
		t.Fatalf("got %s", got)
	}
}
