CREATE TYPE "public"."presale_campaign_status" AS ENUM('draft', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."presale_reservation_status" AS ENUM('pending_payment', 'processing', 'paid', 'payment_failed', 'expired', 'partially_refunded', 'refunded', 'canceled');--> statement-breakpoint
CREATE TABLE "presale_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"product_name" text NOT NULL,
	"product_sku" text,
	"status" "presale_campaign_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"unit_amount" integer NOT NULL,
	"currency" text DEFAULT 'mxn' NOT NULL,
	"max_quantity_per_reservation" integer DEFAULT 1 NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"delivery_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presale_campaigns_slug_unique" UNIQUE("slug"),
	CONSTRAINT "presale_campaigns_dates_check" CHECK ("presale_campaigns"."ends_at" > "presale_campaigns"."starts_at"),
	CONSTRAINT "presale_campaigns_amount_check" CHECK ("presale_campaigns"."unit_amount" > 0),
	CONSTRAINT "presale_campaigns_currency_check" CHECK ("presale_campaigns"."currency" ~ '^[a-z]{3}$'),
	CONSTRAINT "presale_campaigns_max_quantity_check" CHECK ("presale_campaigns"."max_quantity_per_reservation" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "presale_reservation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"external_ref" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presale_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"status" "presale_reservation_status" DEFAULT 'pending_payment' NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"quantity" integer NOT NULL,
	"unit_amount" integer NOT NULL,
	"total_amount" integer NOT NULL,
	"currency" text NOT NULL,
	"answers" jsonb NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"idempotency_key" text,
	"stripe_checkout_session_id" text,
	"stripe_checkout_url" text,
	"checkout_expires_at" timestamp with time zone,
	"stripe_payment_intent_id" text,
	"paid_at" timestamp with time zone,
	"amount_refunded" integer DEFAULT 0 NOT NULL,
	"confirmation_email_sent_at" timestamp with time zone,
	"attribution" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presale_reservations_code_unique" UNIQUE("code"),
	CONSTRAINT "presale_reservations_idempotencyKey_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "presale_reservations_stripeCheckoutSessionId_unique" UNIQUE("stripe_checkout_session_id"),
	CONSTRAINT "presale_reservations_stripePaymentIntentId_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "presale_reservations_quantity_check" CHECK ("presale_reservations"."quantity" >= 1),
	CONSTRAINT "presale_reservations_total_check" CHECK ("presale_reservations"."total_amount" = "presale_reservations"."unit_amount" * "presale_reservations"."quantity"),
	CONSTRAINT "presale_reservations_refund_check" CHECK ("presale_reservations"."amount_refunded" between 0 and "presale_reservations"."total_amount")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "presale_reservation_events" ADD CONSTRAINT "presale_reservation_events_reservation_id_presale_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."presale_reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD CONSTRAINT "presale_reservations_campaign_id_presale_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."presale_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "presale_reservation_events_reservation_idx" ON "presale_reservation_events" USING btree ("reservation_id","created_at");--> statement-breakpoint
CREATE INDEX "presale_reservations_campaign_status_idx" ON "presale_reservations" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "presale_reservations_email_idx" ON "presale_reservations" USING btree ("email");