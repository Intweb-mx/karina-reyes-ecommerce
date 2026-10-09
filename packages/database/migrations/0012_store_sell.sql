CREATE TABLE "store_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"pickup_enabled" boolean DEFAULT false NOT NULL,
	"pickup_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"shipping_enabled" boolean DEFAULT false NOT NULL,
	"shipping_profile" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_settings_singleton_check" CHECK ("store_settings"."id" = 'default')
);
--> statement-breakpoint
CREATE TABLE "store_shipping_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lines" jsonb NOT NULL,
	"postal_code" text NOT NULL,
	"quotation_id" text NOT NULL,
	"currency" text NOT NULL,
	"options" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store_orders" ADD COLUMN "confirmation_email_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "store_shipping_quotes_created_idx" ON "store_shipping_quotes" USING btree ("created_at");--> statement-breakpoint
-- Tablas nuevas: RLS activo y sin acceso para anon/authenticated (ver 0004).
ALTER TABLE "store_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_shipping_quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  role_name text;
BEGIN
  -- Los roles solo existen en Supabase (no en PGlite de pruebas).
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "store_settings", "store_shipping_quotes" FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
