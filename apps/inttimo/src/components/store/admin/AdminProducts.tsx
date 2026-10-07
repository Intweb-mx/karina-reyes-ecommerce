"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, Badge, buttonClass, Card, EmptyState, inputClass, PageHeader, secondaryButtonClass } from "@/app/panel/ui";
import { Spinner } from "@/components/ui/Spinner";
import { getStoreAdminApi } from "@/lib/store/admin";
import type { AdminProduct, StockMovement, StockMovementReason } from "@/lib/store/admin-contract";
import { formatMoney } from "@/lib/format";
import { dateTime, MOVEMENT_REASON } from "./labels";

const REASONS: StockMovementReason[] = ["reception", "adjustment", "damage", "return", "correction"];

/** Productos e inventario: precio, publicación y existencias con movimientos auditables (CLAUDE.md §12). */
export function AdminProducts() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getStoreAdminApi().products().then((result) => (result.ok ? setProducts(result.data.products) : setError(result.error.message)));
  }, []);

  const replace = (next: AdminProduct) => setProducts((list) => list?.map((p) => (p.id === next.id ? next : p)) ?? null);

  return (
    <div className="space-y-8">
      <PageHeader title="Productos e inventario" subtitle="Cambia precios, publica u oculta productos y registra entradas o salidas de inventario." />
      {error && <Alert>{error}</Alert>}
      {!products ? (
        !error && <p className="flex items-center gap-2 py-8 text-sm text-muted"><Spinner className="size-4" /> Cargando productos…</p>
      ) : !products.length ? (
        <EmptyState title="Todavía no hay productos." />
      ) : (
        products.map((product) => <ProductCard key={product.id} product={product} onChange={replace} />)
      )}
    </div>
  );
}

function ProductCard({ product, onChange }: { product: AdminProduct; onChange: (product: AdminProduct) => void }) {
  const [panel, setPanel] = useState<"stock" | "edit" | "history" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { onHand, reserved, available, lowStockThreshold } = product.inventory;
  const low = available <= lowStockThreshold;
  const reservedPct = onHand ? Math.min(100, (reserved / onHand) * 100) : 0;

  const done = (next: AdminProduct, text: string) => {
    onChange(next);
    setMessage(text);
    setPanel(null);
  };

  return (
    <Card>
      <div className="grid gap-6 md:grid-cols-[7rem_minmax(0,1fr)]">
        <div className="relative aspect-square w-28 overflow-hidden bg-sand">
          <Image src={product.image.src} alt="" fill sizes="112px" className="object-cover" />
        </div>
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-3xl leading-none font-medium">{product.name}</h2>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                {product.price ? <span className="font-semibold text-fg lining-nums">{formatMoney(product.price.amount, product.price.currency)}</span> : "Sin precio"}
                <span aria-hidden="true">·</span> Máx. {product.maxQuantityPerOrder} por pedido
                {product.sku && <><span aria-hidden="true">·</span> <span className="font-mono">{product.sku}</span></>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={product.published ? "good" : "neutral"}>{product.published ? "Publicado" : "Oculto"}</Badge>
              {available <= 0 ? <Badge tone="bad">Agotado</Badge> : low ? <Badge tone="attention">Poco inventario</Badge> : <Badge tone="good">Con inventario</Badge>}
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 text-sm">
            <Metric label="Disponible para vender" value={available} strong tone={available <= 0 ? "bad" : low ? "attention" : undefined} />
            <Metric label="Apartado en pedidos" value={reserved} />
            <Metric label="Existencias físicas" value={onHand} />
          </dl>
          <div>
            <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-sand">
              <div className="h-full bg-warning/70 transition-[width] duration-500" style={{ width: `${reservedPct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted">Aviso de poco inventario al llegar a {lowStockThreshold} piezas disponibles.</p>
          </div>

          {message && <Alert tone="ok">{message}</Alert>}

          <div className="flex flex-wrap gap-2">
            <button type="button" aria-expanded={panel === "stock"} onClick={() => setPanel(panel === "stock" ? null : "stock")} className={panel === "stock" ? buttonClass : secondaryButtonClass}>Ajustar inventario</button>
            <button type="button" aria-expanded={panel === "edit"} onClick={() => setPanel(panel === "edit" ? null : "edit")} className={panel === "edit" ? buttonClass : secondaryButtonClass}>Editar precio y límites</button>
            <button type="button" aria-expanded={panel === "history"} onClick={() => setPanel(panel === "history" ? null : "history")} className={panel === "history" ? buttonClass : secondaryButtonClass}>Movimientos</button>
            <PublishToggle product={product} onDone={done} />
          </div>

          {panel === "stock" && <StockForm product={product} onDone={done} />}
          {panel === "edit" && <EditForm product={product} onDone={done} />}
          {panel === "history" && <Movements productId={product.id} />}
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: "bad" | "attention" }) {
  return (
    <div className={`border border-border px-3 py-2.5 ${strong ? "bg-surface" : ""}`}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 font-serif text-3xl leading-none font-medium lining-nums ${tone === "bad" ? "text-danger" : tone === "attention" ? "text-warning" : ""}`}>{value}</dd>
    </div>
  );
}

function PublishToggle({ product, onDone }: { product: AdminProduct; onDone: (p: AdminProduct, text: string) => void }) {
  const [saving, setSaving] = useState(false);
  async function toggle() {
    if (product.published && !window.confirm(`¿Ocultar ${product.name} de la tienda? Nadie podrá comprarlo hasta que lo vuelvas a publicar.`)) return;
    setSaving(true);
    const result = await getStoreAdminApi().updateProduct(product.id, { published: !product.published });
    setSaving(false);
    if (result.ok) onDone(result.data, result.data.published ? "Producto publicado." : "Producto oculto de la tienda.");
  }
  return (
    <button type="button" onClick={toggle} disabled={saving} className={secondaryButtonClass}>
      {saving && <Spinner className="size-4" />} {product.published ? "Ocultar de la tienda" : "Publicar"}
    </button>
  );
}

function StockForm({ product, onDone }: { product: AdminProduct; onDone: (p: AdminProduct, text: string) => void }) {
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<StockMovementReason>("reception");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const qty = Number.parseInt(amount, 10);
  const delta = Number.isFinite(qty) && qty > 0 ? (direction === "in" ? qty : -qty) : 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!delta) return setError("Escribe cuántas piezas.");
    setSaving(true);
    const result = await getStoreAdminApi().adjustStock(product.id, { delta, reason, note: note.trim() || undefined });
    setSaving(false);
    if (result.ok) onDone(result.data, `Inventario actualizado: ${delta > 0 ? "+" : ""}${delta} piezas (${MOVEMENT_REASON[reason].toLowerCase()}).`);
    else setError(result.error.message);
  }

  return (
    <form onSubmit={onSubmit} className="animate-rise space-y-4 border border-border bg-surface p-4 [animation-duration:300ms]">
      <div role="radiogroup" aria-label="Tipo de movimiento" className="inline-flex border border-border bg-[#fffdf9]">
        {(["in", "out"] as const).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => { setDirection(d); setReason(d === "in" ? "reception" : "damage"); }} className={`min-h-10 px-4 text-sm transition-colors ${direction === d ? "bg-fg text-bg" : "hover:bg-surface"}`}>
            {d === "in" ? "Entrada (+)" : "Salida (−)"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <label className="block text-sm font-medium">
          Piezas
          <input type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} required />
        </label>
        <label className="block text-sm font-medium">
          Motivo
          <select value={reason} onChange={(e) => setReason(e.target.value as StockMovementReason)} className={inputClass}>
            {REASONS.map((r) => <option key={r} value={r}>{MOVEMENT_REASON[r]}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Nota (opcional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: llegaron 2 cajas del proveedor" className={inputClass} />
      </label>
      {delta !== 0 && (
        <p className="text-sm">
          Disponible quedará en <strong className="lining-nums">{product.inventory.available + delta}</strong> (hoy {product.inventory.available}).
        </p>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={saving} className={buttonClass}>{saving && <Spinner className="size-4" />} Registrar movimiento</button>
    </form>
  );
}

function EditForm({ product, onDone }: { product: AdminProduct; onDone: (p: AdminProduct, text: string) => void }) {
  const [price, setPrice] = useState(product.price ? String(product.price.amount / 100) : "");
  const [threshold, setThreshold] = useState(String(product.inventory.lowStockThreshold));
  const [max, setMax] = useState(String(product.maxQuantityPerOrder));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const cents = Math.round(Number.parseFloat(price) * 100);
    const lowStockThreshold = Number.parseInt(threshold, 10);
    const maxQuantityPerOrder = Number.parseInt(max, 10);
    if (!Number.isFinite(cents) || cents <= 0) return setError("Escribe un precio válido.");
    if (!Number.isInteger(maxQuantityPerOrder) || maxQuantityPerOrder < 1) return setError("El máximo por pedido debe ser al menos 1.");
    if (product.price && cents !== product.price.amount && !window.confirm(`¿Cambiar el precio de ${formatMoney(product.price.amount, product.price.currency)} a ${formatMoney(cents, product.price.currency)}? Aplica a compras nuevas.`)) return;
    setSaving(true);
    const result = await getStoreAdminApi().updateProduct(product.id, { price: cents, lowStockThreshold: Math.max(0, lowStockThreshold || 0), maxQuantityPerOrder });
    setSaving(false);
    if (result.ok) onDone(result.data, "Cambios guardados.");
    else setError(result.error.message);
  }

  return (
    <form onSubmit={onSubmit} className="animate-rise space-y-4 border border-border bg-surface p-4 [animation-duration:300ms]">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium">
          Precio (MXN, IVA incluido)
          <input type="number" inputMode="decimal" min={1} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} required />
        </label>
        <label className="block text-sm font-medium">
          Máximo por pedido
          <input type="number" inputMode="numeric" min={1} value={max} onChange={(e) => setMax(e.target.value)} className={inputClass} required />
        </label>
        <label className="block text-sm font-medium">
          Avisar con poco inventario en
          <input type="number" inputMode="numeric" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} className={inputClass} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={saving} className={buttonClass}>{saving && <Spinner className="size-4" />} Guardar cambios</button>
    </form>
  );
}

/** Cambio de existencias; si el movimiento solo apartó o liberó unidades, muestra el cambio de apartado. */
function MovementAmount({ movement }: { movement: StockMovement }) {
  const reserved = movement.deltaOnHand === 0;
  const value = reserved ? movement.deltaReserved : movement.deltaOnHand;
  return (
    <span className={`font-semibold lining-nums ${value > 0 ? "text-success" : "text-danger"}`}>
      {value > 0 ? "+" : "−"}
      {Math.abs(value)}
      {reserved && <span className="ml-1 text-xs font-normal text-muted">apartado</span>}
    </span>
  );
}

function Movements({ productId }: { productId: string }) {
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  useEffect(() => {
    void getStoreAdminApi().stockMovements(productId).then((result) => setMovements(result.ok ? result.data.movements : []));
  }, [productId]);
  if (!movements) return <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" /> Cargando movimientos…</p>;
  if (!movements.length) return <EmptyState title="Sin movimientos todavía." />;
  return (
    <ul className="animate-rise divide-y divide-border border border-border bg-[#fffdf9] text-sm [animation-duration:300ms]">
      {movements.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div>
            <p className="font-medium">{MOVEMENT_REASON[m.reason]}{m.orderNumber && <> · <span className="font-mono">{m.orderNumber}</span></>}</p>
            <p className="text-xs text-muted">{dateTime(m.at)}{m.actor ? ` · ${m.actor}` : ""}{m.note ? ` · ${m.note}` : ""}</p>
          </div>
          <MovementAmount movement={m} />
        </li>
      ))}
    </ul>
  );
}
