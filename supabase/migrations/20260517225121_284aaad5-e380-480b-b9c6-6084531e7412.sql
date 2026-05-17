-- Remove leftover tenant-test invoices and their dependents.
DELETE FROM public.payments
  WHERE invoice_id IN (SELECT id FROM public.invoices WHERE invoice_number LIKE 'tt\_%' ESCAPE '\');

DELETE FROM public.invoice_items
  WHERE invoice_id IN (SELECT id FROM public.invoices WHERE invoice_number LIKE 'tt\_%' ESCAPE '\');

DELETE FROM public.invoices
  WHERE invoice_number LIKE 'tt\_%' ESCAPE '\';