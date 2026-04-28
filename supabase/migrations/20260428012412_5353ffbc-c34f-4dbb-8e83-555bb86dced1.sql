-- Clean reset v3 — wipe ALL profiles (super admin can re-create on next sign-in if needed).

DELETE FROM public.partner_commissions;
DELETE FROM public.partner_invites;
DELETE FROM public.partners;
DELETE FROM public.payments;
DELETE FROM public.invoice_items;
DELETE FROM public.invoices;
DELETE FROM public.invoice_sequences;
DELETE FROM public.order_items;
DELETE FROM public.orders;
DELETE FROM public.loyalty_transactions;
DELETE FROM public.notifications;
DELETE FROM public.activity_logs;
DELETE FROM public.admin_activity_log;
DELETE FROM public.inventory_movements;
DELETE FROM public.inventory_levels;
DELETE FROM public.inventory_events;
DELETE FROM public.product_zones;
DELETE FROM public.product_images;
DELETE FROM public.products;
DELETE FROM public.quick_order_templates;
DELETE FROM public.sales_agents;
DELETE FROM public.media_health_scans;
DELETE FROM public.suppliers;
DELETE FROM public.company_distributor_pricing;
DELETE FROM public.distributor_territories;
DELETE FROM public.company_subscriptions;
DELETE FROM public.order_rules WHERE company_id IS NOT NULL;
DELETE FROM public.pricing_tiers WHERE company_id IS NOT NULL;

-- Drop non-super-admin user_roles
DELETE FROM public.user_roles
 WHERE role <> 'super_admin';

-- Drop ALL profiles (including super admin's — they keep auth + role)
DELETE FROM public.profiles;

-- Now safe
DELETE FROM public.territories;
DELETE FROM public.companies;

-- Auth users: keep only super admins
DELETE FROM auth.users
 WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'super_admin');

ALTER SEQUENCE IF EXISTS public.orders_number_seq RESTART WITH 1;