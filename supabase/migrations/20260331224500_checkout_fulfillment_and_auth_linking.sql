ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS auth_linked_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS customers_auth_user_id_key
ON public.customers (auth_user_id)
WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_email_lower_idx
ON public.customers ((lower(email)));

UPDATE public.customers AS c
SET
  auth_user_id = u.id,
  auth_linked_at = COALESCE(c.auth_linked_at, now())
FROM auth.users AS u
WHERE c.auth_user_id IS NULL
  AND lower(c.email) = lower(u.email);

DROP POLICY IF EXISTS "Customers can read own row" ON public.customers;
DROP POLICY IF EXISTS "Users can read own customer row" ON public.customers;

CREATE POLICY "Customers can read own row"
ON public.customers
FOR SELECT
TO authenticated
USING (
  auth.uid() = auth_user_id
  OR (
    auth_user_id IS NULL
    AND lower(auth.jwt() ->> 'email') = lower(email)
  )
);

CREATE TABLE IF NOT EXISTS public.stripe_checkout_fulfillments (
  stripe_session_id TEXT PRIMARY KEY,
  stripe_event_id TEXT UNIQUE,
  payment_intent_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  customer_email TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'fulfilled', 'failed')),
  failure_reason TEXT,
  access_granted_at TIMESTAMP WITH TIME ZONE,
  magic_link_generated_at TIMESTAMP WITH TIME ZONE,
  welcome_email_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_checkout_fulfillments_customer_email_idx
ON public.stripe_checkout_fulfillments (customer_email);

CREATE INDEX IF NOT EXISTS stripe_checkout_fulfillments_status_idx
ON public.stripe_checkout_fulfillments (status);

ALTER TABLE public.stripe_checkout_fulfillments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access stripe_checkout_fulfillments" ON public.stripe_checkout_fulfillments;
CREATE POLICY "Service role full access stripe_checkout_fulfillments"
ON public.stripe_checkout_fulfillments
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.claim_customer_for_auth_user(
  p_auth_user_id UUID,
  p_email TEXT
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  course_access BOOLEAN,
  auth_user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_email TEXT := lower(trim(COALESCE(p_email, '')));
BEGIN
  IF p_auth_user_id IS NULL OR normalized_email = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH existing AS (
    SELECT c.id, c.email, c.course_access, c.auth_user_id
    FROM public.customers AS c
    WHERE c.auth_user_id = p_auth_user_id
  ),
  claimed AS (
    UPDATE public.customers AS c
    SET
      auth_user_id = p_auth_user_id,
      auth_linked_at = COALESCE(c.auth_linked_at, now()),
      email = normalized_email
    WHERE NOT EXISTS (SELECT 1 FROM existing)
      AND c.auth_user_id IS NULL
      AND lower(c.email) = normalized_email
    RETURNING c.id, c.email, c.course_access, c.auth_user_id
  )
  SELECT * FROM existing
  UNION ALL
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_customer_for_auth_user(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_customer_for_auth_user(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_customer_for_auth_user(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_for_auth_user(UUID, TEXT) TO service_role;
