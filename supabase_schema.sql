CREATE TABLE public.licenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    key TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active'::text NOT NULL,
    registered_devices JSONB DEFAULT '[]'::jsonb NOT NULL,
    max_devices SMALLINT DEFAULT 2 NOT NULL,
    config_payload JSONB DEFAULT NULL,
    customer_email TEXT DEFAULT NULL,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

CREATE INDEX idx_licenses_key ON public.licenses(key);

INSERT INTO public.licenses (key, status, max_devices)
VALUES ('VIP-DIOS-123', 'active', 99);

CREATE TABLE public.trials (
    fingerprint TEXT PRIMARY KEY,
    actions_used INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla para prevenir Fuerza Bruta (Brute Force Protection)
CREATE TABLE public.auth_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id TEXT NOT NULL,
    attempt_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    success BOOLEAN DEFAULT false
);
CREATE INDEX idx_auth_logs_device ON public.auth_logs(device_id);

CREATE OR REPLACE FUNCTION get_trial_status(p_fingerprint text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_used integer;
BEGIN
  SELECT actions_used INTO v_used FROM public.trials WHERE fingerprint = p_fingerprint LIMIT 1;
  
  IF NOT FOUND THEN
    INSERT INTO public.trials (fingerprint, actions_used) VALUES (p_fingerprint, 0);
    RETURN jsonb_build_object('used', 0, 'limit', 80);
  END IF;

  RETURN jsonb_build_object('used', v_used, 'limit', 80);
END;
$$;

CREATE OR REPLACE FUNCTION increment_trial(p_fingerprint text, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_used integer;
BEGIN
  UPDATE public.trials 
  SET actions_used = actions_used + p_amount 
  WHERE fingerprint = p_fingerprint
  RETURNING actions_used INTO v_used;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Trial no iniciado.');
  END IF;

  RETURN jsonb_build_object('status', 'success', 'used', v_used);
END;
$$;

-- VALIDACIÓN ENTERPRISE CON PROTECCIÓN ANTI-HACK
CREATE OR REPLACE FUNCTION validate_license_v2(p_key text, p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lic record;
  v_devices jsonb;
  v_recent_fails integer;
BEGIN
  -- 1. Check for Brute Force (5 fails in last 10 mins)
  SELECT count(*) INTO v_recent_fails 
  FROM public.auth_logs 
  WHERE device_id = p_device_id 
    AND success = false 
    AND attempt_at > now() - interval '10 minutes';

  IF v_recent_fails >= 5 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Demasiados intentos. Bloqueado por 10 min por seguridad.');
  END IF;

  -- 2. Validate Key
  SELECT * INTO v_lic FROM public.licenses WHERE key = p_key LIMIT 1;
  
  IF NOT FOUND THEN
    INSERT INTO public.auth_logs (device_id, success) VALUES (p_device_id, false);
    RETURN jsonb_build_object('status', 'error', 'message', 'Licencia no válida.');
  END IF;

  IF v_lic.status != 'active' THEN
    INSERT INTO public.auth_logs (device_id, success) VALUES (p_device_id, false);
    RETURN jsonb_build_object('status', 'error', 'message', 'Licencia suspendida por el Administrador.');
  END IF;

  IF v_lic.expires_at IS NOT NULL AND v_lic.expires_at < now() THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Suscripción vencida. Renueva en RepostPRO.com');
  END IF;

  -- 3. Device Registration
  v_devices := v_lic.registered_devices;
  IF NOT (v_devices ? p_device_id) THEN
    IF jsonb_array_length(v_devices) >= v_lic.max_devices THEN
      RETURN jsonb_build_object('status', 'error', 'message', 'Límite de dispositivos (2) excedido.');
    END IF;
    v_devices := v_devices || jsonb_build_array(p_device_id);
    UPDATE public.licenses SET registered_devices = v_devices WHERE id = v_lic.id;
  END IF;

  -- 4. Success Log
  INSERT INTO public.auth_logs (device_id, success) VALUES (p_device_id, true);

  RETURN jsonb_build_object(
    'status', 'success', 
    'config_payload', v_lic.config_payload,
    'customer_email', v_lic.customer_email,
    'expires_at', v_lic.expires_at
  );
END;
$$;
