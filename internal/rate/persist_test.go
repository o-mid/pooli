package rate

import (
	"context"
	"testing"
	"time"

	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/pooli-shop/pooli/internal/testutil"
	"github.com/shopspring/decimal"
)

func TestPersistQuote(t *testing.T) {
	pool := testutil.Connect(t)
	testutil.Reset(t, pool)
	q := domain.RateQuote{
		Rate:            decimal.NewFromInt(126000),
		Source:          "wallex",
		FetchedAt:       time.Now().UTC(),
		Policy:          "lastPrice",
		SourcePair:      "USDTTMN",
		SourceCurrency:  "TMN",
		DisplayCurrency: "TMN",
	}
	if err := PersistQuote(context.Background(), pool, q); err != nil {
		t.Fatal(err)
	}
	var source string
	var age float64
	if err := pool.QueryRow(context.Background(), `
		SELECT source, EXTRACT(EPOCH FROM (now() - fetched_at))
		FROM exchange_rate_quotes ORDER BY fetched_at DESC LIMIT 1`).Scan(&source, &age); err != nil {
		t.Fatal(err)
	}
	if source != "wallex" {
		t.Fatalf("source %s", source)
	}
	if age > 5 {
		t.Fatalf("age %v", age)
	}
}
