package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/pooli-shop/pooli/internal/otp"
)

func (s *Server) handleListCustomers(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit := 50
	args := []any{mid}
	sql := `
		SELECT id::text, full_name, phone_e164, email, order_count, lifetime_paid_toman,
		       last_order_at, created_at, updated_at
		FROM customers
		WHERE merchant_id=$1::uuid`
	if q != "" {
		args = append(args, "%"+q+"%")
		phoneQ := q
		if n, err := otp.NormalizeIranianPhone(q); err == nil {
			phoneQ = n
		}
		args = append(args, "%"+phoneQ+"%")
		sql += ` AND (
			full_name ILIKE $2 OR phone_e164 ILIKE $2 OR email ILIKE $2
			OR phone_e164 ILIKE $3 OR replace(phone_e164, '+', '') ILIKE replace($3, '+', '')
		)`
	}
	sql += ` ORDER BY COALESCE(last_order_at, updated_at) DESC LIMIT ` + itoa(limit)

	rows, err := s.Pool.Query(r.Context(), sql, args...)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, name, phone, email string
		var orderCount int
		var lifetime int64
		var lastOrder *time.Time
		var created, updated time.Time
		_ = rows.Scan(&id, &name, &phone, &email, &orderCount, &lifetime, &lastOrder, &created, &updated)
		out = append(out, map[string]any{
			"id": id, "full_name": name, "phone": maskPhone(phone), "phone_e164": phone,
			"email": maskEmail(email), "email_full": email,
			"order_count": orderCount, "lifetime_paid_toman": lifetime,
			"last_order_at": lastOrder, "created_at": created, "updated_at": updated,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"customers": out})
}

func (s *Server) handleGetCustomer(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	id := chi.URLParam(r, "id")
	cust, err := s.loadCustomerForMerchant(r.Context(), mid, id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, cust)
}

func (s *Server) loadCustomerForMerchant(ctx context.Context, merchantID, customerID string) (map[string]any, error) {
	var id, name, phone, email string
	var defaultAddrID *string
	var orderCount int
	var lifetime int64
	var lastOrder *time.Time
	var created, updated time.Time
	err := s.Pool.QueryRow(ctx, `
		SELECT id::text, full_name, phone_e164, email, default_address_id::text,
		       order_count, lifetime_paid_toman, last_order_at, created_at, updated_at
		FROM customers WHERE id=$1::uuid AND merchant_id=$2::uuid`, customerID, merchantID).
		Scan(&id, &name, &phone, &email, &defaultAddrID, &orderCount, &lifetime, &lastOrder, &created, &updated)
	if err != nil {
		return nil, err
	}
	addrs := s.loadCustomerAddresses(ctx, merchantID, id)
	orders := s.loadCustomerOrders(ctx, merchantID, id, 20)
	return map[string]any{
		"id": id, "full_name": name, "phone_e164": phone, "email": email,
		"default_address_id": defaultAddrID,
		"order_count": orderCount, "lifetime_paid_toman": lifetime,
		"last_order_at": lastOrder, "created_at": created, "updated_at": updated,
		"addresses": addrs, "recent_orders": orders,
	}, nil
}

func (s *Server) loadCustomerAddresses(ctx context.Context, merchantID, customerID string) []map[string]any {
	rows, err := s.Pool.Query(ctx, `
		SELECT id::text, recipient_name, phone_e164, province, city, address_line,
		       postal_code, label, is_default, created_at
		FROM customer_addresses
		WHERE customer_id=$1::uuid AND merchant_id=$2::uuid
		ORDER BY is_default DESC, created_at DESC`, customerID, merchantID)
	if err != nil {
		return []map[string]any{}
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, recipient, phone, province, city, line, postal, label string
		var isDefault bool
		var created time.Time
		_ = rows.Scan(&id, &recipient, &phone, &province, &city, &line, &postal, &label, &isDefault, &created)
		out = append(out, map[string]any{
			"id": id, "recipient_name": recipient, "phone_e164": phone,
			"province": province, "city": city, "address_line": line,
			"postal_code": postal, "label": label, "is_default": isDefault, "created_at": created,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out
}

func (s *Server) loadCustomerOrders(ctx context.Context, merchantID, customerID string, limit int) []map[string]any {
	rows, err := s.Pool.Query(ctx, `
		SELECT o.id::text, o.slug, o.title, o.fiat_amount_toman, o.status, o.fulfillment_status,
		       COALESCE(pi.status, o.status) AS payment_status, o.created_at
		FROM orders o
		LEFT JOIN payment_intents pi ON pi.order_id = o.id
		WHERE o.merchant_id=$1::uuid AND o.customer_id=$2::uuid
		ORDER BY o.created_at DESC LIMIT $3`, merchantID, customerID, limit)
	if err != nil {
		return []map[string]any{}
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, slug, title, status, fulfill, payStatus string
		var amount int64
		var created time.Time
		_ = rows.Scan(&id, &slug, &title, &amount, &status, &fulfill, &payStatus, &created)
		out = append(out, map[string]any{
			"id": id, "slug": slug, "title": title, "fiat_amount_toman": amount,
			"status": status, "fulfillment_status": fulfill, "payment_status": payStatus,
			"created_at": created, "checkout_url": s.Cfg.PublicBaseURL + "/p/" + slug,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out
}

// upsertCustomerFromCheckout creates/updates a merchant-scoped customer from submitted fields.
// Never called from unauthenticated public recognition paths that would disclose PII.
func (s *Server) upsertCustomerFromCheckout(ctx context.Context, tx pgx.Tx, merchantID, orderID string, values map[string]string) (string, error) {
	fullName := strings.TrimSpace(values["full_name"])
	phoneRaw := strings.TrimSpace(values["phone"])
	email := strings.ToLower(strings.TrimSpace(values["email"]))
	address := strings.TrimSpace(values["shipping_address"])
	postal := strings.TrimSpace(values["postal_code"])

	phone := ""
	if phoneRaw != "" {
		if n, err := otp.NormalizeIranianPhone(phoneRaw); err == nil {
			phone = n
		} else {
			phone = phoneRaw // store as submitted if not Iranian-format; still merchant-scoped
		}
	}
	if phone == "" && email == "" {
		return "", nil
	}

	var customerID string
	if phone != "" {
		_ = tx.QueryRow(ctx, `
			SELECT id::text FROM customers
			WHERE merchant_id=$1::uuid AND phone_e164=$2 LIMIT 1`, merchantID, phone).Scan(&customerID)
	}
	if customerID == "" && email != "" {
		_ = tx.QueryRow(ctx, `
			SELECT id::text FROM customers
			WHERE merchant_id=$1::uuid AND lower(email)=lower($2) LIMIT 1`, merchantID, email).Scan(&customerID)
	}

	now := time.Now().UTC()
	if customerID == "" {
		err := tx.QueryRow(ctx, `
			INSERT INTO customers (merchant_id, full_name, phone_e164, email, last_order_at, order_count, updated_at)
			VALUES ($1::uuid,$2,$3,$4,$5,1,now()) RETURNING id::text`,
			merchantID, fullName, phone, email, now).Scan(&customerID)
		if err != nil {
			return "", err
		}
	} else {
		_, err := tx.Exec(ctx, `
			UPDATE customers SET
				full_name = CASE WHEN $3 <> '' THEN $3 ELSE full_name END,
				phone_e164 = CASE WHEN $4 <> '' THEN $4 ELSE phone_e164 END,
				email = CASE WHEN $5 <> '' THEN $5 ELSE email END,
				order_count = order_count + 1,
				last_order_at = $6,
				updated_at = now()
			WHERE id=$1::uuid AND merchant_id=$2::uuid`,
			customerID, merchantID, fullName, phone, email, now)
		if err != nil {
			return "", err
		}
	}

	_, _ = tx.Exec(ctx, `UPDATE orders SET customer_id=$2::uuid, updated_at=now() WHERE id=$1::uuid AND merchant_id=$3::uuid`,
		orderID, customerID, merchantID)

	if address != "" || postal != "" {
		var addrID string
		_ = tx.QueryRow(ctx, `
			SELECT id::text FROM customer_addresses
			WHERE customer_id=$1::uuid AND merchant_id=$2::uuid AND is_default=true
			LIMIT 1`, customerID, merchantID).Scan(&addrID)
		if addrID == "" {
			err := tx.QueryRow(ctx, `
				INSERT INTO customer_addresses (
					customer_id, merchant_id, recipient_name, phone_e164, address_line, postal_code, label, is_default
				) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,'Home',true) RETURNING id::text`,
				customerID, merchantID, fullName, phone, address, postal).Scan(&addrID)
			if err != nil {
				return customerID, err
			}
		} else {
			_, err := tx.Exec(ctx, `
				UPDATE customer_addresses SET
					recipient_name = CASE WHEN $3 <> '' THEN $3 ELSE recipient_name END,
					phone_e164 = CASE WHEN $4 <> '' THEN $4 ELSE phone_e164 END,
					address_line = CASE WHEN $5 <> '' THEN $5 ELSE address_line END,
					postal_code = CASE WHEN $6 <> '' THEN $6 ELSE postal_code END,
					updated_at = now()
				WHERE id=$1::uuid AND merchant_id=$2::uuid`,
				addrID, merchantID, fullName, phone, address, postal)
			if err != nil {
				return customerID, err
			}
		}
		_, _ = tx.Exec(ctx, `
			UPDATE customers SET default_address_id=$2::uuid, updated_at=now()
			WHERE id=$1::uuid`, customerID, addrID)
	}
	return customerID, nil
}

func (s *Server) bumpCustomerPaidTotals(ctx context.Context, orderID string) {
	var customerID *string
	var toman int64
	var merchantID string
	err := s.Pool.QueryRow(ctx, `
		SELECT customer_id::text, fiat_amount_toman, merchant_id::text
		FROM orders WHERE id=$1::uuid`, orderID).Scan(&customerID, &toman, &merchantID)
	if err != nil || customerID == nil || *customerID == "" {
		return
	}
	_, _ = s.Pool.Exec(ctx, `
		UPDATE customers SET
			lifetime_paid_toman = lifetime_paid_toman + $2,
			last_order_at = now(),
			updated_at = now()
		WHERE id=$1::uuid AND merchant_id=$3::uuid`, *customerID, toman, merchantID)
}

func maskPhone(phone string) string {
	p := strings.TrimSpace(phone)
	if len(p) < 7 {
		return p
	}
	return p[:4] + "••••" + p[len(p)-3:]
}

func maskEmail(email string) string {
	e := strings.TrimSpace(email)
	at := strings.Index(e, "@")
	if at <= 1 {
		return e
	}
	return e[:1] + "••••" + e[at:]
}

func itoa(n int) string {
	if n <= 0 {
		return "0"
	}
	var b [16]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
