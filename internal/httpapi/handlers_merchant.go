package httpapi

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

func (s *Server) handlePatchMerchant(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	var req struct {
		DisplayName    *string `json:"display_name"`
		Description    *string `json:"description"`
		SupportContact *string `json:"support_contact"`
		Name           *string `json:"name"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	_, err = s.Pool.Exec(r.Context(), `
		UPDATE merchants SET
			display_name = COALESCE($2, display_name),
			description = COALESCE($3, description),
			support_contact = COALESCE($4, support_contact),
			name = COALESCE($5, name)
		WHERE id=$1::uuid`,
		mid, req.DisplayName, req.Description, req.SupportContact, req.Name)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleMerchantLogo(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := r.ParseMultipartForm(2 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid multipart (max 2MB)")
		return
	}
	file, hdr, err := r.FormFile("logo")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "logo required")
		return
	}
	defer file.Close()
	if hdr.Size > 2<<20 {
		writeErr(w, http.StatusBadRequest, "logo too large")
		return
	}
	buf := make([]byte, 512)
	n, _ := io.ReadFull(file, buf)
	ctype := http.DetectContentType(buf[:n])
	ext := ""
	switch ctype {
	case "image/jpeg":
		ext = ".jpg"
	case "image/png":
		ext = ".png"
	case "image/webp":
		ext = ".webp"
	default:
		writeErr(w, http.StatusBadRequest, "unsupported image type")
		return
	}
	rest, err := io.ReadAll(io.LimitReader(file, 2<<20))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "read failed")
		return
	}
	data := append(buf[:n], rest...)
	if len(data) > 2<<20 {
		writeErr(w, http.StatusBadRequest, "logo too large")
		return
	}
	dir := filepath.Join(s.Cfg.UploadDir, "merchants", mid)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeErr(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	name := uuid.NewString() + ext
	rel := filepath.ToSlash(filepath.Join("merchants", mid, name))
	abs := filepath.Join(s.Cfg.UploadDir, rel)
	if err := os.WriteFile(abs, data, 0o644); err != nil {
		writeErr(w, http.StatusInternalServerError, "write failed")
		return
	}
	_, err = s.Pool.Exec(r.Context(), `UPDATE merchants SET logo_path=$2 WHERE id=$1::uuid`, mid, rel)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"logo_url": "/api/v1/public/uploads/" + rel})
}

func (s *Server) handlePublicUpload(w http.ResponseWriter, r *http.Request) {
	rel := strings.TrimPrefix(r.URL.Path, "/api/v1/public/uploads/")
	rel = filepath.Clean(rel)
	if rel == "." || strings.Contains(rel, "..") {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	abs := filepath.Join(s.Cfg.UploadDir, rel)
	if !strings.HasPrefix(abs, filepath.Clean(s.Cfg.UploadDir)+string(os.PathSeparator)) {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	f, err := os.Open(abs)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || st.IsDir() {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	buf := make([]byte, 512)
	n, _ := f.Read(buf)
	ctype := http.DetectContentType(buf[:n])
	if _, err := f.Seek(0, 0); err != nil {
		writeErr(w, http.StatusInternalServerError, "read failed")
		return
	}
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", st.Size()))
	_, _ = io.Copy(w, f)
}
