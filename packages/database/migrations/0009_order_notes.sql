CREATE TABLE "presale_order_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presale_order_notes_body_check" CHECK (char_length("presale_order_notes"."body") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "presale_order_notes" ADD CONSTRAINT "presale_order_notes_reservation_id_presale_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."presale_reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "presale_order_notes_reservation_idx" ON "presale_order_notes" USING btree ("reservation_id","created_at");
--> statement-breakpoint
-- Tabla nueva: RLS activo y sin acceso para anon/authenticated (ver 0004).
ALTER TABLE "presale_order_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE FUNCTION "presale_order_notes_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'presale_order_notes es append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "presale_order_notes_no_update_delete"
  BEFORE UPDATE OR DELETE ON "presale_order_notes"
  FOR EACH ROW EXECUTE FUNCTION "presale_order_notes_append_only"();
