REVOKE EXECUTE ON FUNCTION public.purge_old_readings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_readings() TO service_role;