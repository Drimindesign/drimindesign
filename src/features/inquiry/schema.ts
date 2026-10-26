import { z } from "zod";
import { consentCopy } from "@/content/legal";
import { BUDGETS, SERVICES } from "@/content/inquiry";

/* Shared by the form (client) and the server action: one source of truth for validation. */
export const inquirySchema = z.object({
  name: z.string().trim().min(2, "Tell us your name.").max(80, "That name is a little long."),
  company: z.string().trim().max(120, "That's a long company name. Can you shorten it?"),
  service: z.enum(SERVICES, { error: "Pick what you need help with." }),
  budget: z.enum(BUDGETS, { error: "Pick a budget range." }),
  email: z.email({ error: "That email doesn't look right." }).max(160),
  // A ticked box becomes the policy version agreed to, stored with the inquiry.
  consent: z.literal("on", { error: consentCopy.error }).transform(() => consentCopy.version),
});

export type InquiryInput = z.output<typeof inquirySchema>;
export type InquiryField = keyof InquiryInput;
export const INQUIRY_FIELDS = ["name", "company", "service", "budget", "email", "consent"] as const satisfies readonly InquiryField[];

export type InquiryValues = Partial<Record<InquiryField, string>>;
export type InquiryErrors = Partial<Record<InquiryField | "form", string>>;

export type InquiryResult =
  | { ok: true; name: string }
  | { ok: false; errors: InquiryErrors; values: InquiryValues };

/** Field → first message, for inline errors. */
export function errorsOf(error: z.ZodError): InquiryErrors {
  const errors: InquiryErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && INQUIRY_FIELDS.includes(field as InquiryField)) {
      errors[field as InquiryField] ??= issue.message;
    }
  }
  return errors;
}
