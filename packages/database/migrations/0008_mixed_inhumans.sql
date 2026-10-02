CREATE TABLE "presale_post_purchase_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presale_post_purchase_answers_reservationId_unique" UNIQUE("reservation_id")
);
--> statement-breakpoint
ALTER TABLE "presale_post_purchase_answers" ADD CONSTRAINT "presale_post_purchase_answers_reservation_id_presale_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."presale_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Tabla nueva: RLS activo y sin acceso para anon/authenticated (ver 0004).
ALTER TABLE "presale_post_purchase_answers" ENABLE ROW LEVEL SECURITY;