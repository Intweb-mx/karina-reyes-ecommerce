CREATE TYPE "public"."presale_delivery_method" AS ENUM('shipping', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."presale_fulfillment_status" AS ENUM('pending', 'ready_for_pickup', 'shipped', 'delivered');--> statement-breakpoint
CREATE TABLE "presale_bonus_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"first_opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presale_bonus_links_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "presale_reservations" DROP CONSTRAINT "presale_reservations_total_check";--> statement-breakpoint
ALTER TABLE "presale_campaigns" ADD COLUMN "pickup_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "presale_campaigns" ADD COLUMN "shipping_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "presale_campaigns" ADD COLUMN "shipping_amount" integer;--> statement-breakpoint
ALTER TABLE "presale_campaigns" ADD COLUMN "bonus" jsonb;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "delivery_method" "presale_delivery_method" DEFAULT 'shipping' NOT NULL;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "shipping_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "fulfillment_status" "presale_fulfillment_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "carrier" text;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "tracking_url" text;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "fulfilled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "bonus_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "presale_bonus_links" ADD CONSTRAINT "presale_bonus_links_reservation_id_presale_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."presale_reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "presale_bonus_links_reservation_idx" ON "presale_bonus_links" USING btree ("reservation_id");--> statement-breakpoint
ALTER TABLE "presale_campaigns" ADD CONSTRAINT "presale_campaigns_shipping_amount_check" CHECK ("presale_campaigns"."shipping_amount" is null or "presale_campaigns"."shipping_amount" >= 0);--> statement-breakpoint
ALTER TABLE "presale_campaigns" ADD CONSTRAINT "presale_campaigns_delivery_check" CHECK ("presale_campaigns"."pickup_enabled" or "presale_campaigns"."shipping_enabled");--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD CONSTRAINT "presale_reservations_shipping_check" CHECK ("presale_reservations"."shipping_amount" >= 0 and ("presale_reservations"."delivery_method" = 'shipping' or "presale_reservations"."shipping_amount" = 0));--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD CONSTRAINT "presale_reservations_total_check" CHECK ("presale_reservations"."total_amount" = "presale_reservations"."unit_amount" * "presale_reservations"."quantity" + "presale_reservations"."shipping_amount");--> statement-breakpoint
-- Tabla nueva: RLS activo y sin acceso para anon/authenticated (ver 0004).
ALTER TABLE "presale_bonus_links" ENABLE ROW LEVEL SECURITY;
