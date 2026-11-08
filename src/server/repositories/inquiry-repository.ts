import "server-only";
import type { InquiryInput } from "@/features/inquiry/schema";
import { sendStudioEmail } from "@/server/email/studio-email";

/*
 * Where inquiries go (AGENTS.md §9). UI and actions depend on this interface. Each inquiry
 * is emailed to the studio inbox (server/email); a database can be added behind the same
 * interface later for a searchable history.
 */
export interface StoredInquiry extends InquiryInput {
  id: string;
  createdAt: Date;
}

export interface InquiryRepository {
  create: (inquiry: InquiryInput) => Promise<StoredInquiry>;
}

class EmailInquiryRepository implements InquiryRepository {
  async create(inquiry: InquiryInput): Promise<StoredInquiry> {
    const stored = { ...inquiry, id: crypto.randomUUID(), createdAt: new Date() };
    await sendStudioEmail({
      subject: `New inquiry from ${inquiry.name}${inquiry.company ? ` (${inquiry.company})` : ""}`,
      lines: [
        ["Name", inquiry.name],
        ["Company", inquiry.company],
        ["Email", inquiry.email],
        ["Needs help with", inquiry.service],
        ["Budget", inquiry.budget],
        ["Consented to privacy policy version", inquiry.consent],
        ["Received", stored.createdAt.toISOString()],
        ["Reference", stored.id],
      ],
      replyTo: { email: inquiry.email, name: inquiry.name },
    });
    return stored;
  }
}

export const inquiryRepository: InquiryRepository = new EmailInquiryRepository();
