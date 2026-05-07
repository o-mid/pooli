#!/usr/bin/env bash
# Full MVP vertical-slice verification (local simulator, no mainnet funds).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
API="${API_BASE_URL:-http://127.0.0.1:8080}"
export DATABASE_URL="${DATABASE_URL:-postgres://pooli:pooli@localhost:5432/pooli?sslmode=disable}"

echo "==> unit/integration tests (isolated via TRUNCATE)"
go test $(go list ./... | grep -v /node_modules/)

echo "==> ensure API health"
curl -fsS "$API/healthz" >/dev/null

python3 - <<'PY'
import json, os, subprocess, time, urllib.request, http.cookiejar, urllib.error

API = os.environ.get("API_BASE_URL", "http://127.0.0.1:8080")
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def req(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(API + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with opener.open(r) as resp:
            return resp.status, json.load(resp)
    except urllib.error.HTTPError as e:
        payload = e.read().decode()
        raise RuntimeError(f"{method} {path} -> {e.code}: {payload}") from e

def simulate(option_id):
    out = subprocess.check_output(["./scripts/simulate-chain-event.sh", option_id], env={**os.environ, "API_BASE_URL": API})
    return json.loads(out.decode())

email = f"verify{int(time.time())}@pooli.test"
print("1) register/login")
req("POST", "/api/v1/auth/register", {
    "email": email, "password": "password123", "name": "Verify", "merchant_name": "Verify Store"
})
print("2) wallets")
req("POST", "/api/v1/wallets", {"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "TRON", "is_default": True})
req("POST", "/api/v1/wallets", {"network": "bsc", "address": "0x1111111111111111111111111111111111111111", "label": "BSC", "is_default": True})

print("3) create payment intent / unique amount / checkout")
order = req("POST", "/api/v1/orders", {"fiat_amount_toman": 3800000, "title": "Verify hoodie"})[1]
slug = order["slug"]
opts = order["payment_intent"]["options"]
assert len(opts) >= 1, order
amounts = sorted(o["pay_usdt_amount_base_units"] for o in opts)
print("   reserved amounts", amounts)
tron = next(o for o in opts if o["network"] == "tron")
bsc = next(o for o in opts if o["network"] == "bsc")

print("4) concurrent similar base amounts stay unique per network")
order2 = req("POST", "/api/v1/orders", {"fiat_amount_toman": 3800000, "title": "Verify hoodie 2"})[1]
opts2 = order2["payment_intent"]["options"]
by_net = {}
for o in opts + opts2:
    by_net.setdefault(o["network"], []).append(o["pay_usdt_amount_base_units"])
for net, amts in by_net.items():
    assert len(amts) == len(set(amts)), (net, amts)
    print("  ", net, amts)

print("5) buyer checkout details")
req("POST", f"/api/v1/public/pay/{slug}/customer-details", {
    "values": {"full_name": "Buyer", "phone": "09120000000", "shipping_address": "Tehran", "postal_code": "1234567890"}
})
req("POST", f"/api/v1/public/pay/{slug}/select-network", {"network": "tron"})

print("6) API restart must not lose awaiting state")
intent_before = req("GET", f"/api/v1/public/pay/{slug}")[1]["payment_intent"]
assert intent_before["status"] == "AWAITING_PAYMENT", intent_before["status"]
# signal external restart helper via env marker file
open("/tmp/pooli-verify-restart.flag", "w").write(intent_before["id"])
print("   wrote restart flag; waiting for API to bounce...")
# wait until health returns after a brief gap (script orchestrator restarts API)
deadline = time.time() + 45
saw_down = False
while time.time() < deadline:
    try:
        urllib.request.urlopen(API + "/healthz", timeout=1).read()
        if saw_down:
            break
    except Exception:
        saw_down = True
    time.sleep(0.4)
else:
    raise RuntimeError("API did not recover after restart window")
intent_after = req("GET", f"/api/v1/public/pay/{slug}")[1]["payment_intent"]
assert intent_after["status"] == "AWAITING_PAYMENT", intent_after["status"]
assert intent_after["id"] == intent_before["id"]
print("   state persisted across restart:", intent_after["status"])

print("7) simulate TRON transfer → verify/match → PAID")
sim = simulate(tron["id"])
assert sim["new_status"] == "PAID", sim
assert sim["match_type"] == "EXACT", sim
paid = req("GET", f"/api/v1/public/pay/{slug}")[1]
assert paid["payment_intent"]["status"] == "PAID"
assert paid["status"] == "PAID"
seller_order = req("GET", f"/api/v1/orders/{order['id']}")[1]
assert seller_order["payment_intent"]["status"] == "PAID"
print("   buyer+seller PAID OK")

print("8) duplicate/reused event is ignored")
# replay exact same simulate body by calling simulate again with same option creates new event_id;
# idempotency of same event_id tested in Go. Here second exact payment after PAID → DUPLICATE_PAYMENT
# reactivate reservation for same amount
subprocess.check_call([
    "docker", "compose", "exec", "-T", "postgres",
    "psql", "-U", "pooli", "-d", "pooli", "-c",
    f"UPDATE amount_reservations SET status='active' WHERE payment_option_id='{tron['id']}';"
    f"UPDATE payment_intents SET status='PAID' WHERE id='{intent_after['id']}';"
])
sim2 = simulate(tron["id"])
assert sim2["new_status"] == "DUPLICATE_PAYMENT", sim2

print("9) under/over/expired/wrong-token paths via Go tests already; spot-check BSC exact")
order3 = req("POST", "/api/v1/orders", {"fiat_amount_toman": 2500000, "title": "BSC item"})[1]
bsc_opt = next(o for o in order3["payment_intent"]["options"] if o["network"] == "bsc")
sim3 = simulate(bsc_opt["id"])
assert sim3["new_status"] == "PAID", sim3
print("   BSC PAID OK")

print("VERIFY_MVP_OK")
PY
