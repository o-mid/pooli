package domain

// Fulfillment statuses are independent of payment intent status.
const (
	FulfillmentUnfulfilled = "UNFULFILLED"
	FulfillmentProcessing  = "PROCESSING"
	FulfillmentShipped     = "SHIPPED"
	FulfillmentDelivered   = "DELIVERED"
	FulfillmentCancelled   = "CANCELLED"
)

// Customer field requirement modes for merchant checkout defaults.
const (
	FieldModeRequired = "required"
	FieldModeOptional = "optional"
	FieldModeDisabled = "disabled"
)

// Canonical checkout field keys snapped onto each order.
const (
	FieldFullName         = "full_name"
	FieldPhone            = "phone"
	FieldShippingAddress  = "shipping_address"
	FieldPostalCode       = "postal_code"
	FieldEmail            = "email"
	FieldCustomerNote     = "customer_note"
)

var DefaultCustomerFieldModes = map[string]string{
	FieldFullName:        FieldModeRequired,
	FieldPhone:           FieldModeRequired,
	FieldShippingAddress: FieldModeRequired,
	FieldPostalCode:      FieldModeOptional,
	FieldEmail:           FieldModeDisabled,
	FieldCustomerNote:    FieldModeDisabled,
}

var CheckoutFieldMeta = map[string]struct {
	Label string
	Type  string
}{
	FieldFullName:        {Label: "Full name", Type: "text"},
	FieldPhone:           {Label: "Phone", Type: "phone"},
	FieldShippingAddress: {Label: "Shipping address", Type: "textarea"},
	FieldPostalCode:      {Label: "Postal code", Type: "text"},
	FieldEmail:           {Label: "Email", Type: "email"},
	FieldCustomerNote:    {Label: "Customer note", Type: "textarea"},
}

// FieldKeyOrder is the stable sort order for checkout fields.
var FieldKeyOrder = []string{
	FieldFullName,
	FieldPhone,
	FieldEmail,
	FieldShippingAddress,
	FieldPostalCode,
	FieldCustomerNote,
}

// CanTransitionFulfillment returns whether from→to is allowed.
// Payment PAID gate is enforced by the caller.
func CanTransitionFulfillment(from, to string) bool {
	if from == to {
		return true
	}
	allowed := map[string]map[string]bool{
		FulfillmentUnfulfilled: {
			FulfillmentProcessing: true,
			FulfillmentShipped:    true,
			FulfillmentCancelled:  true,
		},
		FulfillmentProcessing: {
			FulfillmentShipped:   true,
			FulfillmentCancelled: true,
			FulfillmentUnfulfilled: true,
		},
		FulfillmentShipped: {
			FulfillmentDelivered: true,
			FulfillmentCancelled: true,
		},
		FulfillmentDelivered: {},
		FulfillmentCancelled: {},
	}
	next, ok := allowed[from]
	if !ok {
		return false
	}
	return next[to]
}
