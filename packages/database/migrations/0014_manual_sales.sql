CREATE TYPE "public"."presale_payment_method" AS ENUM('stripe', 'cash', 'transfer');--> statement-breakpoint
ALTER TABLE "presale_reservations" DROP CONSTRAINT "presale_reservations_total_check";--> statement-breakpoint
ALTER TABLE "presale_reservations" ALTER COLUMN "terms_accepted_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "presale_reservations" ALTER COLUMN "terms_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "discount_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "payment_method" "presale_payment_method" DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "recorded_by" text;--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD CONSTRAINT "presale_reservations_discount_check" CHECK ("presale_reservations"."discount_amount" between 0 and "presale_reservations"."unit_amount" * "presale_reservations"."quantity");--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD CONSTRAINT "presale_reservations_terms_check" CHECK ("presale_reservations"."payment_method" <> 'stripe' or ("presale_reservations"."terms_id" is not null and "presale_reservations"."terms_accepted_at" is not null));--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD CONSTRAINT "presale_reservations_total_check" CHECK ("presale_reservations"."total_amount" = "presale_reservations"."unit_amount" * "presale_reservations"."quantity" + "presale_reservations"."shipping_amount" - "presale_reservations"."discount_amount");