/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVaultKey } from "@/lib/vault-context";
import { trpc } from "@/lib/trpc-client";
import { useToast } from "@/components/ui/toast";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function VaultPage() {
  const [passphrase, setPassphrase] = useState("");
  const { hasKey, setPassphrase: activateVault, clearKey, loading } = useVaultKey();
  const { push } = useToast();
  const [confirmReset, setConfirmReset] = useState(false);

  const utils = trpc.useUtils();
  const resetVault = trpc.vault.reset.useMutation({
    onSuccess: () => {
      push({ title: "Vault zurückgesetzt", tone: "success" });
      utils.vault.items.invalidate();
      utils.vault.status.invalidate();
      // Clear local salt storage
      if (typeof window !== "undefined") {
        localStorage.removeItem("xynoxa.vault.salt");
        localStorage.removeItem("xynoxa.vault.salt");
      }
    }
  });

  const [resetConfirm, setResetConfirm] = useState("");

  const vaultItems = trpc.vault.items.useQuery();
  const vaultFiles = useMemo(() => vaultItems.data?.files ?? [], [vaultItems.data?.files]);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Vault</p>
          <h1 className="text-2xl font-semibold text-slate-50">Client-Side Encryption</h1>
          <p className="text-sm text-slate-300">
            Eigene Vault-Passphrase (nicht das Login-Passwort); Salt + Cipher werden serverseitig gespeichert, Schlüssel bleibt lokal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Vault-Passphrase festlegen/entsperren"
            className="w-48"
          />
          <Button onClick={async () => {
            if (!passphrase.trim()) return;
            try {
              await activateVault(passphrase);
            } catch (e: any) {
              push({ title: "Fehler", description: e.message, tone: "error" });
            }
          }} disabled={loading}>
            {loading ? "Lade..." : hasKey ? "Key aktiv" : "Key eingeben"}
          </Button>
          {hasKey && (
            <Button variant="outline" onClick={clearKey}>
              Key entfernen
            </Button>
          )}
          <Button variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-950/30" onClick={() => setConfirmReset(true)}>
            Reset
          </Button>
        </div>
      </header>

      <div className="space-y-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300 space-y-2">
          <p className="font-semibold text-slate-100">Vault Status</p>
          <div className="flex items-center justify-between text-sm">
            <span>Envelope-Key</span>
            <Badge tone={hasKey ? "emerald" : "amber"}>{hasKey ? "aktiv" : "nicht gesetzt"}</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Vault-Dateien</span>
            <Badge tone="cyan">{vaultFiles.length}</Badge>
          </div>
          <p className="text-xs text-slate-500">
            Sharing ist für Vault-Inhalte deaktiviert; der Server speichert nur Ciphertext + IV.
            Vault-Schlüssel liegt ausschließlich lokal – bitte sichere deine Passphrase.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-200 space-y-2">
          <p className="font-semibold text-slate-100">Vault-Dateien</p>
          {vaultFiles.length === 0 && <p className="text-sm text-slate-500">Keine Vault-Dateien.</p>}
          {vaultFiles.map((f) => (
            <div key={f.id} className="flex items-center justify-between border border-slate-800 rounded-lg px-3 py-2 bg-slate-950/70">
              <div>
                <p className="text-sm text-slate-100">{f.name}</p>
                <p className="text-[11px] text-slate-500">{f.size ?? "—"}</p>
              </div>
              <Badge tone="amber">IV</Badge>
            </div>
          ))}
          <p className="text-xs text-slate-500">
            Uploads bitte auf der Files-Seite mit aktiviertem Vault-Key durchführen.
          </p>
        </div>
      </div>
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500">Vault zurücksetzen?</AlertDialogTitle>
            <AlertDialogDescription>
              Warnung: Dies löscht **ALLE** Dateien, die sich im Vault befinden, unwiderruflich.
              Nutzen Sie dies nur, wenn Sie Ihre Passphrase vergessen haben und neu anfangen müssen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Bestätige mit <code className="text-amber-300">RESET</code>:</p>
            <Input
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder="RESET"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={resetConfirm !== "RESET" || resetVault.isPending}
              onClick={() => {
                resetVault.mutate();
                setConfirmReset(false);
                setResetConfirm("");
                clearKey();
              }}
            >
              {resetVault.isPending ? "Lösche..." : "Alles löschen & Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
