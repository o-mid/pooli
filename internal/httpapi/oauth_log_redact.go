package httpapi

import (
	"net/http"
	"strings"
)

// redactGoogleCallbackURI rewrites RequestURI after the handler runs so chi's
// Logger defer records redacted OAuth query params (code/state) only.
func redactGoogleCallbackURI(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r)
		if !strings.Contains(r.URL.Path, "/auth/google/callback") {
			return
		}
		q := r.URL.Query()
		changed := false
		if q.Get("code") != "" {
			q.Set("code", "redacted")
			changed = true
		}
		if q.Get("state") != "" {
			q.Set("state", "redacted")
			changed = true
		}
		if !changed {
			return
		}
		r.URL.RawQuery = q.Encode()
		if r.URL.RawQuery == "" {
			r.RequestURI = r.URL.EscapedPath()
		} else {
			r.RequestURI = r.URL.EscapedPath() + "?" + r.URL.RawQuery
		}
	})
}
