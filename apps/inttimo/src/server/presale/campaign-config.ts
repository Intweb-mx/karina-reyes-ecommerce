import type { NewPresaleCampaign } from "@inttimo/database";
import { z } from "zod";
import { DEFAULT_DURATION_DAYS } from "./campaign.ts";
import { questionsSchema } from "./questionnaire.ts";

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
      questions: config.questions,
      deliveryNote: config.deliveryNote ?? null,
    };
  })
  .refine((campaign) => campaign.endsAt > campaign.startsAt, "endsAt debe ser posterior a startsAt");
