import { sitePublic } from "@/lib/store/flags";
import { getCatalog } from "@/server/store/catalog";
import { storeResponse, storeRoute } from "@/server/store/http";
import { getStoreDeps } from "@/server/store/runtime";

/** Catálogo publicado (CatalogResponse en src/lib/store/contract.ts). Solo lectura: se abre con el sitio informativo. */
export async function GET() {
  return storeRoute("store_catalog", async () => storeResponse(await getCatalog(getStoreDeps())), sitePublic);
}
