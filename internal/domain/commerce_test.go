package domain

import "testing"

func TestCanTransitionFulfillment(t *testing.T) {
	cases := []struct {
		from, to string
		ok       bool
	}{
		{FulfillmentUnfulfilled, FulfillmentProcessing, true},
		{FulfillmentUnfulfilled, FulfillmentShipped, true},
		{FulfillmentUnfulfilled, FulfillmentDelivered, false},
		{FulfillmentProcessing, FulfillmentShipped, true},
		{FulfillmentShipped, FulfillmentDelivered, true},
		{FulfillmentDelivered, FulfillmentShipped, false},
		{FulfillmentCancelled, FulfillmentProcessing, false},
		{FulfillmentShipped, FulfillmentShipped, true},
	}
	for _, tc := range cases {
		got := CanTransitionFulfillment(tc.from, tc.to)
		if got != tc.ok {
			t.Fatalf("%s -> %s: got %v want %v", tc.from, tc.to, got, tc.ok)
		}
	}
}
