
REVOKE EXECUTE ON FUNCTION public.auto_close_stale_breaks() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_messages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_break_logs() FROM PUBLIC, anon, authenticated;
