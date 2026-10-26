"use client";

import { useActionState, useState } from "react";
import { BUDGETS, SERVICES, inquiryCopy } from "@/content/inquiry";
import { Button } from "@/components/ui/button";
import { submitInquiry } from "./actions";
import styles from "./inquiry.module.css";
import type { InquiryField, InquiryResult } from "./schema";

interface BlankProps {
  field: InquiryField;
  label: string;
  state: InquiryResult | null;
}

/* What each blank is called for screen readers (the sentence around it is its visual label). */
const LABELS: Record<InquiryField, string> = {
  name: "Your name",
  company: "Company (optional)",
  service: "What you need help with",
  budget: "Budget",
  email: "Your email",
};

function fieldProps({ field, state }: Omit<BlankProps, "label">): {
  id: string;
  name: InquiryField;
  defaultValue: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
} {
  const error = state && !state.ok ? state.errors[field] : undefined;
  return {
    id: `inquiry-${field}`,
    name: field,
    defaultValue: state && !state.ok ? (state.values[field] ?? "") : "",
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `inquiry-${field}-error` : undefined,
  };
}

function TextBlank({ field, label, state, type = "text", placeholder, autoComplete }: BlankProps & { type?: string; placeholder: string; autoComplete: string }): React.ReactElement {
  return (
    <>
      <label htmlFor={`inquiry-${field}`} className="sr-only">
        {label}
      </label>
      <input {...fieldProps({ field, state })} type={type} placeholder={placeholder} autoComplete={autoComplete} className={styles.blank} />
    </>
  );
}

function SelectBlank({ field, label, state, options }: BlankProps & { options: readonly string[] }): React.ReactElement {
  return (
    <>
      <label htmlFor={`inquiry-${field}`} className="sr-only">
        {label}
      </label>
      <span className={styles.selectWrap}>
        <select {...fieldProps({ field, state })} className={`${styles.blank} ${styles.select}`}>
          <option value="" disabled>
            choose
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </span>
    </>
  );
}

function Sentence({ onSent }: { onSent: () => void }): React.ReactElement {
  const [state, action, pending] = useActionState(submitInquiry, null);

  if (state?.ok) {
    return (
      <div className={styles.success} role="status">
        <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" className={styles.check}>
          <circle cx="24" cy="24" r="22" />
          <path d="M14 25l7 7 13-15" />
        </svg>
        <p className="mt-6 text-heading-xl font-semibold tracking-tight">{inquiryCopy.successTitle(state.name)}</p>
        <p className="mt-3 max-w-[40ch] text-body-lg">{inquiryCopy.successBody}</p>
        <Button variant="ghost" size="md" className="mt-8" onClick={onSent}>
          {inquiryCopy.again}
        </Button>
      </div>
    );
  }

  const errors = state && !state.ok ? state.errors : {};
  const messages = (Object.keys(LABELS) as InquiryField[]).filter((field) => errors[field]);

  return (
    <form action={action} noValidate className={styles.form}>
      <p className={styles.sentence}>
        Hi, I&apos;m <TextBlank field="name" label={LABELS.name} state={state} placeholder="your name" autoComplete="name" /> from{" "}
        <TextBlank field="company" label={LABELS.company} state={state} placeholder="your company" autoComplete="organization" />. We need
        help with <SelectBlank field="service" label={LABELS.service} state={state} options={SERVICES} /> and our budget is around{" "}
        <SelectBlank field="budget" label={LABELS.budget} state={state} options={BUDGETS} />. You can reach me at{" "}
        <TextBlank field="email" label={LABELS.email} state={state} type="email" placeholder="you@company.com" autoComplete="email" />.
      </p>

      {/* Honeypot: hidden from people and assistive tech; bots fill it in. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="inquiry-website">Website</label>
        <input id="inquiry-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div aria-live="polite" className={styles.errors}>
        {messages.length > 0 && (
          <ul>
            {messages.map((field) => (
              <li key={field} id={`inquiry-${field}-error`}>
                {errors[field]}
              </li>
            ))}
          </ul>
        )}
        {errors.form && <p>{errors.form}</p>}
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? inquiryCopy.sending : inquiryCopy.submit}
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true" className={styles.arrow}>
            <path d="M4 10h11M11 5.5 15.5 10 11 14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>
        <p className="text-body-sm">
          Prefer email?{" "}
          <a href={`mailto:${inquiryCopy.email}`} className="font-semibold underline decoration-1 underline-offset-4">
            {inquiryCopy.email}
          </a>
        </p>
      </div>
    </form>
  );
}

/*
 * The fill-in-the-blanks inquiry: one sentence whose blanks are the fields. Submits to a
 * Server Action (works before hydration too); errors are announced and tied to their
 * fields. "Send another" remounts the sentence with fresh state.
 */
export function InquiryForm(): React.ReactElement {
  const [round, setRound] = useState(0);
  return <Sentence key={round} onSent={() => setRound((value) => value + 1)} />;
}
