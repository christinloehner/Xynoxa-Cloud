/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { trpc } from "@/lib/trpc-client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import Image from "next/image";

export default function AdminModulesPage() {
  const [activatingModule, setActivatingModule] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  // Queries
  const modulesList = trpc.modules.list.useQuery();
  
  // Mutations
  const activateModule = trpc.modules.activate.useMutation({
    onSuccess: (data, variables) => {
      modulesList.refetch();
      setActivatingModule(null);
      toast.push({ 
        title: "Modul aktiviert", 
        description: `Das Modul wurde erfolgreich aktiviert. Die Seite wird neu geladen...`,
        tone: "success" 
      });
      // Vollständiger Reload damit Module-Loader neu initialisiert wird
      setTimeout(() => window.location.reload(), 1500);
    },
    onError: (error, variables) => {
      setActivatingModule(null);
      toast.push({ 
        title: "Aktivierung fehlgeschlagen", 
        description: error.message,
        tone: "error" 
      });
    }
  });

  const deactivateModule = trpc.modules.deactivate.useMutation({
    onSuccess: () => {
      modulesList.refetch();
      toast.push({ 
        title: "Modul deaktiviert", 
        description: "Das Modul wurde erfolgreich deaktiviert. Die Seite wird neu geladen...",
        tone: "success" 
      });
      // Vollständiger Reload damit Module-Loader neu initialisiert wird
      setTimeout(() => window.location.reload(), 1500);
    },
    onError: (error) => {
      toast.push({ 
        title: "Deaktivierung fehlgeschlagen", 
        description: error.message,
        tone: "error" 
      });
    }
  });

  const discoverModules = trpc.modules.discoverModules.useMutation({
    onSuccess: () => {
      modulesList.refetch();
      toast.push({ 
        title: "Module gescannt", 
        description: "Neue Module wurden erkannt und registriert.",
        tone: "success" 
      });
    },
    onError: (error) => {
      toast.push({ 
        title: "Scan fehlgeschlagen", 
        description: error.message,
        tone: "error" 
      });
    }
  });

  const handleActivate = (moduleId: string) => {
    setActivatingModule(moduleId);
    activateModule.mutate({ moduleId });
  };

  const handleDeactivate = (moduleId: string) => {
    if (confirm("Möchtest du dieses Modul wirklich deaktivieren?")) {
      deactivateModule.mutate({ moduleId });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Aktiviert
          </Badge>
        );
      case "inactive":
        return (
          <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30">
            <XCircle className="mr-1 h-3 w-3" />
            Inaktiv
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-red-500/20 text-red-300 border-red-500/30">
            <AlertTriangle className="mr-1 h-3 w-3" />
            Fehler
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (modulesList.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-cyan-500" size={32} />
      </div>
    );
  }

  if (modulesList.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-red-400">
        <AlertTriangle size={48} />
        <p>Fehler beim Laden der Module: {modulesList.error.message}</p>
      </div>
    );
  }

  const modules = modulesList.data || [];

  return (
    <div className="space-y-6 pb-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Admin</p>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
            Module-Verwaltung
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Installiere, aktiviere oder deaktiviere Xynoxa Module.
          </p>
        </div>
        <Button
          onClick={() => discoverModules.mutate()}
          disabled={discoverModules.isPending}
          className="bg-cyan-500/15 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/25"
        >
          {discoverModules.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Module scannen
        </Button>
      </header>

      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">Modul-FAQ</CardTitle>
          <CardDescription className="text-sm text-slate-600 dark:text-slate-400">
            Kurz und wichtig, damit Plug&Play sauber funktioniert.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
          <p>
            <span className="font-medium text-slate-800 dark:text-slate-200">Neue Module sichtbar machen:</span>{" "}
            Modul in <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">src/modules</code>{" "}
            kopieren und hier auf <span className="font-medium">Module scannen</span> klicken.
          </p>
          <p>
            <span className="font-medium text-slate-800 dark:text-slate-200">Routen aktivieren:</span>{" "}
            In Produktion wird nach neuen Modulen ein Build/Deploy benoetigt, damit die Modul-Routen als echte Pages erzeugt werden.
          </p>
          <p>
            <span className="font-medium text-slate-800 dark:text-slate-200">Aktivierung:</span>{" "}
            Aktivieren fuehrt die Modul-Installation aus (z.B. DB-Tabellen) und schaltet das Modul frei.
          </p>
          <p>
            <span className="font-medium text-slate-800 dark:text-slate-200">Deaktivierung:</span>{" "}
            Deaktiviert das Modul im UI, laesst Daten aber standardmaessig bestehen (abh. vom Modul).
          </p>
        </CardContent>
      </Card>

      {modules.length === 0 ? (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <Package className="h-12 w-12 text-slate-400" />
              <p className="text-slate-600 dark:text-slate-400">
                Keine Module gefunden. Klicke auf &quot;Module scannen&quot; um Module zu entdecken.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => (
            <Card 
              key={module.id} 
              className={clsx(
                "border-slate-200 dark:border-slate-800 transition-all",
                module.status === "active" && "border-cyan-500/30 bg-cyan-500/5"
              )}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {module.logoUrl ? (
                      <Image
                        src={module.logoUrl}
                        alt={module.name}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-lg object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-700">
                        <Package className="h-5 w-5 text-slate-300" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-base text-slate-900 dark:text-slate-100">
                        {module.name}
                      </CardTitle>
                      <p className="text-xs text-slate-500">v{module.version}</p>
                    </div>
                  </div>
                  {getStatusBadge(module.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <CardDescription className="text-sm text-slate-600 dark:text-slate-400">
                  {module.description}
                </CardDescription>
                
                {module.author && (
                  <p className="text-xs text-slate-500">
                    von <span className="font-medium">{module.author}</span>
                  </p>
                )}

                {module.status === "error" && module.installError && (
                  <div className="rounded-md bg-red-500/10 border border-red-500/20 p-2">
                    <p className="text-xs text-red-400">{module.installError}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  {module.status === "active" ? (
                    <Button
                      onClick={() => handleDeactivate(module.moduleId)}
                      disabled={deactivateModule.isPending}
                      variant="outline"
                      size="sm"
                      className="flex-1 border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    >
                      {deactivateModule.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Deaktivieren
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleActivate(module.moduleId)}
                      disabled={activatingModule === module.moduleId}
                      size="sm"
                      className="flex-1 bg-cyan-500 text-white hover:bg-cyan-600"
                    >
                      {activatingModule === module.moduleId ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Aktivieren & Installieren
                    </Button>
                  )}
                </div>

                {module.installedAt && (
                  <p className="text-xs text-slate-500">
                    Installiert: {new Date(module.installedAt).toLocaleDateString("de-DE")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
