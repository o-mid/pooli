package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/pooli-shop/pooli/internal/instagram"
	"github.com/pooli-shop/pooli/internal/payment"
)

const (
	igStateIdle         = "idle"
	igStateAwaitAmount  = "await_amount"
	igStateAwaitConfirm = "await_confirm"
	igConversationTTL   = 15 * time.Minute
	igBindAlphabet      = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
)

var igBindCodePattern = regexp.MustCompile(`(?i)^pooli-[A-Z0-9]{4,12}$`)

func (s *Server) handleInstagramWebhookVerify(w http.ResponseWriter, r *http.Request) {
	mode := r.URL.Query().Get("hub.mode")
	token := r.URL.Query().Get("hub.verify_token")
	challenge := r.URL.Query().Get("hub.challenge")
	want := s.Cfg.InstagramWebhookVerifyToken
	if want == "" || mode != "subscribe" || subtle.ConstantTimeCompare([]byte(token), []byte(want)) != 1 {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(challenge))
}

func (s *Server) handleInstagramWebhook(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if !s.Cfg.InstagramReady() {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if secret := strings.TrimSpace(s.Cfg.InstagramAppSecret); secret != "" {
		if !validHubSignature(secret, raw, r.Header.Get("X-Hub-Signature-256")) {
			writeJSON(w, http.StatusOK, map[string]any{"ok": true})
			return
		}
	}
	var payload igWebhookPayload
	if err := json.Unmarshal(raw, &payload); err != nil || payload.Object != "instagram" {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	for _, entry := range payload.Entry {
		for _, ev := range entry.Messaging {
			s.handleInstagramEvent(r.Context(), ev)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type igWebhookPayload struct {
	Object string `json:"object"`
	Entry  []struct {
		Messaging []igMessagingEvent `json:"messaging"`
	} `json:"entry"`
}

type igMessagingEvent struct {
	Sender struct {
		ID string `json:"id"`
	} `json:"sender"`
	Timestamp int64 `json:"timestamp"`
	Message   *struct {
		MID    string `json:"mid"`
		Text   string `json:"text"`
		IsEcho bool   `json:"is_echo"`
		IsSelf bool   `json:"is_self"`
	} `json:"message"`
	Postback *struct {
		Title   string `json:"title"`
		Payload string `json:"payload"`
	} `json:"postback"`
}

func (s *Server) handleInstagramEvent(ctx context.Context, ev igMessagingEvent) {
	if ev.Message != nil && (ev.Message.IsEcho || ev.Message.IsSelf) {
		return
	}
	sender := strings.TrimSpace(ev.Sender.ID)
	if sender == "" {
		return
	}
	eventKey := igEventKey(ev)
	tag, err := s.Pool.Exec(ctx, `
		INSERT INTO instagram_updates (event_key) VALUES ($1)
		ON CONFLICT (event_key) DO NOTHING`, eventKey)
	if err != nil || tag.RowsAffected() == 0 {
		return
	}
	if s.igMsgLimit != nil && !s.igMsgLimit.allow(sender) {
		return
	}

	text := ""
	postback := ""
	if ev.Message != nil {
		text = strings.TrimSpace(ev.Message.Text)
	}
	if ev.Postback != nil {
		postback = strings.TrimSpace(ev.Postback.Payload)
		if text == "" {
			text = strings.TrimSpace(ev.Postback.Title)
		}
	}

	var merchantID string
	var enabled bool
	err = s.Pool.QueryRow(ctx, `
		SELECT merchant_id::text, enabled
		FROM instagram_connections WHERE igsid=$1`, sender).Scan(&merchantID, &enabled)
	bound := err == nil && enabled && merchantID != ""
	if !bound {
		s.handleInstagramUnbound(ctx, sender, text)
		return
	}
	s.handleInstagramBound(ctx, sender, merchantID, text, postback)
}

func igEventKey(ev igMessagingEvent) string {
	if ev.Message != nil && ev.Message.MID != "" {
		return "mid:" + ev.Message.MID
	}
	if ev.Postback != nil {
		return fmt.Sprintf("pb:%s:%d:%s", ev.Sender.ID, ev.Timestamp, ev.Postback.Payload)
	}
	return fmt.Sprintf("evt:%s:%d", ev.Sender.ID, ev.Timestamp)
}

func (s *Server) handleInstagramUnbound(ctx context.Context, sender, text string) {
	if igBindCodePattern.MatchString(text) {
		code := strings.ToUpper(strings.TrimSpace(text))
		hash := hashToken(code)
		var merchantID string
		var expiresAt time.Time
		var usedAt *time.Time
		err := s.Pool.QueryRow(ctx, `
			SELECT merchant_id::text, expires_at, used_at FROM instagram_bind_codes
			WHERE code_hash=$1`, hash).Scan(&merchantID, &expiresAt, &usedAt)
		if err == nil && usedAt == nil && time.Now().UTC().Before(expiresAt) {
			err = payment.WithTx(ctx, s.Pool, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `
					UPDATE instagram_bind_codes SET used_at=now()
					WHERE code_hash=$1 AND used_at IS NULL AND expires_at > now()`, hash)
				if err != nil {
					return err
				}
				if tag.RowsAffected() != 1 {
					return pgx.ErrNoRows
				}
				_, err = tx.Exec(ctx, `DELETE FROM instagram_connections WHERE igsid=$1 AND merchant_id <> $2::uuid`, sender, merchantID)
				if err != nil {
					return err
				}
				_, err = tx.Exec(ctx, `
					INSERT INTO instagram_connections (merchant_id, igsid, ig_username, enabled, connected_at, updated_at)
					VALUES ($1::uuid, $2, '', true, now(), now())
					ON CONFLICT (merchant_id) DO UPDATE SET
						igsid=EXCLUDED.igsid,
						enabled=true,
						connected_at=now(),
						updated_at=now()`, merchantID, sender)
				return err
			})
			if err == nil {
				s.igReply(ctx, sender, "Pooli connected ✓\nYou can create payment links here.\n\nپولی متصل شد ✓\nاز اینجا لینک پرداخت بسازید.")
				return
			}
		}
	}
	s.igReply(ctx, sender, "Send the code from Pooli Settings to connect.\n\nکد اتصال را از تنظیمات پولی بفرست.")
}

func (s *Server) handleInstagramBound(ctx context.Context, sender, merchantID, text, postback string) {
	state, amount, title := s.igConversation(ctx, sender, merchantID)
	norm := normalizeIGCommand(text)
	pb := strings.ToUpper(strings.TrimSpace(postback))

	if isIGCancel(norm, pb) {
		s.igSetConversation(ctx, sender, merchantID, igStateIdle, 0, "")
		s.igReply(ctx, sender, "لغو شد.\nCancelled.")
		return
	}

	if state == igStateAwaitConfirm && isIGConfirm(norm, pb) {
		if amount <= 0 {
			s.igSetConversation(ctx, sender, merchantID, igStateAwaitAmount, 0, "")
			s.igReply(ctx, sender, "مبلغ را به تومان بفرست (فقط عدد)\nSend the amount in toman (numbers only).")
			return
		}
		if s.igCreateLimit != nil && !s.igCreateLimit.allow(sender) {
			s.igReply(ctx, sender, "Too many payment links. Try again later.\nتعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.")
			return
		}
		orderTitle := title
		if strings.TrimSpace(orderTitle) == "" {
			orderTitle = "Instagram"
		}
		created, err := s.createOrderWithIntent(ctx, CreateOrderInput{
			MerchantID:      merchantID,
			FiatAmountToman: amount,
			Title:           orderTitle,
			CreateIntent:    true,
			Source:          orderSourceInstagramDM,
		})
		if err != nil {
			s.igReply(ctx, sender, igCreateErrorText(err))
			return
		}
		s.igSetConversation(ctx, sender, merchantID, igStateIdle, 0, "")
		s.igReply(ctx, sender, fmt.Sprintf("%s تومان\nپرداخت از طریق پولی:\n%s", formatTomanGrouped(created.FiatAmount), created.CheckoutURL))
		return
	}

	if state == igStateAwaitAmount {
		parsed, ok := parseTomanDigits(text)
		if !ok || parsed <= 0 {
			s.igReply(ctx, sender, "مبلغ را به تومان بفرست (فقط عدد)\nSend the amount in toman (numbers only).")
			return
		}
		s.igSetConversation(ctx, sender, merchantID, igStateAwaitConfirm, parsed, title)
		s.igReply(ctx, sender, fmt.Sprintf("%s تومان — تأیید؟ بفرست: بله / تأیید\n%s toman — confirm? Send: yes / confirm", formatTomanGrouped(parsed), formatTomanGrouped(parsed)))
		return
	}

	if isIGPayStart(norm, pb) {
		s.igSetConversation(ctx, sender, merchantID, igStateAwaitAmount, 0, "")
		s.igReply(ctx, sender, "مبلغ را به تومان بفرست (فقط عدد)\nSend the amount in toman (numbers only).")
		return
	}

	s.igReply(ctx, sender, "برای لینک پرداخت بنویس: پرداخت\nTo create a payment link, send: pay")
}

func (s *Server) igConversation(ctx context.Context, igsid, merchantID string) (state string, amount int64, title string) {
	var updated time.Time
	var pending *int64
	var pendingTitle *string
	err := s.Pool.QueryRow(ctx, `
		SELECT state, pending_amount_toman, pending_title, updated_at
		FROM instagram_conversations WHERE igsid=$1`, igsid).Scan(&state, &pending, &pendingTitle, &updated)
	if err != nil || time.Since(updated) > igConversationTTL {
		return igStateIdle, 0, ""
	}
	if pending != nil {
		amount = *pending
	}
	if pendingTitle != nil {
		title = *pendingTitle
	}
	_ = merchantID
	return state, amount, title
}

func (s *Server) igSetConversation(ctx context.Context, igsid, merchantID, state string, amount int64, title string) {
	var amt any
	if amount > 0 {
		amt = amount
	}
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO instagram_conversations (igsid, merchant_id, state, pending_amount_toman, pending_title, updated_at)
		VALUES ($1, $2::uuid, $3, $4, $5, now())
		ON CONFLICT (igsid) DO UPDATE SET
			merchant_id=EXCLUDED.merchant_id,
			state=EXCLUDED.state,
			pending_amount_toman=EXCLUDED.pending_amount_toman,
			pending_title=EXCLUDED.pending_title,
			updated_at=now()`, igsid, merchantID, state, amt, title)
}

func (s *Server) igReply(ctx context.Context, sender, text string) {
	if s.Instagram == nil {
		return
	}
	_ = s.Instagram.SendText(ctx, sender, text)
}

func (s *Server) handleInstagramBindCode(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if !s.Cfg.InstagramReady() {
		writeErr(w, http.StatusBadRequest, "instagram disabled")
		return
	}
	raw, err := randomIGBindCode()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "code error")
		return
	}
	hash := hashToken(strings.ToUpper(raw))
	ttl := s.Cfg.InstagramBindCodeTTL
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	expires := time.Now().UTC().Add(ttl)
	_, _ = s.Pool.Exec(r.Context(), `
		UPDATE instagram_bind_codes SET used_at=now()
		WHERE merchant_id=$1::uuid AND used_at IS NULL`, mid)
	_, err = s.Pool.Exec(r.Context(), `
		INSERT INTO instagram_bind_codes (merchant_id, code_hash, expires_at)
		VALUES ($1::uuid, $2, $3)`, mid, hash, expires)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"code":         raw,
		"expires_at":   expires,
		"instructions": "Open Instagram → DM @pooli → send this code.",
	})
}

func (s *Server) handleInstagramStatus(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	out := map[string]any{"configured": s.Cfg.InstagramReady(), "connected": false}
	var username string
	var enabled bool
	err = s.Pool.QueryRow(r.Context(), `
		SELECT COALESCE(ig_username,''), enabled FROM instagram_connections
		WHERE merchant_id=$1::uuid`, mid).Scan(&username, &enabled)
	if err == nil && enabled {
		out["connected"] = true
		if username != "" {
			out["ig_username"] = username
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleInstagramDisconnect(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	_, _ = s.Pool.Exec(r.Context(), `
		UPDATE instagram_connections SET enabled=false, updated_at=now() WHERE merchant_id=$1::uuid`, mid)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "connected": false})
}

func (s *Server) handleAdminInstagramIceBreakers(w http.ResponseWriter, r *http.Request) {
	if !s.Cfg.InstagramReady() || s.Instagram == nil {
		writeErr(w, http.StatusBadRequest, "instagram disabled")
		return
	}
	err := s.Instagram.SetIceBreakers(r.Context(), []instagram.IceBreaker{
		{Question: "پرداخت", Payload: "PAY"},
		{Question: "Pay", Payload: "PAY"},
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func randomIGBindCode() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	out := make([]byte, 8)
	for i := range out {
		out[i] = igBindAlphabet[int(b[i])%len(igBindAlphabet)]
	}
	return "pooli-" + string(out), nil
}

func validHubSignature(secret string, body []byte, header string) bool {
	header = strings.TrimSpace(header)
	if !strings.HasPrefix(header, "sha256=") {
		return false
	}
	got, err := hex.DecodeString(strings.TrimPrefix(header, "sha256="))
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	want := mac.Sum(nil)
	return hmac.Equal(got, want)
}

func parseTomanDigits(s string) (int64, bool) {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r >= '۰' && r <= '۹':
			b.WriteRune('0' + (r - '۰'))
		case r >= '٠' && r <= '٩':
			b.WriteRune('0' + (r - '٠'))
		case r == ',' || r == '٬' || r == ' ' || r == '\u00a0' || unicode.IsSpace(r):
			continue
		default:
			return 0, false
		}
	}
	digits := b.String()
	if digits == "" {
		return 0, false
	}
	n, err := strconv.ParseInt(digits, 10, 64)
	if err != nil || n <= 0 {
		return 0, false
	}
	return n, true
}

func formatTomanGrouped(n int64) string {
	s := strconv.FormatInt(n, 10)
	if len(s) <= 3 {
		return s
	}
	var parts []string
	for len(s) > 3 {
		parts = append([]string{s[len(s)-3:]}, parts...)
		s = s[:len(s)-3]
	}
	parts = append([]string{s}, parts...)
	return strings.Join(parts, "٬")
}

func normalizeIGCommand(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	s = strings.TrimPrefix(s, "/")
	s = strings.ReplaceAll(s, "ي", "ی")
	s = strings.ReplaceAll(s, "ك", "ک")
	return s
}

func isIGPayStart(norm, postback string) bool {
	if postback == "PAY" || postback == "START" {
		return true
	}
	switch norm {
	case "pay", "پرداخت":
		return true
	}
	return false
}

func isIGConfirm(norm, postback string) bool {
	if postback == "CONFIRM" {
		return true
	}
	switch norm {
	case "بله", "تایید", "تأیید", "ok", "yes", "confirm", "✅":
		return true
	}
	return false
}

func isIGCancel(norm, postback string) bool {
	if postback == "CANCEL" {
		return true
	}
	switch norm {
	case "لغو", "cancel", "no", "نه":
		return true
	}
	return false
}

func igCreateErrorText(err error) string {
	switch err {
	case errNoWallets:
		return "Add a receiving wallet in Pooli first.\nاول در پولی یک کیف پول دریافت اضافه کنید."
	case errMerchantSuspended:
		return "This store is suspended.\nاین فروشگاه تعلیق شده است."
	case errStaleRate:
		return "We can't get the USDT rate right now. Try again shortly.\nنرخ دلار الان در دسترس نیست. کمی بعد دوباره تلاش کنید."
	default:
		return "Could not create the payment link. Try again.\nساخت لینک پرداخت ممکن نشد. دوباره تلاش کنید."
	}
}
