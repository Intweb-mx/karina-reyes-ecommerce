import type { PostalCodeLookupResponse } from "../../lib/store/contract.ts";
import { fail, type StoreResult } from "./common.ts";

/**
 * GET /api/tienda/codigo-postal/[cp]. Todavía no hay catálogo de códigos postales (SEPOMEX) conectado: siempre responde
 * 404 y el checkout deja escribir estado, ciudad y colonia a mano. Para conectar un proveedor solo cambia este archivo.
 */
export async function lookupPostalCode(postalCode: string): Promise<StoreResult<PostalCodeLookupResponse>> {
  if (!/^\d{5}$/.test(postalCode)) return fail(400, "validation_error", "Código postal de 5 dígitos.", { postalCode: ["Código postal de 5 dígitos."] });
  return fail(404, "not_found", "No reconocimos ese código postal. Escribe los datos a mano.");
}
