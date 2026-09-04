GRANT SELECT ON public.ai_api_keys TO authenticated;
GRANT ALL ON public.ai_api_keys TO service_role;

DROP POLICY IF EXISTS "Admins can view AI API keys" ON public.ai_api_keys;
CREATE POLICY "Admins can view AI API keys"
ON public.ai_api_keys FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));