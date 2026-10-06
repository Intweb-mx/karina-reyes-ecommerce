"use client";

import { useState } from "react";
import type { SavePostPurchaseAnswersRequest } from "@/server/presale/contract";
import { Button } from "@/components/ui/Button";
import { CheckIcon } from "@/components/ui/icons";
import { postPurchaseCopy } from "@/content/presale";

type Status = "idle" | "submitting" | "sent" | "skipped";

/**
 * Cuestionario opcional tras la confirmación de pago (Especificaciones finales postcompra UNO+UNO, §1).
 * Todas las preguntas son opcionales; no bloquea ni condiciona nada del pedido.
 */
export function PostPurchaseSurvey({ slug, sessionId }: { slug: string; sessionId: string }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>("idle");

  if (status === "skipped") return null;
  if (status === "sent") {
    return (
      <section role="status" className="animate-rise mt-12 flex items-start gap-4 border border-success/30 bg-success/5 p-6 sm:p-8 print:hidden">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-success text-on-ink">
          <CheckIcon className="animate-pop size-5" />
        </span>
        <div>
          <p className="font-serif text-2xl font-medium">{postPurchaseCopy.sent}</p>
          <p className="mt-1 text-sm text-muted">Quedaron guardadas con tu pedido.</p>
        </div>
      </section>
    );
  }

  async function send(currentAnswers: Record<string, string>, submit: boolean) {
    if (submit) setStatus("submitting");
    try {
      const body: SavePostPurchaseAnswersRequest = { sessionId, answers: currentAnswers, submit };
      await fetch(`/api/preventa/${slug}/postcompra`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      // El cuestionario es opcional: un fallo de red aquí no debe interrumpir al cliente.
    }
    if (submit) setStatus("sent");
  }

  function choose(questionId: string, value: string) {
    const next = { ...answers, [questionId]: value };
    setAnswers(next);
    void send(next, false);
  }

  function type(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function blurText(questionId: string, value: string) {
    if (!value.trim()) return;
    void send({ ...answers, [questionId]: value }, false);
  }

  return (
    <section aria-labelledby="postcompra" className="mt-12 border border-border bg-surface p-6 sm:p-8 print:hidden">
      <h2 id="postcompra" className="font-serif text-2xl font-medium">
        {postPurchaseCopy.title}
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{postPurchaseCopy.intro}</p>

      <div className="mt-8 space-y-8">
        {postPurchaseCopy.questions.map((question) => (
          <fieldset key={question.id}>
            <legend className="text-[0.9375rem] font-semibold tracking-[-0.005em]">{question.label}</legend>
            {"options" in question ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {question.options.map((option) => {
                  const selected = answers[question.id] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => choose(question.id, option.value)}
                      aria-pressed={selected}
                      className={`inline-flex min-h-11 items-center gap-1.5 border px-4 text-sm font-medium transition-colors duration-(--duration-base) ${
                        selected ? "border-ink bg-ink text-on-ink" : "border-border bg-[#fffdf9] hover:border-fg/35"
                      }`}
                    >
                      {selected && <CheckIcon className="size-3.5" />}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                type="text"
                maxLength={120}
                placeholder={question.placeholder}
                value={answers[question.id] ?? ""}
                onChange={(e) => type(question.id, e.target.value)}
                onBlur={(e) => blurText(question.id, e.target.value)}
                className="mt-3 min-h-11 w-full max-w-sm border border-border bg-[#fffdf9] px-4 text-sm focus:border-fg/35 focus:outline-none sm:w-auto"
              />
            )}
          </fieldset>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" variant="primary" size="md" disabled={status === "submitting"} onClick={() => send(answers, true)}>
          {status === "submitting" ? postPurchaseCopy.submitting : postPurchaseCopy.submit}
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={() => setStatus("skipped")}>
          {postPurchaseCopy.skip}
        </Button>
      </div>
    </section>
  );
}
