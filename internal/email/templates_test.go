package email

import (
	"strings"
	"testing"
)

func TestRenderPaidMerchantEN(t *testing.T) {
	r := RenderPaid(PaidContent{
		Locale: "en", Role: "merchant", CustomerName: "Sara <script>",
		OrderRef: "1842", OrderURL: "https://pooli.shop/app/orders/abc",
		Toman: 3800000, USDTBase: 29841723, Network: "tron",
	})
	if !strings.Contains(r.Subject, "Payment received") {
		t.Fatalf("subject=%q", r.Subject)
	}
	if strings.Contains(r.HTML, "<script>") {
		t.Fatal("unescaped script in HTML")
	}
	if !strings.Contains(r.HTML, "Sara &lt;script&gt;") && !strings.Contains(r.HTML, "Sara") {
		t.Fatal("customer missing")
	}
	if !strings.Contains(r.HTML, "3,800,000") {
		t.Fatal("toman formatting missing")
	}
	if !strings.Contains(r.HTML, "https://pooli.shop/app/orders/abc") {
		t.Fatal("absolute link missing")
	}
	if !strings.Contains(r.Text, "View order") && !strings.Contains(r.Text, "pooli.shop") {
		t.Fatal("text body incomplete")
	}
}

func TestRenderPaidMerchantFA(t *testing.T) {
	r := RenderPaid(PaidContent{
		Locale: "fa", Role: "merchant", CustomerName: "سارا",
		OrderRef: "1842", OrderURL: "https://pooli.shop/app/orders/abc",
		Toman: 3800000, USDTBase: 29841723, Network: "tron",
	})
	if !strings.Contains(r.Subject, "پرداخت") {
		t.Fatalf("subject=%q", r.Subject)
	}
	if !strings.Contains(r.HTML, `dir="rtl"`) || !strings.Contains(r.HTML, `lang="fa"`) {
		t.Fatal("missing rtl/fa")
	}
	if !strings.Contains(r.HTML, `dir="ltr"`) {
		t.Fatal("technical values should stay LTR")
	}
}

func TestRenderBuyerENAndFA(t *testing.T) {
	en := RenderPaid(PaidContent{
		Locale: "en", Role: "buyer", MerchantName: "Tehran Sneakers",
		OrderRef: "1842", OrderURL: "https://pooli.shop/p/slug",
		Toman: 3800000, USDTBase: 29841723, Network: "tron",
	})
	if !strings.Contains(en.Subject, "You're all set") {
		t.Fatalf("en subject=%q", en.Subject)
	}
	if !strings.Contains(en.HTML, "Tehran Sneakers") {
		t.Fatal("merchant missing")
	}
	fa := RenderPaid(PaidContent{
		Locale: "fa", Role: "buyer", MerchantName: "کفش تهران",
		OrderRef: "1842", OrderURL: "https://pooli.shop/p/slug",
		Toman: 3800000, USDTBase: 29841723, Network: "tron",
	})
	if !strings.Contains(fa.HTML, `dir="rtl"`) {
		t.Fatal("buyer fa rtl")
	}
}

func TestRenderAttentionDoesNotAskResend(t *testing.T) {
	r := RenderAttention(AttentionContent{
		Locale: "en", OrderRef: "1842", OrderURL: "https://pooli.shop/app/orders/x",
		Expected: "29.841723", Received: "29.840000",
	})
	lower := strings.ToLower(r.HTML + r.Text)
	if strings.Contains(lower, "send again") || strings.Contains(lower, "send money") {
		t.Fatal("must not instruct resending funds")
	}
}
