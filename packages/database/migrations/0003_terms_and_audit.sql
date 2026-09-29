CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presale_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presale_terms_campaign_version_unique" UNIQUE("campaign_id","version"),
	CONSTRAINT "presale_terms_version_check" CHECK ("presale_terms"."version" >= 1),
	CONSTRAINT "presale_terms_content_check" CHECK (length(trim("presale_terms"."content")) > 0)
);
--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD COLUMN "terms_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "presale_terms" ADD CONSTRAINT "presale_terms_campaign_id_presale_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."presale_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_idx" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "presale_reservations" ADD CONSTRAINT "presale_reservations_terms_id_presale_terms_id_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."presale_terms"("id") ON DELETE restrict ON UPDATE no action;