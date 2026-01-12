/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { ReactNode } from "react";
import { TRPCProvider } from "@/lib/trpc-client";
import { ThemeProvider } from "@/lib/theme-context";
import { SidebarProvider } from "@/lib/sidebar-context";
import { VaultKeyProvider } from "@/lib/vault-context";
import { ToastViewport } from "@/components/ui/toast";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <TRPCProvider>
      <ThemeProvider>
        <VaultKeyProvider>
          <SidebarProvider>
            {children}
            <ToastViewport />
          </SidebarProvider>
        </VaultKeyProvider>
      </ThemeProvider>
    </TRPCProvider>
  );
}
