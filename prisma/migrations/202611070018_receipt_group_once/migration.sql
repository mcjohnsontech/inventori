-- Validate the entire immutable receipt graph once per new batch, at commit.
-- Every child has a batch FK and the existing receipt_insert_guard requires the
-- batch to have been created in this exact transaction. Thus no child can be
-- supplemented later without a fresh root and its deferred completeness check.
-- Keep dayari_validate_receipt_group, all insert/history guards, all FKs,
-- balance reconciliation and receipt_units_complete unchanged.
BEGIN;
DROP TRIGGER receipt_complete ON "StockTransaction";
DROP TRIGGER receipt_complete ON "Receipt";
DROP TRIGGER receipt_complete ON "StockLot";
DROP TRIGGER receipt_complete ON "ReceiptLine";
DROP TRIGGER receipt_complete ON "StockMovement";
COMMIT;
