create or replace function public.activity_counts(p_company_id uuid)
returns table(entity_type text, count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select entity_type, count(*)::bigint
  from public.activity_logs
  where company_id = p_company_id
    and (
      public.is_super_admin(auth.uid())
      or company_id = public.current_company_id()
    )
  group by entity_type;
$$;

grant execute on function public.activity_counts(uuid) to authenticated;