package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/pooli-shop/pooli/internal/payment"
)

// handleTelegramConnectLink creates a single-use connect token and returns a deep link.
func (s *Server) handleTelegramConnectLink(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if !s.Cfg.TelegramEnabled {
		writeErr(w, http.StatusBadRequest, "telegram disabled")
		return
	}
	raw, err := randomToken(24)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token error")
		return
	}
	hash := hashToken(raw)
	ttl := s.Cfg.TelegramConnectTokenTTL
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	expires := time.Now().UTC().Add(ttl)
	_, err = s.Pool.Exec(r.Context(), `
		INSERT INTO telegram_connect_tokens (merchant_id, token_hash, expires_at)
		VALUES ($1::uuid, $2, $3)`, mid, hash, expires)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	bot := strings.TrimPrefix(s.Cfg.TelegramBotUsername, "@")
	if bot == "" {
		bot = "PooliShopbot"
	}
	url := "https://t.me/" + bot + "?start=" + raw
	writeJSON(w, http.StatusOK, map[string]any{
		"url":        url,
		"expires_at": expires,
	})
}

// handleTelegramConnect rejects manual chat_id association.
func (s *Server) handleTelegramConnect(w http.ResponseWriter, r *http.Request) {
	writeErr(w, http.StatusBadRequest, "use Connect Telegram deep link")
}

func (s *Server) handleTelegramDisconnect(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	_, _ = s.Pool.Exec(r.Context(), `
		UPDATE telegram_connections SET enabled=false WHERE merchant_id=$1::uuid`, mid)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "connected": false})
}

var telegramTestLimiter sync.Map // merchantID -> last time

func (s *Server) handleTelegramTest(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if last, ok := telegramTestLimiter.Load(mid); ok {
		if t, ok := last.(time.Time); ok && time.Since(t) < 30*time.Second {
			writeErr(w, http.StatusTooManyRequests, "try again shortly")
			return
		}
	}
	telegramTestLimiter.Store(mid, time.Now())

	locale := "en"
	if cookie, err := r.Cookie("pooli_locale"); err == nil && cookie.Value == "fa" {
		locale = "fa"
	}
	if err := s.Telegram.SendTest(r.Context(), mid, locale); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleTelegramWebhook(w http.ResponseWriter, r *http.Request) {
	secret := s.Cfg.TelegramWebhookSecret
	if secret == "" {
		writeErr(w, http.StatusForbidden, "webhook not configured")
		return
	}
	if r.Header.Get("X-Telegram-Bot-Api-Secret-Token") != secret {
		writeErr(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var update struct {
		UpdateID int64 `json:"update_id"`
		Message  *struct {
			Text string `json:"text"`
			Chat struct {
				ID int64 `json:"id"`
			} `json:"chat"`
			From *struct {
				ID       int64  `json:"id"`
				Username string `json:"username"`
			} `json:"from"`
		} `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if update.UpdateID != 0 {
		tag, err := s.Pool.Exec(r.Context(), `
			INSERT INTO telegram_updates (update_id) VALUES ($1)
			ON CONFLICT (update_id) DO NOTHING`, update.UpdateID)
		if err == nil && tag.RowsAffected() == 0 {
			writeJSON(w, http.StatusOK, map[string]any{"ok": true, "duplicate": true})
			return
		}
	}
	if update.Message == nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	text := strings.TrimSpace(update.Message.Text)
	if !strings.HasPrefix(text, "/start") {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	parts := strings.Fields(text)
	if len(parts) < 2 {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	token := parts[1]
	hash := hashToken(token)
	chatID := strconv.FormatInt(update.Message.Chat.ID, 10)
	var userID, username string
	if update.Message.From != nil {
		userID = strconv.FormatInt(update.Message.From.ID, 10)
		username = update.Message.From.Username
	}

	var merchantID string
	var expiresAt time.Time
	var usedAt *time.Time
	err := s.Pool.QueryRow(r.Context(), `
		SELECT merchant_id::text, expires_at, used_at FROM telegram_connect_tokens
		WHERE token_hash=$1`, hash).Scan(&merchantID, &expiresAt, &usedAt)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if usedAt != nil || time.Now().UTC().After(expiresAt) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}

	err = payment.WithTx(r.Context(), s.Pool, func(tx pgx.Tx) error {
		tag, err := tx.Exec(r.Context(), `
			UPDATE telegram_connect_tokens SET used_at=now()
			WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()`, hash)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return pgx.ErrNoRows
		}
		_, err = tx.Exec(r.Context(), `
			INSERT INTO telegram_connections (merchant_id, chat_id, telegram_user_id, username, enabled, connected_at)
			VALUES ($1::uuid, $2, $3, $4, true, now())
			ON CONFLICT (merchant_id) DO UPDATE SET
				chat_id=EXCLUDED.chat_id,
				telegram_user_id=EXCLUDED.telegram_user_id,
				username=EXCLUDED.username,
				enabled=true,
				connected_at=now()`, merchantID, chatID, userID, username)
		return err
	})
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}

	msgEN := "Pooli connected ✓\nYou'll receive payment updates here."
	msgFA := "پولی متصل شد ✓\nاز این به بعد وضعیت پرداخت‌ها را اینجا دریافت می‌کنید."
	_ = s.Telegram.SendRaw(r.Context(), chatID, msgEN+"\n\n"+msgFA)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "connected": true})
}

func randomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
