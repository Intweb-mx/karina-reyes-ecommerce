ALTER TABLE "store_orders" ADD COLUMN "client_ip_hash" text;--> statement-breakpoint
CREATE INDEX "store_orders_client_ip_hash_idx" ON "store_orders" USING btree ("client_ip_hash");