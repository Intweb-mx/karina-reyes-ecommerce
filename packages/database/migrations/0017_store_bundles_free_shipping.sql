ALTER TABLE "store_order_items" ADD COLUMN "stock_product_id" uuid;--> statement-breakpoint
ALTER TABLE "store_order_items" ADD COLUMN "stock_units" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "store_products" ADD COLUMN "stock_product_id" uuid;--> statement-breakpoint
ALTER TABLE "store_products" ADD COLUMN "stock_units" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "store_products" ADD COLUMN "free_shipping_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store_products" ADD COLUMN "sale_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store_order_items" ADD CONSTRAINT "store_order_items_stock_product_id_store_products_id_fk" FOREIGN KEY ("stock_product_id") REFERENCES "public"."store_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_stock_product_id_store_products_id_fk" FOREIGN KEY ("stock_product_id") REFERENCES "public"."store_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_order_items" ADD CONSTRAINT "store_order_items_stock_units_check" CHECK ("store_order_items"."stock_units" between 1 and 100);--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_stock_units_check" CHECK ("store_products"."stock_units" between 1 and 100);--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_bundle_check" CHECK ("store_products"."stock_product_id" is null and "store_products"."stock_units" = 1 or "store_products"."stock_product_id" is not null and "store_products"."stock_product_id" <> "store_products"."id");--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_sale_ends_check" CHECK ("store_products"."sale_ends_at" is null or "store_products"."compare_at_price" is not null);