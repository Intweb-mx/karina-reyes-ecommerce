/*
 * CONTRATO PROPUESTO del panel de la tienda (frontend → backend). Igual que contract.ts: es una solicitud,
 * no backend implementado. Endpoints bajo /api/panel/tienda/*, solo para administradores (Supabase Auth,
 * app_metadata.role = "admin", MFA), cada acción registrada en la bitácora. Ver docs/store/BACKEND-REQUEST.md.
 */
import type { DeliveryMethod, FulfillmentStatus, Money, OrderView, PaymentStatus, ProductImage, ProductStatus } from "./contract";

/* ---------- Resumen ---------- */

export type AdminPeriod = "7d" | "30d" | "all";

/** GET /api/panel/tienda/resumen?periodo=7d|30d|all — métricas reales, nunca estimadas (CLAUDE.md §22). */
export type AdminDashboard = {
  period: AdminPeriod;
  sales: Money;
  orders: number;
  averageTicket: Money | null;
  toShip: number;
  toPickup: number;
  exceptions: number;
  lowStock: number;
  newLeads: number;
  topProducts: { name: string; units: number }[];
};

/* ---------- Pedidos ---------- */

export type AdminOrderFilter = "all" | "to_ship" | "to_pickup" | "in_transit" | "delivered" | "exception" | "unpaid";

export type AdminOrderSummary = {
  orderNumber: string;
  createdAt: string;
  customerName: string;
  email: string;
  units: number;
  total: Money;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  deliveryMethod: DeliveryMethod;
  /** Desde cuándo espera acción del equipo (pagado y sin enviar/preparar), para priorizar. */
  waitingSince: string | null;
};

/** GET /api/panel/tienda/pedidos?filtro=…&q=…&pagina=… (búsqueda por folio, nombre, correo o guía). */
export type AdminOrdersQuery = { filter: AdminOrderFilter; search?: string; page?: number };
export type AdminOrdersResponse = { orders: AdminOrderSummary[]; total: number; pageSize: number; counts: Record<AdminOrderFilter, number> };

export type AdminOrderAction = "generate_label" | "mark_ready_for_pickup" | "mark_shipped" | "mark_delivered" | "report_exception" | "resend_confirmation" | "cancel";

/** Bitácora completa del pedido: solo se agrega, nunca se borra (CLAUDE.md §21). */
export type AdminOrderEvent = { at: string; type: string; label: string; actor: string | null; note: string | null };

/** GET /api/panel/tienda/pedidos/[folio] — correo completo y teléfono solo en el panel. */
export type AdminOrderDetail = OrderView & {
  customerName: string;
  phone: string | null;
  marketingConsent: boolean;
  labelUrl: string | null;
  /** Acciones permitidas en el estado actual: el backend decide, el panel solo muestra esas. */
  allowedActions: AdminOrderAction[];
  notes: { at: string; author: string; text: string }[];
  timeline: AdminOrderEvent[];
};

/** POST /api/panel/tienda/pedidos/[folio]/acciones (Idempotency-Key). Devuelve el pedido actualizado. */
export type AdminOrderActionRequest = { action: AdminOrderAction; note?: string };

/** POST /api/panel/tienda/pedidos/[folio]/notas — nota interna, nunca visible para el cliente. */
export type AdminOrderNoteRequest = { text: string };

/* ---------- Productos e inventario ---------- */

/** Inventario según CLAUDE.md §12: disponible = existencias − apartado. */
export type AdminInventory = { onHand: number; reserved: number; available: number; lowStockThreshold: number };

export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  sku: string | null;
  status: ProductStatus;
  published: boolean;
  price: Money | null;
  image: ProductImage;
  maxQuantityPerOrder: number;
  inventory: AdminInventory;
  updatedAt: string;
};

/** GET /api/panel/tienda/productos */
export type AdminProductsResponse = { products: AdminProduct[] };

/** PATCH /api/panel/tienda/productos/[id] — precio en centavos. Cambios sensibles quedan en la bitácora. */
export type AdminProductUpdateRequest = { price?: number; published?: boolean; lowStockThreshold?: number; maxQuantityPerOrder?: number };

export type StockMovementReason = "reception" | "adjustment" | "damage" | "return" | "correction";

/** POST /api/panel/tienda/productos/[id]/inventario — movimiento auditable, nunca sobrescribir el número. */
export type StockAdjustmentRequest = { delta: number; reason: StockMovementReason; note?: string };

/**
 * `deltaOnHand` cambia las existencias y `deltaReserved` lo apartado en pedidos: una reserva no cambia las existencias,
 * una venta cambia las dos. Sin los dos números no se distingue una reserva de una recepción.
 */
export type StockMovement = {
  id: string;
  at: string;
  deltaOnHand: number;
  deltaReserved: number;
  reason: StockMovementReason | "sale" | "reservation" | "release";
  actor: string | null;
  orderNumber: string | null;
  note: string | null;
};

/** GET /api/panel/tienda/productos/[id]/movimientos */
export type StockMovementsResponse = { movements: StockMovement[] };

/* ---------- Solicitudes (contacto e iglesias) ---------- */

export type AdminLeadStatus = "new" | "contacted" | "quoted" | "won" | "closed";

export type AdminLead = {
  id: string;
  kind: "contact" | "church";
  createdAt: string;
  name: string;
  organization: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  topic: string;
  quantity: number | null;
  eventDate: string | null;
  orderNumber: string | null;
  message: string;
  status: AdminLeadStatus;
  notes: string;
};

/** GET /api/panel/tienda/solicitudes */
export type AdminLeadsResponse = { leads: AdminLead[] };

/** PATCH /api/panel/tienda/solicitudes/[id] */
export type AdminLeadUpdateRequest = { status?: AdminLeadStatus; notes?: string };
