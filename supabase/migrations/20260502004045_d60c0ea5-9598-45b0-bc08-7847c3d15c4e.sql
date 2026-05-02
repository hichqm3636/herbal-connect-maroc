ALTER TABLE public.invoices
  ADD CONSTRAINT fk_invoices_buyer
  FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

NOTIFY pgrst, 'reload schema';