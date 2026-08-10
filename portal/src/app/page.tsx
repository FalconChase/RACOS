"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession } from "@/lib/ownerAuth";

// Bare landing route — sends the browser straight to /dashboard (if a
// session is already stored) or /login. No UI of its own.
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getStoredSession() ? "/dashboard" : "/login");
  }, [router]);

  return null;
}
