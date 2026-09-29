CREATE FUNCTION "presale_reservation_events_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'presale_reservation_events es append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "presale_reservation_events_no_update_delete"
  BEFORE UPDATE OR DELETE ON "presale_reservation_events"
  FOR EACH ROW EXECUTE FUNCTION "presale_reservation_events_append_only"();
