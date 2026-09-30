import { ChoiceTile, FieldError, Hint, Optional, TextArea, TextInput, describedBy, labelClass } from "./fields";
import { answerKey, type AnswerValue, type QuestionDefinition } from "./validation";

const DEFAULT_MAX = { text: 200, textarea: 2000 } as const;

type Props = {
  question: QuestionDefinition;
  value: AnswerValue | undefined;
  errors?: string[];
  valid?: boolean;
  onChange: (value: AnswerValue, touch?: boolean) => void;
  onBlur: () => void;
};

/**
 * Una pregunta del cuestionario, construida a partir de la definición de la API (nunca hardcodeada).
 * El primer control de cada pregunta usa el id `answers.<id>` para que el resumen de errores pueda enfocarlo.
 */
export function QuestionField({ question, value, errors, valid, onChange, onBlur }: Props) {
  const id = answerKey(question.id);
  const invalid = !!errors?.length;
  const hint = !!question.helpText;
  const describe = describedBy(id, { hint, errors });
  const label = (
    <>
      {question.label}
      {!question.required && <Optional />}
    </>
  );

  if (question.type === "text" || question.type === "textarea") {
    const max = question.maxLength ?? DEFAULT_MAX[question.type];
    const text = typeof value === "string" ? value : "";
    return (
      <div>
        <label htmlFor={id} className={labelClass}>{label}</label>
        {hint && <Hint id={id}>{question.helpText}</Hint>}
        {question.type === "text" ? (
          <TextInput
            id={id}
            value={text}
            maxLength={max}
            required={question.required}
            valid={valid && text.trim().length > 0}
            aria-invalid={invalid}
            aria-describedby={describe}
            onBlur={onBlur}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <TextArea
            id={id}
            value={text}
            max={max}
            required={question.required}
            rows={4}
            aria-invalid={invalid}
            aria-describedby={describe}
            onBlur={onBlur}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        <FieldError id={id} errors={errors} />
      </div>
    );
  }

  if (question.type === "boolean") {
    return (
      <div>
        <ChoiceTile id={id} type="checkbox" checked={value === true} invalid={invalid} aria-describedby={describe} onChange={(e) => onChange(e.target.checked, true)}>
          <span className="font-medium">{label}</span>
        </ChoiceTile>
        {hint && <Hint id={id}>{question.helpText}</Hint>}
        <FieldError id={id} errors={errors} />
      </div>
    );
  }

  const multiple = question.type === "multiselect";
  const options = question.options ?? [];
  const selected = multiple ? (Array.isArray(value) ? value : []) : value;
  return (
    <fieldset aria-describedby={describe}>
      <legend className={labelClass}>{label}</legend>
      {multiple && !hint && <p className="mt-1.5 text-sm text-muted">Elige todas las que apliquen.</p>}
      {hint && <Hint id={id}>{question.helpText}</Hint>}
      <div className={`mt-3 grid gap-2.5 ${options.length > 2 ? "sm:grid-cols-2" : ""}`}>
        {options.map((option, index) => {
          const checked = multiple ? (selected as string[]).includes(option.value) : selected === option.value;
          return (
            <ChoiceTile
              key={option.value}
              marker={String.fromCharCode(65 + index)}
              id={index === 0 ? id : undefined}
              type={multiple ? "checkbox" : "radio"}
              name={id}
              value={option.value}
              checked={checked}
              invalid={invalid}
              onChange={(e) => {
                if (!multiple) return onChange(option.value, true);
                const current = selected as string[];
                onChange(e.target.checked ? [...current, option.value] : current.filter((v) => v !== option.value), true);
              }}
            >
              {option.label}
            </ChoiceTile>
          );
        })}
      </div>
      <FieldError id={id} errors={errors} />
    </fieldset>
  );
}
