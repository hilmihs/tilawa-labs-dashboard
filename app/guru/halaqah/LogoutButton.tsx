"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { logoutGuru } from "../actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      className="h-10 shrink-0 px-3"
      onClick={() =>
        startTransition(async () => {
          await logoutGuru();
          router.push("/guru");
        })
      }
    >
      {pending ? "Keluar…" : "Keluar"}
    </Button>
  );
}
