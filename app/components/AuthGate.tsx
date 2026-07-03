"use client";

import { useAuth, AuthButton } from "@platform/auth";
import { Spinner } from "@platform/ui";
import { ReactNode } from "react";

/**
 * Client-side sign-in gate (ecosystem pattern — no server-side route
 * protection until the RLS phase). Shows the Azure sign-in when there is
 * no session; renders the app once authenticated.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <img
            src="/purchase-order/pss-logo-reversed.png"
            alt="PSS"
            className="mx-auto mb-6 h-10 w-auto rounded bg-zinc-900 p-2"
          />
          <h1 className="mb-1 text-lg font-semibold text-zinc-900">Purchase Orders</h1>
          <p className="mb-6 text-sm text-zinc-500">Sign in with your PSS account to continue.</p>
          <AuthButton />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
