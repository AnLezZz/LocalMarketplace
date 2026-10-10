/** How a category request's status is named and coloured. Keep the keys in sync with convex/categoryRequests.ts. */
export type RequestStatus = "pending" | "approved" | "assigned" | "more_info" | "rejected";

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  assigned: "Assigned to existing category",
  more_info: "More information required",
  rejected: "Rejected",
};

export const STATUS_PILL: Record<RequestStatus, string> = { pending: "requested", approved: "completed", assigned: "accepted", more_info: "new", rejected: "neutral" };

export const isOpen = (s: RequestStatus) => s === "pending" || s === "more_info";

/** What a provider sees from `categoryRequests.listMine`. */
export type MyRequest = {
  _id: string; name: string; description: string; status: RequestStatus;
  suggestedParentSlug?: string; suggestedParentLabel?: string; resolvedCategorySlug?: string; resolvedCategoryLabel?: string;
  adminNote?: string; providerReply?: string; submittedAt: number; updatedAt: number;
};
