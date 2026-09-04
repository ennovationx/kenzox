GRANT SELECT ON public.netlify_connections TO authenticated;
GRANT ALL ON public.netlify_connections TO service_role;
GRANT ALL ON public.netlify_oauth_states TO service_role;
GRANT SELECT ON public.project_deploys TO authenticated;
GRANT ALL ON public.project_deploys TO service_role;

DROP POLICY IF EXISTS "Users can view their own Netlify connection" ON public.netlify_connections;
CREATE POLICY "Users can view their own Netlify connection"
ON public.netlify_connections FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "OAuth states are service-role only" ON public.netlify_oauth_states;
CREATE POLICY "OAuth states are service-role only"
ON public.netlify_oauth_states FOR ALL TO authenticated
USING (false) WITH CHECK (false);

REVOKE EXECUTE ON FUNCTION public.owns_project(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.share_role(uuid, uuid) FROM anon;