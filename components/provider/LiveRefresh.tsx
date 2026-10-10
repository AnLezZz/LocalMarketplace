"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../lib/convex";

/**
 * Keeps a provider's dashboard current without a reload. Convex pushes a fingerprint of their bookings; when it changes the
 * page's server data is re-fetched in place (what you are typing and where you are scrolled stays put). Renders nothing.
 */
export default function LiveRefresh() {
  const router = useRouter();
  const pulse = useQuery(api.bookings.providerPulse) as string | null | undefined;
  const last = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (pulse === undefined) return;
    const first = last.current === undefined;
    const changed = last.current !== pulse;
    last.current = pulse;
    if (first || !changed) return;
    const t = setTimeout(() => router.refresh(), 250); // several changes in a burst become one refresh
    return () => clearTimeout(t);
  }, [pulse, router]);
  return null;
}
