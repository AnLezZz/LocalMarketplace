"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export default function SignOutButton({ className = "btn btn--secondary btn--sm", children = "Sign out" }: { className?: string; children?: React.ReactNode }) {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <button type="button" className={className} onClick={() => void signOut().then(() => { router.push("/"); router.refresh(); })}>
      {children}
    </button>
  );
}
