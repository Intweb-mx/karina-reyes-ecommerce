/*
 * Puerta única del frontend hacia la tienda. Las pantallas solo hablan con `StoreApi`.
 * - `mock` (por defecto): datos de EJEMPLO para construir y revisar la UI sin backend.
 * - `http`: llama a los endpoints pedidos en docs/store/BACKEND-REQUEST.md (activar con NEXT_PUBLIC_STORE_API=http).
 */
import type {
  AccountAccessRequest,
  AccountView,
  AckResponse,
  CartQuoteRequest,
  CartQuoteResponse,
  CatalogResponse,
  CheckoutRequest,
  CheckoutResponse,
  ChurchQuoteRequest,
  ContactRequest,
  DeliveryOptionsResponse,
  NewsletterRequest,
  OrderConfirmationResponse,
  OrderView,
  ProductDetail,
  ShippingQuoteRequest,
  ShippingQuoteResponse,
  StoreError,
  TrackOrderRequest,
} from "./contract";
import { httpStoreApi } from "./http";
import { mockStoreApi } from "./mock";

export type Result<T> = { ok: true; data: T } | ({ ok: false } & StoreError);

export interface StoreApi {
  readonly mode: "mock" | "http";
  catalog(): Promise<Result<CatalogResponse>>;
  product(slug: string): Promise<Result<ProductDetail>>;
  quoteCart(request: CartQuoteRequest): Promise<Result<CartQuoteResponse>>;
  deliveryOptions(): Promise<Result<DeliveryOptionsResponse>>;
  quoteShipping(request: ShippingQuoteRequest): Promise<Result<ShippingQuoteResponse>>;
  checkout(request: CheckoutRequest, idempotencyKey: string): Promise<Result<CheckoutResponse>>;
  orderConfirmation(sessionId: string): Promise<Result<OrderConfirmationResponse>>;
  trackOrder(request: TrackOrderRequest): Promise<Result<OrderView>>;
  requestAccountAccess(request: AccountAccessRequest): Promise<Result<AckResponse>>;
  account(): Promise<Result<AccountView | null>>;
  contact(request: ContactRequest): Promise<Result<AckResponse>>;
  churchQuote(request: ChurchQuoteRequest): Promise<Result<AckResponse>>;
  newsletter(request: NewsletterRequest): Promise<Result<AckResponse>>;
}

export function getStoreApi(): StoreApi {
  return process.env.NEXT_PUBLIC_STORE_API === "http" ? httpStoreApi : mockStoreApi;
}
