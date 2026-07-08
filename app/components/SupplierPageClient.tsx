"use client";

import { useRouter } from "next/navigation";
import { SupplierForm, type SupplierFormInitial } from "@/components/SupplierForm";

export function NewSupplierClient() {
  const router = useRouter();
  return (
    <div className="max-w-lg">
      <SupplierForm
        onCancel={() => router.push("/suppliers/")}
        onSaved={() => router.push("/suppliers/")}
      />
    </div>
  );
}

export function EditSupplierClient({ initial }: { initial: SupplierFormInitial }) {
  const router = useRouter();
  return (
    <div className="max-w-lg">
      <SupplierForm
        initial={initial}
        onCancel={() => router.push("/suppliers/")}
        onSaved={() => {
          router.push("/suppliers/");
          router.refresh();
        }}
      />
    </div>
  );
}
