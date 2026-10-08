import { getCatalog } from "@/server/store/catalog";
import { storeResponse, storeRoute } from "@/server/store/http";
import { getStoreDeps } from "@/server/store/runtime";

/** Catálogo publicado (CatalogResponse en src/lib/store/contract.ts). */
export async function GET() {
  return storeRoute("store_catalog", async () => storeResponse(await getCatalog(getStoreDeps())));
}
