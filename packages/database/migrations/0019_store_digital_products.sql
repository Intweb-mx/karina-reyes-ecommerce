ALTER TYPE "public"."store_delivery_method" ADD VALUE 'digital';--> statement-breakpoint
CREATE TABLE "store_download_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "store_download_links_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "store_order_items" ADD COLUMN "digital" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "store_products" ADD COLUMN "digital_file_key" text;--> statement-breakpoint
ALTER TABLE "store_download_links" ADD CONSTRAINT "store_download_links_order_id_store_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."store_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_download_links" ADD CONSTRAINT "store_download_links_product_id_store_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_download_links_order_idx" ON "store_download_links" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_digital_check" CHECK ("store_products"."type" = 'physical' and "store_products"."digital_file_key" is null or "store_products"."type" = 'digital' and "store_products"."stock_product_id" is null);--> statement-breakpoint
-- Tabla nueva: RLS activo y sin acceso para anon/authenticated (ver 0004).
ALTER TABLE "store_download_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  role_name text;
BEGIN
  -- Los roles solo existen en Supabase (no en PGlite de pruebas).
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "store_download_links" FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
