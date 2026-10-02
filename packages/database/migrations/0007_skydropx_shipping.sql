CREATE TABLE "presale_shipping_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"postal_code" text NOT NULL,
	"quotation_id" text NOT NULL,
	"options" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "presale_campaigns" ADD COLUMN "pickup_points" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "presale_campaigns" ADD COLUMN "shipping_profile" jsonb;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "pickup_point_id" text;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "delivery_address" jsonb;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "shipping_selection" jsonb;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "shipment_id" text;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "label_url" text;--> statement-breakpoint
ALTER TABLE "presale_shipping_quotes" ADD CONSTRAINT "presale_shipping_quotes_campaign_id_presale_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."presale_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "presale_shipping_quotes_created_idx" ON "presale_shipping_quotes" USING btree ("created_at");--> statement-breakpoint
-- Tabla nueva: RLS activo y sin acceso para anon/authenticated (ver 0004).
ALTER TABLE "presale_shipping_quotes" ENABLE ROW LEVEL SECURITY;
