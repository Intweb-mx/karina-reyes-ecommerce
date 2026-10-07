/*
 * Puerta única del panel de la tienda hacia el backend (mismo patrón que api.ts).
 * - `mock` (por defecto): datos de EJEMPLO en memoria para construir y revisar el panel.
 * - `http`: llama a /api/panel/tienda/* (pedido en docs/store/BACKEND-REQUEST.md), con NEXT_PUBLIC_STORE_API=http.
 */
import type { Result } from "./api";
import type {
  AdminDashboard,
  AdminLeadsResponse,
  AdminLeadUpdateRequest,
  AdminLead,
  AdminOrderActionRequest,
  AdminOrderDetail,
  AdminOrderNoteRequest,
  AdminOrdersQuery,
  AdminOrdersResponse,
  AdminPeriod,
  AdminProduct,
  AdminProductsResponse,
  AdminProductUpdateRequest,
  StockAdjustmentRequest,
  StockMovementsResponse,
} from "./admin-contract";
import type { StoreError } from "./contract";
import { mockStoreAdminApi } from "./admin-mock";

export interface StoreAdminApi {
  readonly mode: "mock" | "http";
  dashboard(period: AdminPeriod): Promise<Result<AdminDashboard>>;
  orders(query: AdminOrdersQuery): Promise<Result<AdminOrdersResponse>>;
  order(orderNumber: string): Promise<Result<AdminOrderDetail>>;
  orderAction(orderNumber: string, request: AdminOrderActionRequest, idempotencyKey: string): Promise<Result<AdminOrderDetail>>;
  addOrderNote(orderNumber: string, request: AdminOrderNoteRequest): Promise<Result<AdminOrderDetail>>;
  /** URL del CSV de pedidos con el filtro actual (el backend lo genera; en simulación es null). */
  exportOrdersUrl(query: AdminOrdersQuery): string | null;
  products(): Promise<Result<AdminProductsResponse>>;
  updateProduct(id: string, request: AdminProductUpdateRequest): Promise<Result<AdminProduct>>;
  adjustStock(id: string, request: StockAdjustmentRequest): Promise<Result<AdminProduct>>;
  stockMovements(id: string): Promise<Result<StockMovementsResponse>>;
  leads(): Promise<Result<AdminLeadsResponse>>;
  updateLead(id: string, request: AdminLeadUpdateRequest): Promise<Result<AdminLead>>;
}

async function call<T>(path: string, init?: RequestInit & { idempotencyKey?: string }): Promise<Result<T>> {
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (init?.body) headers["content-type"] = "application/json";
    if (init?.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;
    const response = await fetch(`/api/panel/tienda${path}`, { ...init, headers, cache: "no-store", credentials: "same-origin" });
    const data = (await response.json()) as T | StoreError;
    if (response.ok) return { ok: true, data: data as T };
    return { ok: false, ...(data as StoreError) };
  } catch {
    return { ok: false, error: { code: "service_unavailable", message: "No pudimos conectar con el servidor. Inténtalo de nuevo." } };
  }
}

const send = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
const ordersParams = (query: AdminOrdersQuery) => new URLSearchParams({ filtro: query.filter, ...(query.search ? { q: query.search } : {}), ...(query.page ? { pagina: String(query.page) } : {}) });
const folio = (orderNumber: string) => encodeURIComponent(orderNumber);

const httpStoreAdminApi: StoreAdminApi = {
  mode: "http",
  dashboard: (period) => call(`/resumen?periodo=${period}`),
  orders: (query) => call(`/pedidos?${ordersParams(query)}`),
  order: (orderNumber) => call(`/pedidos/${folio(orderNumber)}`),
  orderAction: (orderNumber, request, idempotencyKey) => call(`/pedidos/${folio(orderNumber)}/acciones`, { ...send("POST", request), idempotencyKey }),
  addOrderNote: (orderNumber, request) => call(`/pedidos/${folio(orderNumber)}/notas`, send("POST", request)),
  exportOrdersUrl: (query) => `/api/panel/tienda/pedidos/exportar?${ordersParams(query)}`,
  products: () => call("/productos"),
  updateProduct: (id, request) => call(`/productos/${encodeURIComponent(id)}`, send("PATCH", request)),
  adjustStock: (id, request) => call(`/productos/${encodeURIComponent(id)}/inventario`, send("POST", request)),
  stockMovements: (id) => call(`/productos/${encodeURIComponent(id)}/movimientos`),
  leads: () => call("/solicitudes"),
  updateLead: (id, request) => call(`/solicitudes/${encodeURIComponent(id)}`, send("PATCH", request)),
};

export function getStoreAdminApi(): StoreAdminApi {
  return process.env.NEXT_PUBLIC_STORE_API === "http" ? httpStoreAdminApi : mockStoreAdminApi;
}
