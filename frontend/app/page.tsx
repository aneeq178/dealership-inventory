"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { FullPageSpinner } from "@/components/ui";

/** "/" just routes to the right place once we know whether the user is signed in. */
export default function Home() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/vehicles/");
    if (status === "anonymous") router.replace("/login/");
  }, [status, router]);

  return <FullPageSpinner />;
}
