"use client";

// SignInPanel — dual-mode sign-in (pattern from pss-orderbook):
//   - default (production): Azure OAuth button only
//   - opt-in (dev/clone):   email/password form instead
//
// The opt-in is gated by NEXT_PUBLIC_ALLOW_PASSWORD_AUTH=1, set only when
// building against the local Supabase clone (local/.env), where Azure OAuth
// is not configured. build.sh never sets it, so production builds
// dead-code-eliminate the password branch entirely (bead 9bq.22).

import { AuthButton } from "@platform/auth";
import { supabase } from "@platform/supabase";
import { useState } from "react";

const ALLOW_PASSWORD_AUTH = process.env.NEXT_PUBLIC_ALLOW_PASSWORD_AUTH === "1";

export function SignInPanel() {
  if (!ALLOW_PASSWORD_AUTH) {
    return <AuthButton />;
  }
  return <PasswordSignInForm />;
}

function PasswordSignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    if (data.session) {
      // Full navigation, not the Next router — the router would re-prepend
      // basePath to an already-prefixed path.
      window.location.href = "/purchase-order/";
    }
  }

  return (
    <form onSubmit={signIn} className="space-y-3">
      <p className="text-center text-xs font-medium uppercase tracking-wide text-amber-600">
        ⚠ Dev mode — email/password sign-in
      </p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        autoComplete="username"
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password"
        autoComplete="current-password"
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !email || !password}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
