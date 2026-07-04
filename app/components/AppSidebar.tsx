"use client";

import { SidebarUser } from "@platform/auth";
import { Sidebar } from "@platform/ui";

export function AppSidebar() {
  return (
    <Sidebar
      appLabel="Purchase Orders"
      logoSrc="/purchase-order/pss-logo-reversed.png"
      navSections={[
        {
          heading: "Purchasing",
          items: [
            { label: "Dashboard", href: "/purchase-order/" },
            { label: "PO List", href: "/purchase-order/po-list/" },
            { label: "Create PO", href: "/purchase-order/po/new/" },
          ],
        },
        {
          heading: "Tracking",
          items: [
            { label: "Expediting", href: "/purchase-order/expediting/" },
            { label: "Accounts", href: "/purchase-order/accounts/" },
            { label: "Spend Report", href: "/purchase-order/spend-report/" },
          ],
        },
      ]}
      userSlot={<SidebarUser />}
    />
  );
}
