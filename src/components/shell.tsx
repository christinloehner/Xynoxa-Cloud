/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import dynamic from "next/dynamic";
const Topbar = dynamic(() => import("@/components/topbar").then(m => m.Topbar), { ssr: false });
import { RightSidebar } from "@/components/right-sidebar";
import { useRightSidebar } from "@/lib/sidebar-context";
import { CommandPalette } from "@/components/command-palette";
import clsx from "clsx";

export function Shell({ children, userRole }: { children: ReactNode; userRole?: string }) {
  const { isOpen } = useRightSidebar();

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-white via-aurora-mint/10 to-xynoxa-cyan/10 text-slate-900 dark:bg-slate-950 dark:bg-none dark:text-slate-100 overflow-hidden">
      {/* Fixed Left Sidebar - z-index high to stay above content if needed, but below modals */}
      <div className="fixed left-0 top-0 bottom-0 z-30 hidden md:block">
        <SidebarBase userRole={userRole} />
      </div>

      {/* Main Container */}
      <div className="flex flex-1 flex-col transition-all duration-300 md:pl-64">
        {/* Fixed Topbar */}
        <div className="fixed top-0 right-0 left-0 z-20 md:left-64">
          <Topbar userRole={userRole} />
        </div>

        {/* Scrollable Content Area */}
        <main className={clsx(
          "flex-1 mt-14 overflow-y-auto min-h-[calc(100vh-3.5rem)] bg-white/70 backdrop-blur-sm dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-920 dark:to-slate-900/85 p-6 transition-all duration-300",
          isOpen ? "mr-80" : ""
        )}
        >
          <CommandPalette />
          {children}
        </main>
      </div>

      {/* Right Sidebar */}
      <RightSidebar />
    </div>
  );
}

// Wrapper to keep the original Sidebar logic but strip external layout/margin if necessary.
// Since the original Sidebar component had margins/height built-in, we just use it directly.
function SidebarBase({ userRole }: { userRole?: string }) {
  return <Sidebar userRole={userRole} />;
}
