/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import Link from "next/link";
import { Bell, CircleUserRound, Sun, Moon, Check, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ModuleUserMenuItem } from "@/types/module";
import { useTheme } from "@/lib/theme-context";
import { CLIENT_MODULES } from "@/lib/module-registry.client";
import { useNotificationStream } from "@/lib/notification-client";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import clsx from "clsx";

export function Topbar({ userRole }: { userRole?: string }) {
  const router = useRouter();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      router.push("/auth/login");
      router.refresh();
    }
  });
  const utils = trpc.useUtils();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const closeTimer = useRef<NodeJS.Timeout | null>(null);
  const notifTimer = useRef<NodeJS.Timeout | null>(null);
  const { theme, toggleTheme } = useTheme();
  useNotificationStream();
  const [moduleUserItems, setModuleUserItems] = useState<ModuleUserMenuItem[]>([]);

  const activeModules = trpc.modules.getActive.useQuery();

  const { data: notificationList } = trpc.notifications.list.useQuery({ limit: 20, includeRead: true });
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    initialData: notificationList ? { count: notificationList.unreadCount } : undefined,
    staleTime: 15000
  });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: (res, variables) => {
      const ids = variables?.ids ?? [];
      utils.notifications.list.setData({ limit: 20, includeRead: true }, (old) => {
        const base = old ?? { items: [], nextCursor: null, unreadCount: 0 };
        return {
          ...base,
          unreadCount: res.unread,
          items: base.items.map((n) => (ids.length === 0 || ids.includes(n.id) ? { ...n, readAt: new Date() } : n))
        };
      });
      utils.notifications.unreadCount.setData(undefined, { count: res.unread });
      utils.notifications.list.invalidate({ limit: 20, includeRead: true });
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.refetch({ limit: 20, includeRead: true });
      utils.notifications.unreadCount.refetch();
    }
  });

  const deleteMutation = trpc.notifications.delete.useMutation({
    onMutate: async (vars) => {
      // Optimistic update: Sofort aus UI entfernen
      await utils.notifications.list.cancel({ limit: 20, includeRead: true });
      const previousData = utils.notifications.list.getData({ limit: 20, includeRead: true });
      
      utils.notifications.list.setData({ limit: 20, includeRead: true }, (old) => {
        if (!old) return old;
        const ids = vars?.ids ?? [];
        return { 
          ...old, 
          items: old.items.filter((n) => !ids.includes(n.id)) 
        };
      });
      
      return { previousData };
    },
    onError: (err, vars, context) => {
      // Bei Fehler: Alten Stand wiederherstellen
      if (context?.previousData) {
        utils.notifications.list.setData({ limit: 20, includeRead: true }, context.previousData);
      }
    },
    onSuccess: (res) => {
      // Update unread count
      utils.notifications.unreadCount.setData(undefined, { count: res.unread });
      utils.notifications.list.setData({ limit: 20, includeRead: true }, (old) => {
        if (!old) return old;
        return { ...old, unreadCount: res.unread };
      });
    },
    onSettled: () => {
      // Refetch um sicher zu sein
      utils.notifications.list.invalidate({ limit: 20, includeRead: true });
      utils.notifications.unreadCount.invalidate();
    }
  });

  const deleteAllMutation = trpc.notifications.deleteAll.useMutation({
    onMutate: async () => {
      // Optimistic update: Alle sofort aus UI entfernen
      await utils.notifications.list.cancel({ limit: 20, includeRead: true });
      const previousData = utils.notifications.list.getData({ limit: 20, includeRead: true });
      
      utils.notifications.list.setData({ limit: 20, includeRead: true }, (old) => {
        if (!old) return old;
        return { 
          ...old, 
          items: [],
          unreadCount: 0
        };
      });
      utils.notifications.unreadCount.setData(undefined, { count: 0 });
      
      return { previousData };
    },
    onError: (err, vars, context) => {
      // Bei Fehler: Alten Stand wiederherstellen
      if (context?.previousData) {
        utils.notifications.list.setData({ limit: 20, includeRead: true }, context.previousData);
      }
    },
    onSuccess: () => {
      // Bereits in onMutate gesetzt, aber zur Sicherheit
      utils.notifications.unreadCount.setData(undefined, { count: 0 });
      utils.notifications.list.setData({ limit: 20, includeRead: true }, (old) => {
        if (!old) return old;
        return { ...old, items: [], unreadCount: 0 };
      });
    },
    onSettled: () => {
      // Refetch um sicher zu sein
      utils.notifications.list.invalidate({ limit: 20, includeRead: true });
      utils.notifications.unreadCount.invalidate();
    }
  });

  const unread = unreadCount?.count ?? notificationList?.unreadCount ?? 0;

  const openMenu = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setUserMenuOpen(true);
  };

  const delayedClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setUserMenuOpen(false), 180);
  };

  const openNotifications = () => {
    if (notifTimer.current) {
      clearTimeout(notifTimer.current);
      notifTimer.current = null;
    }
    setNotificationOpen(true);
  };

  const delayedNotifClose = () => {
    if (notifTimer.current) clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => setNotificationOpen(false), 180);
  };

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (notifTimer.current) clearTimeout(notifTimer.current);
    };
  }, []);

  const roleAllows = (required?: "admin" | "owner" | "user") => {
    if (!required) return true;
    if (!userRole) return false;
    if (userRole === "owner") return true;
    if (userRole === "admin" && (required === "admin" || required === "user")) return true;
    if (userRole === "user" && required === "user") return true;
    return required === userRole;
  };

  useEffect(() => {
    const loadModuleUserNav = () => {
      const activeModuleIds = activeModules.data || [];
      if (activeModuleIds.length === 0) {
        setModuleUserItems([]);
        return;
      }

      const moduleById = new Map(
        CLIENT_MODULES
          .filter((mod): mod is NonNullable<typeof mod> => Boolean(mod?.metadata?.id))
          .map((mod) => [mod.metadata.id, mod])
      );

      const items: ModuleUserMenuItem[] = [];

      for (const moduleId of activeModuleIds) {
        try {
          const mod = moduleById.get(moduleId);
          if (!mod) {
            console.warn(`[Topbar] Active module not found in client registry: ${moduleId}`);
            continue;
          }
          const moduleUserNav = mod.userNavigation;
          if (moduleUserNav) {
            const roleFiltered = moduleUserNav.filter((item: ModuleUserMenuItem) => roleAllows(item.requiredRole));
            items.push(...roleFiltered);
          }
        } catch (error) {
          console.error(`[Topbar] Failed to load module ${moduleId}:`, error);
        }
      }

      items.sort((a, b) => a.label.localeCompare(b.label, "de"));
      setModuleUserItems(items);
    };

    if (activeModules.data !== undefined) loadModuleUserNav();
  }, [activeModules.data, userRole]);

  const handleMarkRead = (id?: string) => {
    markRead.mutate(id ? { ids: [id] } : undefined);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ ids: [id] });
  };

  const handleOpenNotification = (n: any) => {
    if (!n.readAt) handleMarkRead(n.id);
    if (n.href) router.push(n.href);
    setNotificationOpen(false);
  };

  return (
    <header className="flex flex-col gap-2 border-b border-slate-200 bg-white/80 backdrop-blur-sm px-6 py-3 shadow-sm dark:border-slate-900 dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-300">Xynoxa Cloud</div>
        <div className="flex items-center gap-3">
          <button
            className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:border-cyan-400 hover:text-cyan-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-cyan-200"
            onClick={toggleTheme}
            title={theme === "dark" ? "Zu Light Mode wechseln" : "Zu Dark Mode wechseln"}
            aria-label={theme === "dark" ? "Zu Light Mode wechseln" : "Zu Dark Mode wechseln"}
          >
            {theme === "dark" ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-indigo-600 dark:text-indigo-400" />}
          </button>
          <div className="relative" onMouseEnter={openNotifications} onMouseLeave={delayedNotifClose}>
            <button
              className={clsx(
                "relative rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:border-cyan-400 hover:text-cyan-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-cyan-200",
                notificationOpen && "border-cyan-400 text-cyan-600 dark:text-cyan-200"
              )}
              onClick={() => setNotificationOpen((o) => !o)}
              aria-label="Benachrichtigungen"
            >
              <Bell size={16} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] rounded-full bg-rose-500 px-1 text-[11px] font-semibold text-white text-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
            {notificationOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-2xl dark:border-slate-800/70 dark:bg-slate-900/95 backdrop-blur-md z-50"
                onMouseEnter={openNotifications}
                onMouseLeave={delayedNotifClose}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Benachrichtigungen</div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs rounded-md px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200"
                      onClick={() => handleMarkRead()}
                      disabled={markRead.isPending}
                    >
                      Alle gelesen
                    </button>
                    <button
                      className="text-xs rounded-md px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:text-red-200"
                      onClick={() => {
                        deleteAllMutation.mutate();
                      }}
                      disabled={deleteAllMutation.isPending || !notificationList?.items?.length}
                    >
                      Alle löschen
                    </button>
                  </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {notificationList?.items?.length ? (
                    notificationList.items.map((n) => (
                      <div
                        key={n.id}
                        className={clsx(
                          "flex flex-col gap-2 px-4 py-3 cursor-pointer transition-colors",
                          !n.readAt ? "bg-slate-50/70 dark:bg-slate-800/40" : "hover:bg-slate-50 dark:hover:bg-slate-800/30"
                        )}
                        onClick={() => handleOpenNotification(n)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{n.title}</div>
                            {n.body && <div className="text-sm text-slate-600 dark:text-slate-300">{n.body}</div>}
                            <div className="text-xs text-slate-400 dark:text-slate-500">
                              {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: de })}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {!n.readAt && (
                              <button
                                className="p-1 rounded-md text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkRead(n.id);
                                }}
                                aria-label="Als gelesen markieren"
                              >
                                <Check size={14} />
                              </button>
                            )}
                            <button
                              className="p-1 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(n.id);
                              }}
                              aria-label="Löschen"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">Keine Benachrichtigungen.</div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div
            className="relative"
            onMouseEnter={openMenu}
            onMouseLeave={delayedClose}
          >
            <button
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:border-cyan-400 hover:text-cyan-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-cyan-200"
              onClick={() => setUserMenuOpen((o) => !o)}
              onFocus={openMenu}
              onBlur={delayedClose}
            >
              <CircleUserRound size={16} />
            </button>
            {userMenuOpen && (
              <div
                className="absolute right-0 top-full translate-y-[-2px] w-60 rounded-xl border border-slate-200 bg-white/95 shadow-2xl p-3 pt-3 dark:border-slate-800/70 dark:bg-slate-900/95 backdrop-blur-md"
                onMouseEnter={openMenu}
                onMouseLeave={delayedClose}
              >
                <nav className="flex flex-col text-sm text-slate-900 gap-2 dark:text-slate-100">
                  {[
                    { label: "User Profile", href: "/user/myprofile" },
                    { label: "Edit Profile", href: "/user/profile" },
                    { label: "Privacy Settings", href: "/user/privacy" },
                    { label: "Account", href: "/user/account" },
                    { label: "Settings", href: "/user/settings" },
                    { label: "API Tokens", href: "/user/tokens" }
                  ].map((item) => (
                    <Link
                      key={item.label}
                      href={item.href as any}
                      className="rounded-lg px-3 py-2 bg-slate-100 hover:bg-slate-200 transition text-slate-900 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 dark:text-slate-100"
                    >
                      {item.label}
                    </Link>
                  ))}
                  {moduleUserItems.length > 0 && (
                    <div className="border-t border-slate-200/60 dark:border-slate-800/60 pt-2 mt-1">
                      {moduleUserItems.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href as any}
                          className="rounded-lg px-3 py-2 bg-slate-100 hover:bg-slate-200 transition text-slate-900 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 dark:text-slate-100"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                  <button
                    className="rounded-lg px-3 py-2 bg-red-50 text-red-700 hover:bg-red-100 transition text-left dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20"
                    onClick={() => logout.mutate()}
                    disabled={logout.isPending}
                  >
                    {logout.isPending ? "Logge aus..." : "Logout"}
                  </button>
                </nav>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
