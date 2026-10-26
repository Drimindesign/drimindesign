"use client";

import { useActionState, useState } from "react";
import { BUDGETS, SERVICES, inquiryCopy } from "@/content/inquiry";
import { Button } from "@/components/ui/button";
import { ConsentCheckbox } from "@/components/ui/consent-checkbox";
import { Select } from "@/components/ui/select";
import { submitInquiry } from "./actions";
import styles from "./inquiry.module.css";
import type { InquiryField, InquiryResult } from "./schema";

interface BlankProps {
  field: InquiryField;
  label: string;
  state: InquiryResult | null;
  /** Element id prefix: unique per form on the page (routes kept alive by <Activity> stay in the DOM). */
  prefix: string;
}

/* What each blank is called for screen readers (the sentence around it is its visual label). */
const LABELS: Record<InquiryField, string> = {
  name: "Your name",
  company: "Company (optional)",
  service: "What you need help with",
  budget: "Budget",
  email: "Your email",
  consent: "Consent",
};

function fieldProps({ field, state, prefix }: Omit<BlankProps, "label">): {
  id: string;
  name: InquiryField;
  defaultValue: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
} {
  const error = state && !state.ok ? state.errors[field] : undefined;
  return {
    id: `${prefix}-${field}`,
    name: field,
    defaultValue: state && !state.ok ? (state.values[field] ?? "") : "",
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${prefix}-${field}-error` : undefined,
  };
}

function TextBlank({ field, label, state, prefix, type = "text", placeholder, autoComplete }: BlankProps & { type?: string; placeholder: string; autoComplete: string }): React.ReactElement {
  return (
    <>
      <label htmlFor={`${prefix}-${field}`} className="sr-only">
        {label}
      </label>
      <input {...fieldProps({ field, state, prefix })} type={type} placeholder={placeholder} autoComplete={autoComplete} className={styles.blank} />
    </>
  );
}

function SelectBlank({ field, label, state, prefix, options }: BlankProps & { options: readonly string[] }): React.ReactElement {
  return (
    <>
      <label htmlFor={`${prefix}-${field}`} className="sr-only">
        {label}
      </label>
      <Select {...fieldProps({ field, state, prefix })} variant="inline">
        <option value="" disabled>
          choose
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </>
  );
}

function Sentence({ onSent, prefix }: { onSent: () => void; prefix: string }): React.ReactElement {
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
        Hi, I&apos;m <TextBlank field="name" label={LABELS.name} state={state} prefix={prefix} placeholder="your name" autoComplete="name" /> from{" "}
        <TextBlank field="company" label={LABELS.company} state={state} prefix={prefix} placeholder="your company" autoComplete="organization" />. We
        need help with <SelectBlank field="service" label={LABELS.service} state={state} prefix={prefix} options={SERVICES} /> and our budget is
        around <SelectBlank field="budget" label={LABELS.budget} state={state} prefix={prefix} options={BUDGETS} />. You can reach me at{" "}
        <TextBlank field="email" label={LABELS.email} state={state} prefix={prefix} type="email" placeholder="you@company.com" autoComplete="email" />.
      </p>

      {/* Honeypot: hidden from people and assistive tech; bots fill it in. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor={`${prefix}-website`}>Website</label>
        <input id={`${prefix}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mt-8">
        <ConsentCheckbox
          id={`${prefix}-consent`}
          errorId={errors.consent ? `${prefix}-consent-error` : undefined}
          defaultChecked={state !== null && !state.ok && state.values.consent === "on"}
        />
      </div>

      <div aria-live="polite" className={styles.errors}>
        {messages.length > 0 && (
          <ul>
            {messages.map((field) => (
              <li key={field} id={`${prefix}-${field}-error`}>
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
export function InquiryForm({ idPrefix = "inquiry" }: { idPrefix?: string }): React.ReactElement {
  const [round, setRound] = useState(0);
  return <Sentence key={round} prefix={idPrefix} onSent={() => setRound((value) => value + 1)} />;
}
