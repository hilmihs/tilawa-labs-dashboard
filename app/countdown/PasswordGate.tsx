"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { unlockCountdown } from "./actions";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function PasswordGate({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await unlockCountdown(password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      setPassword("");
      return;
    }

    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-neutral-100">Countdown</h1>
          <p className="text-sm text-neutral-400">Masukkan password untuk membuka layar.</p>
        </div>

        {!configured ? (
          <Alert variant="danger">
            Password belum diatur. Jalankan{" "}
            <code>pnpm set:page-password countdown &lt;password&gt;</code> di server.
          </Alert>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-sm"
          >
            <FormField label="Password" htmlFor="page-password">
              <Input
                id="page-password"
                type="password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            {error && <Alert variant="danger">{error}</Alert>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Membuka..." : "Buka"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
