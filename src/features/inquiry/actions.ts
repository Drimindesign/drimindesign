"use server";

import { headers } from "next/headers";
import { allow } from "@/server/rate-limit";
import { inquiryRepository } from "@/server/repositories/inquiry-repository";
import { INQUIRY_FIELDS, errorsOf, inquirySchema, type InquiryResult, type InquiryValues } from "./schema";

/** Five inquiries per address per ten minutes. */
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function submitInquiry(_previous: InquiryResult | null, formData: FormData): Promise<InquiryResult> {
  const values: InquiryValues = {};
  for (const field of INQUIRY_FIELDS) values[field] = String(formData.get(field) ?? "");

  // Honeypot: people never see this field; bots fill it. Pretend it worked.
  if (String(formData.get("website") ?? "") !== "") return { ok: true, name: values.name ?? "" };

  // Cloudflare sets the visitor's address in cf-connecting-ip; other hosts in x-forwarded-for.
  const requestHeaders = await headers();
  const address =
    requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`inquiry:${address}`, LIMIT, WINDOW_MS)) {
    return { ok: false, errors: { form: "That's a lot of messages at once. Please try again in a few minutes." }, values };
  }

  const parsed = inquirySchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: errorsOf(parsed.error), values };

  try {
    await inquiryRepository.create(parsed.data);
  } catch {
    return { ok: false, errors: { form: "Something went wrong on our side. Please try again, or email us." }, values };
  }
  return { ok: true, name: parsed.data.name };
}
