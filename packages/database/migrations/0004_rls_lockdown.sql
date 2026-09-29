-- Supabase expone el esquema public por su API REST con la llave publicable.
-- Ninguna tabla de negocio debe ser accesible por esa vía: RLS activo sin
-- políticas y sin privilegios para anon/authenticated. El servidor usa su
-- propia conexión (rol postgres), que no pasa por la API.
ALTER TABLE "presale_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "presale_terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "presale_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "presale_reservation_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  role_name text;
BEGIN
  -- Los roles solo existen en Supabase (no en PGlite de pruebas).
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', role_name);
      -- Tablas futuras creadas por las migraciones tampoco quedan expuestas.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;--> statement-breakpoint
CREATE FUNCTION "admin_audit_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log es append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "admin_audit_log_no_update_delete"
  BEFORE UPDATE OR DELETE ON "admin_audit_log"
  FOR EACH ROW EXECUTE FUNCTION "admin_audit_log_append_only"();--> statement-breakpoint
-- Los términos publicados no se editan: se publica una versión nueva.
CREATE FUNCTION "presale_terms_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'presale_terms es inmutable: publica una versión nueva';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "presale_terms_no_update_delete"
  BEFORE UPDATE OR DELETE ON "presale_terms"
  FOR EACH ROW EXECUTE FUNCTION "presale_terms_immutable"();
