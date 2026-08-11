package email

import (
	"fmt"
	"html"
	"strings"

	"github.com/pooli-shop/pooli/internal/domain"
)

const brandGreen = "#0f8f6b"
const brandInk = "#0b1f1a"

// PaidContent is commerce-first receipt data for merchant or buyer.
type PaidContent struct {
	Locale       string // en|fa
	Role         string // merchant|buyer
	MerchantName string
	CustomerName string
	OrderRef     string
	OrderURL     string
	Toman        int64
	USDTBase     int64
	Network      string
}

// AttentionContent is a merchant needs-attention notice.
type AttentionContent struct {
	Locale   string
	OrderRef string
	OrderURL string
	Status   string
	Expected string
	Received string
}

// FulfillmentContent is a buyer order-update notice.
type FulfillmentContent struct {
	Locale           string
	MerchantName     string
	OrderRef         string
	OrderURL         string
	Status           string // SHIPPED|DELIVERED|PROCESSING|...
	ShippingProvider string
	TrackingNumber   string
}

type Rendered struct {
	Subject string
	HTML    string
	Text    string
}

func RenderPaid(c PaidContent) Rendered {
	locale := normalizeLocale(c.Locale)
	usdt := domain.FormatUSDTBaseUnits(c.USDTBase)
	net := displayNetwork(c.Network)
	toman := formatTomanGrouped(c.Toman)
	orderRef := html.EscapeString(strings.TrimSpace(c.OrderRef))
	orderURL := absoluteURL(c.OrderURL)
	merchant := html.EscapeString(strings.TrimSpace(c.MerchantName))
	customer := html.EscapeString(strings.TrimSpace(c.CustomerName))

	if c.Role == "buyer" {
		return renderBuyerPaid(locale, merchant, toman, usdt, net, orderRef, orderURL)
	}
	return renderMerchantPaid(locale, customer, toman, usdt, net, orderRef, orderURL)
}

func renderMerchantPaid(locale, customer, toman, usdt, net, orderRef, orderURL string) Rendered {
	if locale == "fa" {
		who := customer
		if who == "" {
			who = "مشتری"
		}
		subject := "پرداخت دریافت شد ✓"
		headline := "پرداخت دریافت شد ✓"
		lead := fmt.Sprintf("%s مبلغ %s تومان پرداخت کرد.", who, toman)
		details := []kv{
			{Label: "مبلغ", Value: toman + " تومان", LTR: false},
			{Label: "USDT", Value: usdt + " · " + net, LTR: true},
			{Label: "سفارش", Value: "#" + orderRef, LTR: true},
		}
		cta := "مشاهده سفارش"
		htmlBody := layout(locale, headline, lead, details, cta, orderURL, "جزئیات پرداخت")
		text := strings.Join([]string{
			headline,
			fmt.Sprintf("%s مبلغ %s تومان پرداخت کرد.", plain(who), toman),
			usdt + " USDT · " + net,
			"سفارش #" + plain(orderRef),
			orderURL,
		}, "\n")
		return Rendered{Subject: subject, HTML: htmlBody, Text: text}
	}

	who := customer
	if who == "" {
		who = "Customer"
	}
	subject := "Payment received ✓"
	headline := "Payment received ✓"
	lead := fmt.Sprintf("%s paid %s تومان.", who, toman)
	details := []kv{
		{Label: "Amount", Value: toman + " تومان", LTR: false},
		{Label: "USDT", Value: usdt + " · " + net, LTR: true},
		{Label: "Order", Value: "#" + orderRef, LTR: true},
	}
	htmlBody := layout(locale, headline, lead, details, "View order", orderURL, "Payment details")
	text := strings.Join([]string{
		headline,
		fmt.Sprintf("%s paid %s تومان.", plain(who), toman),
		usdt + " USDT · " + net,
		"Order #" + plain(orderRef),
		orderURL,
	}, "\n")
	return Rendered{Subject: subject, HTML: htmlBody, Text: text}
}

func renderBuyerPaid(locale, merchant, toman, usdt, net, orderRef, orderURL string) Rendered {
	if locale == "fa" {
		store := merchant
		if store == "" {
			store = "فروشنده"
		}
		subject := "پرداخت شما ثبت شد ✓"
		headline := "همه‌چیز آماده‌ست ✓"
		lead := fmt.Sprintf("پرداخت شما به %s دریافت شد.", store)
		details := []kv{
			{Label: "مبلغ", Value: toman + " تومان", LTR: false},
			{Label: "USDT", Value: usdt + " · " + net, LTR: true},
			{Label: "سفارش", Value: "#" + orderRef, LTR: true},
		}
		htmlBody := layout(locale, headline, lead, details, "مشاهده سفارش", orderURL, "جزئیات پرداخت")
		text := strings.Join([]string{
			headline,
			fmt.Sprintf("پرداخت شما به %s دریافت شد.", plain(store)),
			toman + " تومان",
			usdt + " USDT · " + net,
			"سفارش #" + plain(orderRef),
			orderURL,
		}, "\n")
		return Rendered{Subject: subject, HTML: htmlBody, Text: text}
	}

	store := merchant
	if store == "" {
		store = "the merchant"
	}
	subject := "You're all set ✓"
	headline := "You're all set ✓"
	lead := fmt.Sprintf("Your payment to %s was received.", store)
	details := []kv{
		{Label: "Amount", Value: toman + " تومان", LTR: false},
		{Label: "USDT", Value: usdt + " · " + net, LTR: true},
		{Label: "Order", Value: "#" + orderRef, LTR: true},
	}
	htmlBody := layout(locale, headline, lead, details, "View order", orderURL, "Payment details")
	text := strings.Join([]string{
		headline,
		fmt.Sprintf("Your payment to %s was received.", plain(store)),
		toman + " تومان",
		usdt + " USDT · " + net,
		"Order #" + plain(orderRef),
		orderURL,
	}, "\n")
	return Rendered{Subject: subject, HTML: htmlBody, Text: text}
}

func RenderAttention(c AttentionContent) Rendered {
	locale := normalizeLocale(c.Locale)
	orderRef := html.EscapeString(strings.TrimSpace(c.OrderRef))
	orderURL := absoluteURL(c.OrderURL)
	expected := html.EscapeString(strings.TrimSpace(c.Expected))
	received := html.EscapeString(strings.TrimSpace(c.Received))

	if locale == "fa" {
		subject := "پرداخت نیاز به بررسی دارد"
		headline := "یک پرداخت نیاز به توجه شما دارد"
		lead := fmt.Sprintf("سفارش #%s — پرداختی شناسایی شد، اما نیاز به بررسی دارد.", orderRef)
		var details []kv
		if expected != "" {
			details = append(details, kv{Label: "مبلغ انتظار", Value: expected + " USDT", LTR: true})
		}
		if received != "" {
			details = append(details, kv{Label: "مبلغ دریافتی", Value: received + " USDT", LTR: true})
		}
		htmlBody := layout(locale, headline, lead, details, "باز کردن پرداخت", orderURL, "جزئیات")
		lines := []string{headline, "سفارش #" + plain(orderRef), "پرداختی شناسایی شد، اما نیاز به بررسی دارد."}
		if expected != "" {
			lines = append(lines, "مبلغ انتظار: "+plain(expected)+" USDT")
		}
		if received != "" {
			lines = append(lines, "مبلغ دریافتی: "+plain(received)+" USDT")
		}
		lines = append(lines, orderURL)
		return Rendered{Subject: subject, HTML: htmlBody, Text: strings.Join(lines, "\n")}
	}

	subject := "A payment needs your attention"
	headline := "A payment needs your attention"
	lead := fmt.Sprintf("Order #%s — we detected a payment, but it requires review.", orderRef)
	var details []kv
	if expected != "" {
		details = append(details, kv{Label: "Expected", Value: expected + " USDT", LTR: true})
	}
	if received != "" {
		details = append(details, kv{Label: "Received", Value: received + " USDT", LTR: true})
	}
	htmlBody := layout(locale, headline, lead, details, "Open payment", orderURL, "Payment details")
	lines := []string{headline, "Order #" + plain(orderRef), "We detected a payment, but it requires review."}
	if expected != "" {
		lines = append(lines, "Expected: "+plain(expected)+" USDT")
	}
	if received != "" {
		lines = append(lines, "Received: "+plain(received)+" USDT")
	}
	lines = append(lines, orderURL)
	return Rendered{Subject: subject, HTML: htmlBody, Text: strings.Join(lines, "\n")}
}

func RenderFulfillment(c FulfillmentContent) Rendered {
	locale := normalizeLocale(c.Locale)
	orderRef := html.EscapeString(strings.TrimSpace(c.OrderRef))
	orderURL := absoluteURL(c.OrderURL)
	merchant := html.EscapeString(strings.TrimSpace(c.MerchantName))
	tracking := html.EscapeString(strings.TrimSpace(c.TrackingNumber))
	provider := html.EscapeString(strings.TrimSpace(c.ShippingProvider))
	status := strings.ToUpper(strings.TrimSpace(c.Status))

	if locale == "fa" {
		subject := "سفارش شما به‌روز شد"
		headline := "سفارش شما به‌روز شد"
		lead := fmt.Sprintf("سفارش #%s از %s به‌روز شد.", orderRef, orDefault(merchant, "فروشنده"))
		if status == "SHIPPED" {
			subject = "سفارش شما در راه است"
			headline = "سفارش شما در راه است"
			lead = fmt.Sprintf("سفارش #%s از %s ارسال شد.", orderRef, orDefault(merchant, "فروشنده"))
		}
		var details []kv
		if provider != "" {
			details = append(details, kv{Label: "ارسال‌کننده", Value: provider, LTR: false})
		}
		if tracking != "" {
			details = append(details, kv{Label: "کد پیگیری", Value: tracking, LTR: true})
		}
		htmlBody := layout(locale, headline, lead, details, "مشاهده سفارش", orderURL, "جزئیات ارسال")
		lines := []string{headline, lead}
		if tracking != "" {
			lines = append(lines, "کد پیگیری: "+plain(tracking))
		}
		lines = append(lines, orderURL)
		return Rendered{Subject: subject, HTML: htmlBody, Text: strings.Join(lines, "\n")}
	}

	subject := "Your order has been updated"
	headline := "Your order has been updated"
	lead := fmt.Sprintf("Order #%s from %s was updated.", orderRef, orDefault(merchant, "the merchant"))
	if status == "SHIPPED" {
		subject = "Your order is on the way"
		headline = "Your order is on the way"
		lead = fmt.Sprintf("Order #%s from %s has shipped.", orderRef, orDefault(merchant, "the merchant"))
	}
	var details []kv
	if provider != "" {
		details = append(details, kv{Label: "Carrier", Value: provider, LTR: false})
	}
	if tracking != "" {
		details = append(details, kv{Label: "Tracking", Value: tracking, LTR: true})
	}
	htmlBody := layout(locale, headline, lead, details, "View order", orderURL, "Shipping details")
	lines := []string{headline, lead}
	if tracking != "" {
		lines = append(lines, "Tracking: "+plain(tracking))
	}
	lines = append(lines, orderURL)
	return Rendered{Subject: subject, HTML: htmlBody, Text: strings.Join(lines, "\n")}
}

type kv struct {
	Label string
	Value string
	LTR   bool
}

func layout(locale, headline, lead string, details []kv, ctaLabel, ctaURL, detailsTitle string) string {
	dir := "ltr"
	lang := "en"
	align := "left"
	if locale == "fa" {
		dir = "rtl"
		lang = "fa"
		align = "right"
	}
	var detailRows strings.Builder
	for _, d := range details {
		valDir := ""
		if d.LTR {
			valDir = ` dir="ltr" style="direction:ltr;unicode-bidi:isolate;"`
		}
		detailRows.WriteString(fmt.Sprintf(`
<tr>
  <td style="padding:8px 0;color:#5b6b66;font-size:13px;%s">%s</td>
</tr>
<tr>
  <td style="padding:0 0 12px;color:%s;font-size:16px;font-weight:600;%s"%s>%s</td>
</tr>`, textAlign(align), d.Label, brandInk, textAlign(align), valDir, d.Value))
	}

	cta := ""
	if strings.TrimSpace(ctaURL) != "" {
		cta = fmt.Sprintf(`
<tr>
  <td style="padding:24px 0 8px;%s">
    <a href="%s" style="display:inline-block;background:%s;color:#ffffff;text-decoration:none;font-weight:650;padding:12px 20px;border-radius:10px;">%s</a>
  </td>
</tr>`, textAlign(align), html.EscapeString(ctaURL), brandGreen, html.EscapeString(ctaLabel))
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="%s" dir="%s">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pooli</title></head>
<body style="margin:0;padding:0;background:#f4f7f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:%s;">
  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f4f7f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px 24px;">
        <tr><td style="font-size:22px;font-weight:750;color:%s;%s;letter-spacing:-0.02em;">Pooli</td></tr>
        <tr><td style="padding-top:20px;font-size:22px;font-weight:700;color:%s;%s;">%s</td></tr>
        <tr><td style="padding-top:10px;font-size:16px;line-height:1.5;color:#33443f;%s;">%s</td></tr>
        %s
        <tr><td style="padding-top:20px;border-top:1px solid #e4ece9;font-size:12px;font-weight:650;color:#5b6b66;text-transform:uppercase;letter-spacing:0.04em;%s;">%s</td></tr>
        %s
        <tr><td style="padding-top:28px;font-size:12px;color:#7a8a85;%s;">Pooli · pooli.shop</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, lang, dir, brandInk, brandGreen, textAlign(align), brandInk, textAlign(align), headline,
		textAlign(align), lead, cta, textAlign(align), html.EscapeString(detailsTitle), detailRows.String(), textAlign(align))
}

func textAlign(align string) string {
	return "text-align:" + align + ";"
}

func normalizeLocale(locale string) string {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(locale)), "fa") {
		return "fa"
	}
	return "en"
}

func displayNetwork(network string) string {
	switch strings.ToLower(strings.TrimSpace(network)) {
	case "tron":
		return "TRON"
	case "bsc":
		return "BNB Chain"
	default:
		return strings.ToUpper(strings.TrimSpace(network))
	}
}

func formatTomanGrouped(n int64) string {
	neg := n < 0
	if neg {
		n = -n
	}
	s := fmt.Sprintf("%d", n)
	var b strings.Builder
	for i, r := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(r)
	}
	if neg {
		return "-" + b.String()
	}
	return b.String()
}

func absoluteURL(u string) string {
	u = strings.TrimSpace(u)
	if u == "" {
		return ""
	}
	if strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://") {
		return u
	}
	return ""
}

func plain(escaped string) string {
	return html.UnescapeString(escaped)
}

func orDefault(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}
