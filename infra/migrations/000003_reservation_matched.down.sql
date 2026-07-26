DROP INDEX IF EXISTS amount_reservations_held_uniq;

-- Revert matched rows before restoring the old check constraint.
UPDATE amount_reservations SET status = 'active' WHERE status = 'matched';

ALTER TABLE amount_reservations
  DROP CONSTRAINT IF EXISTS amount_reservations_status_check;

ALTER TABLE amount_reservations
  ADD CONSTRAINT amount_reservations_status_check
  CHECK (status IN ('active', 'released', 'consumed'));

CREATE UNIQUE INDEX amount_reservations_active_uniq
  ON amount_reservations (destination_address_normalized, network, token_contract, pay_amount_base_units)
  WHERE status = 'active';
