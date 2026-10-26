import "server-only";
import type { InquiryInput } from "@/features/inquiry/schema";

/*
 * Where inquiries are stored (AGENTS.md §9). UI and actions depend on this interface; the
 * in-memory implementation stands in until the database provider is chosen.
 */
export interface StoredInquiry extends InquiryInput {
  id: string;
  createdAt: Date;
}

export interface InquiryRepository {
  create: (inquiry: InquiryInput) => Promise<StoredInquiry>;
}

class InMemoryInquiryRepository implements InquiryRepository {
  private readonly items: StoredInquiry[] = [];

  async create(inquiry: InquiryInput): Promise<StoredInquiry> {
    const stored = { ...inquiry, id: crypto.randomUUID(), createdAt: new Date() };
    this.items.push(stored);
    return stored;
  }
}

export const inquiryRepository: InquiryRepository = new InMemoryInquiryRepository();
