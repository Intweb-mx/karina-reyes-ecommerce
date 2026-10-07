"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, buttonClass, Card, EmptyState, inputClass, PageHeader } from "@/app/panel/ui";
import { ChatIcon, ChurchIcon, MailIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { getStoreAdminApi } from "@/lib/store/admin";
import type { AdminLead, AdminLeadStatus } from "@/lib/store/admin-contract";
import { dateTime, LEAD_STATUS } from "./labels";

type View = "open" | "church" | "contact" | "all";
const VIEWS: { id: View; label: string; match: (lead: AdminLead) => boolean }[] = [
  { id: "open", label: "Por atender", match: (l) => l.status === "new" || l.status === "contacted" || l.status === "quoted" },
  { id: "church", label: "Iglesias", match: (l) => l.kind === "church" },
  { id: "contact", label: "Contacto", match: (l) => l.kind === "contact" },
  { id: "all", label: "Todas", match: () => true },
];

/** Solicitudes de contacto y cotizaciones de iglesias (brief §24): estado, notas y contacto directo. */
export function AdminLeads() {
  const [leads, setLeads] = useState<AdminLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("open");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    void getStoreAdminApi().leads().then((result) => (result.ok ? setLeads(result.data.leads) : setError(result.error.message)));
  }, []);

  const visible = leads?.filter(VIEWS.find((v) => v.id === view)!.match) ?? [];

  return (
    <div className="space-y-8">
      <PageHeader title="Solicitudes" subtitle="Mensajes del formulario de contacto y cotizaciones para iglesias y ministerios." />
      {error && <Alert>{error}</Alert>}
      <div role="group" aria-label="Filtrar solicitudes" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => {
          const count = leads?.filter(v.match).length;
          return (
            <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)} className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors ${view === v.id ? "border-fg bg-fg text-bg" : "border-border bg-bg hover:border-fg/40"}`}>
              {v.label}
              {count !== undefined && <span className={`rounded-full px-1.5 text-xs lining-nums ${view === v.id ? "bg-bg/20" : "bg-surface"}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      {!leads ? (
        !error && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" /> Cargando solicitudes…</p>
      ) : !visible.length ? (
        <EmptyState title="No hay solicitudes en esta lista." body="Las nuevas aparecerán aquí y en el resumen de la tienda." />
      ) : (
        <ul className="space-y-3">
          {visible.map((lead) => (
            <LeadItem
              key={lead.id}
              lead={lead}
              open={openId === lead.id}
              onToggle={() => setOpenId(openId === lead.id ? null : lead.id)}
              onSaved={(next) => setLeads((list) => list?.map((l) => (l.id === next.id ? next : l)) ?? null)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LeadItem({ lead, open, onToggle, onSaved }: { lead: AdminLead; open: boolean; onToggle: () => void; onSaved: (lead: AdminLead) => void }) {
  const [status, setStatus] = useState<AdminLeadStatus>(lead.status);
  const [notes, setNotes] = useState(lead.notes);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = status !== lead.status || notes !== lead.notes;
  const whatsapp = lead.phone ? `https://wa.me/52${lead.phone.replace(/\D/g, "").slice(-10)}` : null;

  async function save() {
    setSaving(true);
    setSaved(false);
    const result = await getStoreAdminApi().updateLead(lead.id, { status, notes });
    setSaving(false);
    if (result.ok) {
      onSaved(result.data);
      setSaved(true);
      setError(null);
    } else setError(result.error.message);
  }

  return (
    <li>
      <Card className={lead.status === "new" ? "border-l-4 border-l-warning" : ""}>
        <button type="button" onClick={onToggle} aria-expanded={open} className="-m-5 flex w-[calc(100%+2.5rem)] flex-wrap items-center justify-between gap-3 p-5 text-left">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 font-semibold">
              {lead.kind === "church" && <ChurchIcon className="size-4 text-fg/60" />}
              {lead.organization ?? lead.name}
              <Badge tone={LEAD_STATUS[lead.status].tone}>{LEAD_STATUS[lead.status].label}</Badge>
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              {lead.kind === "church" ? "Cotización" : "Contacto"} · {lead.topic}
              {lead.quantity ? ` · ${lead.quantity} juegos aprox.` : ""} · {dateTime(lead.createdAt)}
            </span>
          </span>
          <span aria-hidden="true" className={`text-bronze transition-transform ${open ? "rotate-90" : ""}`}>→</span>
        </button>

        {open && (
          <div className="animate-rise mt-5 grid gap-6 border-t border-border pt-5 [animation-duration:300ms] md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
            <div className="space-y-4 text-sm">
              <p className="leading-relaxed whitespace-pre-line">{lead.message}</p>
              <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[auto_1fr]">
                <dt className="text-muted">Nombre</dt><dd>{lead.name}</dd>
                {lead.city && <><dt className="text-muted">Ciudad</dt><dd>{lead.city}</dd></>}
                {lead.eventDate && <><dt className="text-muted">Fecha del evento</dt><dd>{lead.eventDate}</dd></>}
                {lead.orderNumber && <><dt className="text-muted">Pedido</dt><dd className="font-mono">{lead.orderNumber}</dd></>}
              </dl>
              <p className="flex flex-wrap gap-x-5 gap-y-2">
                <a href={`mailto:${lead.email}`} className="inline-flex min-h-10 items-center gap-2 underline-offset-4 hover:underline"><MailIcon className="size-4" /> {lead.email}</a>
                {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 underline-offset-4 hover:underline"><ChatIcon className="size-4" /> WhatsApp {lead.phone}</a>}
              </p>
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium">
                Estado
                <select value={status} onChange={(e) => { setStatus(e.target.value as AdminLeadStatus); setSaved(false); }} className={inputClass}>
                  {(Object.keys(LEAD_STATUS) as AdminLeadStatus[]).map((s) => <option key={s} value={s}>{LEAD_STATUS[s].label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Notas del equipo
                <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setSaved(false); }} rows={4} className={inputClass} />
              </label>
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
              <div className="flex items-center gap-3">
                <button type="button" onClick={save} disabled={!dirty || saving} className={buttonClass}>{saving && <Spinner className="size-4" />} Guardar</button>
                {saved && !dirty && <span role="status" className="text-sm text-success">Guardado</span>}
              </div>
            </div>
          </div>
        )}
      </Card>
    </li>
  );
}
