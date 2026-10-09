"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <button className="alt" onClick={() => void signOut().then(() => { router.push("/"); router.refresh(); })}>
      Sign out
    </button>
  );
}
