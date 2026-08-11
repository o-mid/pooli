package httpapi

import (
	"net/http"

	"github.com/pooli-shop/pooli/internal/auth"
	"github.com/pooli-shop/pooli/internal/otp"
)

func (s *Server) handleOTPSend(w http.ResponseWriter, r *http.Request) {
	if s.OTP == nil {
		writeErr(w, http.StatusServiceUnavailable, "otp unavailable")
		return
	}
	if !s.Cfg.PhoneOTPEnabled() {
		writeErr(w, http.StatusServiceUnavailable, "phone login unavailable")
		return
	}
	var req struct {
		Phone   string `json:"phone"`
		Purpose string `json:"purpose"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Purpose == "" {
		req.Purpose = "login"
	}
	phone, err := otp.NormalizeIranianPhone(req.Phone)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Purpose == "login" {
		var exists bool
		_ = s.Pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE phone_e164=$1)`, phone).Scan(&exists)
		if !exists {
			writeErr(w, http.StatusNotFound, "account not found")
			return
		}
	}
	if req.Purpose == "register" {
		var exists bool
		_ = s.Pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE phone_e164=$1)`, phone).Scan(&exists)
		if exists {
			writeErr(w, http.StatusConflict, "phone already registered")
			return
		}
	}
	devCode, err := s.OTP.Send(r.Context(), phone, req.Purpose)
	if err != nil {
		writeErr(w, http.StatusTooManyRequests, err.Error())
		return
	}
	out := map[string]any{"ok": true, "phone": phone}
	if devCode != "" {
		out["dev_code"] = devCode
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleOTPVerify(w http.ResponseWriter, r *http.Request) {
	if s.OTP == nil {
		writeErr(w, http.StatusServiceUnavailable, "otp unavailable")
		return
	}
	if !s.Cfg.PhoneOTPEnabled() {
		writeErr(w, http.StatusServiceUnavailable, "phone login unavailable")
		return
	}
	var req struct {
		Phone   string `json:"phone"`
		Code    string `json:"code"`
		Purpose string `json:"purpose"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Purpose == "" {
		req.Purpose = "login"
	}
	phone, err := otp.NormalizeIranianPhone(req.Phone)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.OTP.Verify(r.Context(), phone, req.Purpose, req.Code); err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	if req.Purpose != "login" {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "phone": phone, "verified": true})
		return
	}
	u, token, err := s.Auth.LoginWithPhone(r.Context(), phone)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	auth.SetSessionCookie(w, token, secureCookie(s.Cfg))
	merchantID, _ := s.Auth.MerchantIDForUser(r.Context(), u.ID)
	writeJSON(w, http.StatusOK, map[string]any{"user": u, "merchant_id": merchantID})
}

func (s *Server) handleOTPRegister(w http.ResponseWriter, r *http.Request) {
	if s.OTP == nil {
		writeErr(w, http.StatusServiceUnavailable, "otp unavailable")
		return
	}
	if !s.Cfg.PhoneOTPEnabled() {
		writeErr(w, http.StatusServiceUnavailable, "phone login unavailable")
		return
	}
	var req struct {
		Phone        string `json:"phone"`
		Code         string `json:"code"`
		Name         string `json:"name"`
		MerchantName string `json:"merchant_name"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	phone, err := otp.NormalizeIranianPhone(req.Phone)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.OTP.Verify(r.Context(), phone, "register", req.Code); err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	if req.MerchantName == "" {
		req.MerchantName = req.Name
	}
	u, token, err := s.Auth.RegisterWithPhone(r.Context(), phone, req.Name, req.MerchantName)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	auth.SetSessionCookie(w, token, secureCookie(s.Cfg))
	merchantID, _ := s.Auth.MerchantIDForUser(r.Context(), u.ID)
	writeJSON(w, http.StatusCreated, map[string]any{"user": u, "merchant_id": merchantID})
}
