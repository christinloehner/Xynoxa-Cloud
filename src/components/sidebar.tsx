/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import clsx from "clsx";
import { usePathname, useRouter } from "next/navigation";
import { File, Search, Shield, Settings, Users2, UsersRound, LogOut, Sun, Moon, Folder, LayoutDashboard, Package, Calendar } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { motion } from "framer-motion";
import { useTheme } from "@/lib/theme-context";
import { useEffect, useState } from "react";
import type { ModuleAdminNavigationItem, ModuleNavigationItem } from "@/types/module";
import { CLIENT_MODULES } from "@/lib/module-registry.client";

// Statische Links, die immer an fester Position erscheinen
const staticLinks = {
  top: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/files", label: "Dateiverwaltung", icon: File },
  ],
  bottom: [
    { href: "/calendar", label: "Calendar", icon: Calendar },
    { href: "/vault", label: "Vault", icon: Shield },
    { href: "/search", label: "Suche", icon: Search },
  ]
};

export function Sidebar({ userRole }: { userRole?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [moduleNavItems, setModuleNavItems] = useState<ModuleNavigationItem[]>([]);
  const [moduleAdminItems, setModuleAdminItems] = useState<ModuleAdminNavigationItem[]>([]);
  
  // Hole aktive Module über tRPC
  const activeModules = trpc.modules.getActive.useQuery();

  const isAdmin = userRole === 'admin' || userRole === 'owner';

  // Lade Module Navigation
  const roleAllows = (required?: "admin" | "owner" | "user") => {
    if (!required) return true;
    if (!userRole) return false;
    if (userRole === "owner") return true;
    if (userRole === "admin" && (required === "admin" || required === "user")) return true;
    if (userRole === "user" && required === "user") return true;
    return required === userRole;
  };

  useEffect(() => {
    const loadModuleNav = () => {
      // Hole aktive Module IDs aus der API
      const activeModuleIds = activeModules.data || [];
      if (activeModuleIds.length === 0) {
        setModuleNavItems([]);
        setModuleAdminItems([]);
        return;
      }

      console.log("[Sidebar] Active module IDs from API:", activeModuleIds);

      const moduleById = new Map(
        CLIENT_MODULES
          .filter((mod): mod is NonNullable<typeof mod> => Boolean(mod?.metadata?.id))
          .map((mod) => [mod.metadata.id, mod])
      );

      // Lade Module-Navigation dynamisch basierend auf aktiven Modulen
      const items: ModuleNavigationItem[] = [];
      const adminItems: ModuleAdminNavigationItem[] = [];
      
      for (const moduleId of activeModuleIds) {
        try {
          const mod = moduleById.get(moduleId);
          if (!mod) {
            console.warn(`[Sidebar] Active module not found in client registry: ${moduleId}`);
            continue;
          }
          const moduleNav = mod.navigation;
          const moduleAdminNav = mod.adminNavigation;
          
          if (moduleNav) {
            // Filtere nach Rolle
            const roleFiltered = moduleNav.filter((item: ModuleNavigationItem) => roleAllows(item.requiredRole));
            items.push(...roleFiltered);
          }

          if (moduleAdminNav) {
            const roleFiltered = moduleAdminNav.filter((item: ModuleAdminNavigationItem) => roleAllows(item.requiredRole));
            adminItems.push(...roleFiltered);
          }
        } catch (error) {
          console.error(`[Sidebar] Failed to load module ${moduleId}:`, error);
        }
      }
      
      // Alphabetisch sortieren nach Label
      items.sort((a, b) => a.label.localeCompare(b.label, 'de'));
      adminItems.sort((a, b) => a.label.localeCompare(b.label, 'de'));
      
      console.log("[Sidebar] Loaded navigation items:", items);
      setModuleNavItems(items);
      setModuleAdminItems(adminItems);
    };
    
    if (activeModules.data !== undefined) loadModuleNav();
  }, [userRole, activeModules.data]);

  // Baue die komplette Navigation zusammen:
  // 1. Top-Links (Dashboard, Dateiverwaltung)
  // 2. Alphabetisch sortierte Module
  // 3. Bottom-Links (Vault, Suche)
  // 4. Adminbereich (wenn berechtigt)
  const allNavigationItems = [
    ...staticLinks.top,
    ...moduleNavItems,
    ...staticLinks.bottom,
    ...(isAdmin ? [{ href: "/admin", label: "Adminbereich", icon: Settings, isAdmin: true }] : [])
  ];

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      router.push("/auth/login");
      router.refresh();
    }
  });

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex h-full w-64 flex-col gap-4 border-r border-slate-200 bg-white/80 p-4 dark:border-slate-900 dark:bg-slate-950"
      role="navigation"
      aria-label="Haupt-Navigation"
    >
      <motion.div
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="w-full px-2 mb-4"
      >
        <Link href="/" className="block w-full">
          <Image
            src="/images/logo/xynoxa-logo-transparent-light.png"
            alt="Xynoxa"
            width={150}
            height={40}
            className="w-full h-auto object-contain dark:hidden"
            priority
          />
          <Image
            src="/images/logo/xynoxa-logo-transparent-dark.png"
            alt="Xynoxa"
            width={150}
            height={40}
            className="w-full h-auto object-contain hidden dark:block"
            priority
          />
        </Link>
      </motion.div>
      <nav className="flex flex-col gap-1">
        {allNavigationItems.map((item, index) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          const isAdminSection = 'isAdmin' in item && item.isAdmin;

          // Admin-Bereich mit Sub-Navigation
          if (isAdminSection) {
            const adminExpanded = pathname.startsWith("/admin");
            return (
              <div key="admin-section">
                <Link href="/admin" legacyBehavior passHref>
                  <motion.a
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.05 * index, duration: 0.2 }}
                    whileHover={{ x: 4, transition: { duration: 0.2 } }}
                    whileTap={{ scale: 0.98 }}
                    className={clsx(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition relative",
                      adminExpanded
                        ? "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-100 dark:ring-cyan-500/40"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    )}
                  >
                    <Icon size={16} className={clsx(adminExpanded ? "text-cyan-600 dark:text-cyan-200" : "text-slate-400 dark:text-slate-300")} aria-hidden="true" />
                    {item.label}
                  </motion.a>
                </Link>
                {adminExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="ml-4 mt-1 flex flex-col gap-1 border-l border-slate-200 pl-2 dark:border-slate-800"
                  >
                    {[
                      { href: "/admin/settings", label: "Einstellungen", icon: Settings },
                      { href: "/admin/users", label: "Benutzer", icon: Users2 },
                      { href: "/admin/groups", label: "Gruppen", icon: UsersRound },
                      { href: "/admin/group-folders", label: "Gruppenordner", icon: Folder },
                      { href: "/admin/modules", label: "Module", icon: Package },
                      ...moduleAdminItems.map((item) => ({
                        href: item.href,
                        label: item.label,
                        icon: item.icon,
                        id: item.id
                      }))
                    ].map(sub => (
                      <Link key={sub.href} href={sub.href as any} className={clsx(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition",
                        pathname === sub.href
                          ? "bg-slate-100 text-cyan-700 dark:bg-slate-800 dark:text-cyan-100"
                          : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      )}>
                        <sub.icon size={12} />
                        {sub.label}
                      </Link>
                    ))}
                  </motion.div>
                )}
              </div>
            );
          }

          // Normale Navigationslinks (statisch + Module)
          const itemKey: string = 'id' in item ? (item.id as string) : item.href;
          const itemBadge: string | undefined = 'badge' in item ? (item.badge as string | undefined) : undefined;

          return (
            <Link key={itemKey} href={item.href as any} legacyBehavior passHref>
              <motion.a
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.05 * index, duration: 0.2 }}
                whileHover={{ x: 4, transition: { duration: 0.2 } }}
                whileTap={{ scale: 0.98 }}
                className={clsx(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition relative",
                  active
                    ? "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-100 dark:ring-cyan-500/40"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={16} className={clsx(active ? "text-cyan-600 dark:text-cyan-200" : "text-slate-400 dark:text-slate-300")} aria-hidden="true" />
                {item.label}
                {itemBadge && (
                  <span className="ml-auto rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
                    {itemBadge}
                  </span>
                )}
              </motion.a>
            </Link>
          );
        })}
      </nav>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className="mt-auto space-y-2 pt-2 pb-4"
      >
        <motion.button
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
          aria-label="Logout"
        >
          <LogOut size={16} className="text-red-500 dark:text-red-400" aria-hidden="true" />
          {logout.isPending ? "Logge aus..." : "Logout"}
        </motion.button>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300"
        >
          Tipp: Strg+K öffnet die Command Palette für schnelle Aktionen.
        </motion.div>
      </motion.div>
    </motion.aside>
  );
}
