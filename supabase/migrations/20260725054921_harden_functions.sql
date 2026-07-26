-- Fix advisor warnings: pin search_path on set_updated_at; tighten current_business_id() grants.
-- current_business_id() must stay executable by `authenticated` — RLS policies invoke it as the
-- connecting role, so revoking that would break every tenant policy. Revoking from anon/PUBLIC is
-- safe and removes the unauthenticated-callable surface.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.current_business_id() from public;
revoke execute on function public.current_business_id() from anon;
grant execute on function public.current_business_id() to authenticated;
