import type { NewPresaleCampaign } from "@inttimo/database";
import { z } from "zod";
import { DEFAULT_DURATION_DAYS } from "./campaign.ts";
import { questionsSchema } from "./questionnaire.ts";

/** Bonus digital. Archivos y vigencia los define el negocio: no hay valores por defecto. */
export const bonusSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    pdfUrl: z.url({ protocol: /^https$/ }).nullable(),
    videoUrl: z.url({ protocol: /^https$/ }).nullable(),
    linkDays: z.number().int().min(1).max(365),
  })
  .refine((bonus) => bonus.pdfUrl || bonus.videoUrl, "bonus: indica pdfUrl o videoUrl");

const required = (max: number) => z.string().trim().min(1).max(max);

export const shippingProfileSchema = z.object({
  origin: z.object({
    name: required(80),
    company: z.string().trim().max(80).nullable(),
    street: required(120),
    neighborhood: required(100),
    city: required(80),
    state: required(60),
    postalCode: z.string().regex(/^\d{5}$/, "origin.postalCode: 5 dígitos"),
    phone: z.string().regex(/^[\d\s+()-]{10,20}$/, "origin.phone: teléfono a 10 dígitos"),
    email: z.email(),
    reference: z.string().trim().max(200).nullable(),
  }),
  parcel: z.object({
    weightKg: z.number().positive().max(70),
    lengthCm: z.number().positive().max(200),
    widthCm: z.number().positive().max(200),
    heightCm: z.number().positive().max(200),
  }),
  carriers: z.array(z.string().trim().toLowerCase()).default([]),
  consignmentNote: required(20),
  packageType: required(20),
});

/** Archivo JSON que describe una campaña (ver docs/preventa/campaign.example.json). */
export const campaignConfigSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{3,60}$/, "slug: minúsculas, números y guiones (3–60)"),
    productName: z.string().trim().min(1).max(120),
    productSku: z.string().trim().max(60).nullable().optional(),
    status: z.enum(["draft", "active", "closed"]),
    startsAt: z.iso.datetime({ offset: true, error: "startsAt: fecha ISO 8601 con zona horaria (p. ej. 2026-10-01T10:00:00-06:00)" }),
    /** Si falta, se calcula como startsAt + durationDays. */
    endsAt: z.iso.datetime({ offset: true }).optional(),
    durationDays: z.number().int().min(1).max(90).default(DEFAULT_DURATION_DAYS),
    /** Centavos. 99900 = $999.00. */
    unitAmount: z.number({ error: "unitAmount: precio aprobado en centavos (entero)" }).int().positive(),
    currency: z.enum(["mxn", "usd"]).default("mxn"),
    maxQuantityPerReservation: z.number().int().min(1).max(20).default(1),
    /** Unidades totales de la campaña; sin sobreventa. Si falta, no hay tope. */
    totalUnits: z.number().int().positive().nullable().optional(),
    /** Recolección sin costo en Chihuahua. */
    pickupEnabled: z.boolean().default(true),
    /** Envío a domicilio dentro de México. */
    shippingEnabled: z.boolean().default(true),
    /** Puntos de recolección (datos aprobados por el negocio). */
    pickupPoints: z
      .array(z.object({ id: z.string().regex(/^[a-z0-9-]{2,40}$/, "pickupPoints.id: minúsculas, números y guiones"), name: z.string().trim().min(1).max(120), schedule: z.string().trim().min(1).max(200) }))
      .default([]),
    /** Origen y paquete para cotizar con SkyDropX. Sin esto no se ofrece envío a domicilio. */
    shippingProfile: shippingProfileSchema.nullable().optional(),
    bonus: bonusSchema.nullable().optional(),
    questions: questionsSchema,
    deliveryNote: z.string().trim().max(1000).nullable().optional(),
  })
  .transform((config): NewPresaleCampaign => {
    const startsAt = new Date(config.startsAt);
    return {
      slug: config.slug,
      productName: config.productName,
      productSku: config.productSku ?? null,
      status: config.status,
      startsAt,
      endsAt: config.endsAt ? new Date(config.endsAt) : new Date(startsAt.getTime() + config.durationDays * 86_400_000),
      unitAmount: config.unitAmount,
      currency: config.currency,
      maxQuantityPerReservation: config.maxQuantityPerReservation,
      totalUnits: config.totalUnits ?? null,
      pickupEnabled: config.pickupEnabled,
      shippingEnabled: config.shippingEnabled,
      pickupPoints: config.pickupPoints,
      shippingProfile: config.shippingProfile ?? null,
      bonus: config.bonus ?? null,
      questions: config.questions,
      deliveryNote: config.deliveryNote ?? null,
    };
  })
  .refine((campaign) => campaign.endsAt > campaign.startsAt, "endsAt debe ser posterior a startsAt")
  .refine((campaign) => campaign.pickupEnabled || campaign.shippingEnabled, "Activa al menos un método de entrega (pickupEnabled o shippingEnabled)")
