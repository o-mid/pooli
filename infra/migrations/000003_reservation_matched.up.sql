-- Phase 3: lock payable amount on first match without treating it as settled.

ALTER TABLE amount_reservations
  DROP CONSTRAINT IF EXISTS amount_reservations_status_check;

ALTER TABLE amount_reservations
  ADD CONSTRAINT amount_reservations_status_check
  CHECK (status IN ('active', 'matched', 'released', 'consumed'));

DROP INDEX IF EXISTS amount_reservations_active_uniq;

-- Amount stays exclusive while reserved OR matched (awaiting confirmations).
CREATE UNIQUE INDEX amount_reservations_held_uniq
  ON amount_reservations (destination_address_normalized, network, token_contract, pay_amount_base_units)
  WHERE status IN ('active', 'matched');
