/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  b64decode,
  b64encode,
  deriveVaultKey,
  generateEnvelopeKey,
  importEnvelopeKey,
  unwrapEnvelopeKey,
  wrapEnvelopeKey
} from "@/lib/vault-crypto";
import { trpc } from "@/lib/trpc-client";

const SALT_STORAGE_KEY = "xynoxa.vault.salt";
const LEGACY_SALT_STORAGE_KEY = "xynoxa.vault.salt";

type VaultContextType = {
  envelopeKey: CryptoKey | null;
  hasKey: boolean;
  setPassphrase: (pw: string) => Promise<void>;
  clearKey: () => void;
  loading: boolean;
  folderId: string | null;
  state: "loading" | "setup" | "locked" | "unlocked";
  needsSetup: boolean;
};

const VaultContext = createContext<VaultContextType>({
  envelopeKey: null,
  hasKey: false,
  setPassphrase: async () => {},
  clearKey: () => {},
  loading: false,
  folderId: null,
  state: "loading",
  needsSetup: false
});

export function VaultKeyProvider({ children }: { children: ReactNode }) {
  const utils = trpc.useUtils();
  const saveEnvelope = trpc.vault.saveEnvelope.useMutation();
  const [derivedKey, setDerivedKey] = useState<CryptoKey | null>(null);
  const [envelopeKey, setEnvelopeKey] = useState<CryptoKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);

  const statusQuery = trpc.vault.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: 1
  });

  // Immer die FolderId aus dem Status halten – auch wenn der Vault gesperrt ist.
  useEffect(() => {
    if (statusQuery.data?.folderId) {
      setFolderId(statusQuery.data.folderId);
    }
  }, [statusQuery.data?.folderId]);

  const setPassphrase = async (pw: string) => {
    if (!pw.trim()) return;
    setLoading(true);
    try {
      const status = (await utils.vault.status.fetch()) ?? statusQuery.data;
      const hasEnvelope = status?.hasEnvelope && status.envelopeCipher && status.envelopeIv;
      setFolderId(status?.folderId ?? null);

      const serverSalt = status?.envelopeSalt ? b64decode(status.envelopeSalt) : null;
      const localSalt =
        typeof window !== "undefined"
          ? (() => {
              const stored =
                localStorage.getItem(SALT_STORAGE_KEY) || localStorage.getItem(LEGACY_SALT_STORAGE_KEY);
              return stored ? b64decode(stored) : null;
            })()
          : null;
      const saltBytes = serverSalt ?? localSalt ?? crypto.getRandomValues(new Uint8Array(16));
      if (typeof window !== "undefined" && !localSalt) {
        localStorage.setItem(SALT_STORAGE_KEY, b64encode(saltBytes));
      }

      const k = await deriveVaultKey(pw, saltBytes);
      setDerivedKey(k);

      let rawEnvelope: Uint8Array;
      if (hasEnvelope) {
        try {
          rawEnvelope = await unwrapEnvelopeKey(status!.envelopeCipher!, status!.envelopeIv!, k);
        } catch (err) {
          setEnvelopeKey(null);
          setDerivedKey(null);
          throw new Error("Passphrase falsch oder Salt stimmt nicht (Vault-Key konnte nicht geöffnet werden).");
        }
        if (!status?.envelopeSalt) {
          // persist salt for legacy records
          await saveEnvelope.mutateAsync({
            cipher: status!.envelopeCipher!,
            iv: status!.envelopeIv!,
            salt: b64encode(saltBytes)
          });
        }
      } else {
        rawEnvelope = generateEnvelopeKey();
        const wrapped = await wrapEnvelopeKey(rawEnvelope, k);
        await saveEnvelope.mutateAsync({ cipher: wrapped.cipher, iv: wrapped.iv, salt: b64encode(saltBytes) });
      }

      const imported = await importEnvelopeKey(rawEnvelope);
      setEnvelopeKey(imported);
      await statusQuery.refetch();
    } finally {
      setLoading(false);
    }
  };

  const clearKey = () => {
    setEnvelopeKey(null);
    setDerivedKey(null);
  };

  return (
    <VaultContext.Provider
      value={{
        envelopeKey,
        hasKey: !!envelopeKey,
        setPassphrase,
        clearKey,
        loading,
        folderId,
        state: statusQuery.isLoading
          ? "loading"
          : !statusQuery.data?.hasEnvelope
            ? "setup"
            : envelopeKey
              ? "unlocked"
              : "locked",
        needsSetup: !statusQuery.data?.hasEnvelope
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export const useVaultKey = () => useContext(VaultContext);
