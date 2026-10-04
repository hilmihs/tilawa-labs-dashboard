"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginGuru } from "./actions";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function LoginForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !identifier.trim()) {
      setError("Nama dan email/nomor HP wajib diisi.");
      return;
    }
    startTransition(async () => {
      const res = await loginGuru(name, identifier);
      if (res.ok) router.push("/guru/halaqah");
      else setError(res.error);
    });
  }

  const invalid = error ? "border-red-400 ring-2 ring-red-500/25 dark:border-red-700" : "";

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-neutral-200 bg-card p-5 shadow-sm dark:border-neutral-800"
    >
      {/* Above the fields on purpose: on a phone the keyboard hides anything
          printed below the submit button. */}
      {error && (
        <Alert variant="danger" id="guru-login-error" className="font-medium">
          <span aria-hidden>⚠ </span>
          {error}
        </Alert>
      )}

      <FormField label="Nama lengkap" htmlFor="guru-name">
        <Input
          id="guru-name"
          type="text"
          autoComplete="name"
          autoFocus
          enterKeyHint="next"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "guru-login-error" : undefined}
          className={`h-11 text-16 ${invalid}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sesuai data di sistem"
        />
      </FormField>
      <FormField label="Email atau nomor HP" htmlFor="guru-id" hint="Salah satu yang terdaftar di sistem.">
        <Input
          id="guru-id"
          type="text"
          autoComplete="off"
          enterKeyHint="go"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "guru-login-error" : undefined}
          className={`h-11 text-16 ${invalid}`}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="email@contoh.com / 0812xxxx"
        />
      </FormField>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Memeriksa…" : "Masuk"}
      </Button>
    </form>
  );
}
