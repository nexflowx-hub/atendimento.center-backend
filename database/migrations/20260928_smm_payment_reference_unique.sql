-- Applied to Atlas Platform Core as migration smm_payment_reference_unique.
-- Prevents two Atlas SMM orders from sharing the same XPAYMENTS checkout reference.

create unique index if not exists smm_orders_payment_reference_unique
  on smm.orders(payment_reference)
  where payment_reference is not null;
