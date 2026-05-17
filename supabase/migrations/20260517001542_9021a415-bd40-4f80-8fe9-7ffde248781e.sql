REVOKE EXECUTE ON FUNCTION public.provision_company(text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.provision_company_with_admin(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_whatsapp_outbox(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.adjust_product_stock(uuid, integer) FROM PUBLIC, anon, authenticated;