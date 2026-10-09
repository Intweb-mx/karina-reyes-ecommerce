CREATE TYPE "public"."store_delivery_method" AS ENUM('shipping', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."store_fulfillment_status" AS ENUM('confirmed', 'preparing', 'label_generated', 'ready_for_pickup', 'handed_to_carrier', 'in_transit', 'out_for_delivery', 'delivered', 'exception');--> statement-breakpoint
CREATE TYPE "public"."store_payment_status" AS ENUM('pending', 'authorized', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."store_product_type" AS ENUM('physical', 'digital');--> statement-breakpoint
CREATE TYPE "public"."store_sale_status" AS ENUM('coming_soon', 'presale', 'on_sale');--> statement-breakpoint
CREATE TYPE "public"."store_stock_reason" AS ENUM('reception', 'adjustment', 'damage', 'return', 'correction', 'sale', 'reservation', 'release');--> statement-breakpoint
CREATE TABLE "store_inventory" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_inventory_levels_check" CHECK ("store_inventory"."reserved" >= 0 and "store_inventory"."on_hand" >= "store_inventory"."reserved")
);
--> statement-breakpoint
CREATE TABLE "store_order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"actor" text,
	"external_ref" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_slug" text NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_order_items_order_product_unique" UNIQUE("order_id","product_id"),
	CONSTRAINT "store_order_items_quantity_check" CHECK ("store_order_items"."quantity" >= 1),
	CONSTRAINT "store_order_items_amount_check" CHECK ("store_order_items"."unit_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "store_order_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_order_notes_body_check" CHECK (char_length("store_order_notes"."body") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "store_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"payment_status" "store_payment_status" DEFAULT 'pending' NOT NULL,
	"fulfillment_status" "store_fulfillment_status" DEFAULT 'confirmed' NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"delivery_method" "store_delivery_method" NOT NULL,
	"pickup_point_id" text,
	"delivery_address" jsonb,
	"shipping_selection" jsonb,
	"subtotal_amount" integer NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"shipping_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer NOT NULL,
	"currency" text NOT NULL,
	"terms_version" integer NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"idempotency_key" text,
	"stripe_checkout_session_id" text,
	"stripe_checkout_url" text,
	"checkout_expires_at" timestamp with time zone,
	"stripe_payment_intent_id" text,
	"inventory_reserved" boolean DEFAULT false NOT NULL,
	"paid_at" timestamp with time zone,
	"amount_refunded" integer DEFAULT 0 NOT NULL,
	"carrier" text,
	"tracking_number" text,
	"tracking_url" text,
	"shipment_id" text,
	"label_url" text,
	"fulfilled_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"attribution" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_orders_orderNumber_unique" UNIQUE("order_number"),
	CONSTRAINT "store_orders_idempotencyKey_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "store_orders_stripeCheckoutSessionId_unique" UNIQUE("stripe_checkout_session_id"),
	CONSTRAINT "store_orders_stripePaymentIntentId_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "store_orders_total_check" CHECK ("store_orders"."total_amount" = "store_orders"."subtotal_amount" - "store_orders"."discount_amount" + "store_orders"."shipping_amount"),
	CONSTRAINT "store_orders_amounts_check" CHECK ("store_orders"."subtotal_amount" >= 0 and "store_orders"."discount_amount" >= 0 and "store_orders"."discount_amount" <= "store_orders"."subtotal_amount" and "store_orders"."shipping_amount" >= 0),
	CONSTRAINT "store_orders_shipping_check" CHECK ("store_orders"."delivery_method" = 'shipping' or "store_orders"."shipping_amount" = 0),
	CONSTRAINT "store_orders_refund_check" CHECK ("store_orders"."amount_refunded" between 0 and "store_orders"."total_amount")
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"type" "store_product_type" DEFAULT 'physical' NOT NULL,
	"sale_status" "store_sale_status" DEFAULT 'coming_soon' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"price" integer,
	"compare_at_price" integer,
	"currency" text DEFAULT 'mxn' NOT NULL,
	"max_quantity_per_order" integer DEFAULT 10 NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"weight_grams" integer,
	"length_cm" integer,
	"width_cm" integer,
	"height_cm" integer,
	"territories" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "store_products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "store_products_price_check" CHECK ("store_products"."price" is null or "store_products"."price" >= 0),
	CONSTRAINT "store_products_compare_price_check" CHECK ("store_products"."compare_at_price" is null or "store_products"."compare_at_price" >= 0),
	CONSTRAINT "store_products_max_quantity_check" CHECK ("store_products"."max_quantity_per_order" between 1 and 100),
	CONSTRAINT "store_products_low_stock_check" CHECK ("store_products"."low_stock_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "store_stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"delta_on_hand" integer DEFAULT 0 NOT NULL,
	"delta_reserved" integer DEFAULT 0 NOT NULL,
	"reason" "store_stock_reason" NOT NULL,
	"order_id" uuid,
	"actor" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_stock_movements_delta_check" CHECK ("store_stock_movements"."delta_on_hand" <> 0 or "store_stock_movements"."delta_reserved" <> 0)
);
--> statement-breakpoint
ALTER TABLE "store_inventory" ADD CONSTRAINT "store_inventory_product_id_store_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_order_events" ADD CONSTRAINT "store_order_events_order_id_store_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."store_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_order_items" ADD CONSTRAINT "store_order_items_order_id_store_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."store_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_order_items" ADD CONSTRAINT "store_order_items_product_id_store_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_order_notes" ADD CONSTRAINT "store_order_notes_order_id_store_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."store_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_stock_movements" ADD CONSTRAINT "store_stock_movements_product_id_store_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_stock_movements" ADD CONSTRAINT "store_stock_movements_order_id_store_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."store_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_order_events_order_idx" ON "store_order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "store_order_items_product_idx" ON "store_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "store_order_notes_order_idx" ON "store_order_notes" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "store_orders_payment_created_idx" ON "store_orders" USING btree ("payment_status","created_at");--> statement-breakpoint
CREATE INDEX "store_orders_email_idx" ON "store_orders" USING btree ("email");--> statement-breakpoint
CREATE INDEX "store_stock_movements_product_idx" ON "store_stock_movements" USING btree ("product_id","created_at");
--> statement-breakpoint
-- Tablas nuevas: RLS activo y sin acceso para anon/authenticated (ver 0004).
ALTER TABLE "store_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_inventory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_order_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_order_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Historiales append-only.
CREATE FUNCTION "store_stock_movements_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'store_stock_movements es append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "store_stock_movements_no_update_delete"
  BEFORE UPDATE OR DELETE ON "store_stock_movements"
  FOR EACH ROW EXECUTE FUNCTION "store_stock_movements_append_only"();--> statement-breakpoint
CREATE FUNCTION "store_order_events_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'store_order_events es append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "store_order_events_no_update_delete"
  BEFORE UPDATE OR DELETE ON "store_order_events"
  FOR EACH ROW EXECUTE FUNCTION "store_order_events_append_only"();--> statement-breakpoint
CREATE FUNCTION "store_order_notes_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'store_order_notes es append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "store_order_notes_no_update_delete"
  BEFORE UPDATE OR DELETE ON "store_order_notes"
  FOR EACH ROW EXECUTE FUNCTION "store_order_notes_append_only"();
