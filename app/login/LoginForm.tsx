"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "./actions";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

/** Red ring + red border while the last attempt is still failing. */
const INVALID = "border-red-400 ring-2 ring-red-500/25 dark:border-red-700";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn(email, password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push(searchParams.get("redirectTo") || "/");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-6 shadow-sm"
    >
      {/* The banner sits above the fields: a failure printed under the button
          lands below the fold once the phone keyboard is up. */}
      {error && (
        <Alert variant="danger" id="login-error" className="font-medium">
          <span aria-hidden>⚠ </span>
          {error}
        </Alert>
      )}

      <FormField label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          name="email"
          required
          autoFocus
          autoComplete="username"
          inputMode="email"
          enterKeyHint="next"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className={`h-11 text-16 ${error ? INVALID : ""}`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>
      <FormField label="Password" htmlFor="password">
        <Input
          id="password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
          enterKeyHint="go"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className={`h-11 text-16 ${error ? INVALID : ""}`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      <Button type="submit" size="lg" disabled={submitting} className="h-11 w-full font-bold">
        {submitting ? "Memeriksa…" : "Masuk"}
      </Button>
    </form>
  );
}
