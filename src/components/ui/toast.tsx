/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { create } from "zustand";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Toast = { id: string; title: string; description?: string; tone?: "default" | "success" | "error" };

type ToastState = {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => void;
  remove: (id: string) => void;
};

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }]
    })),
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}));

export function useToast() {
  return useToastStore();
}

export function ToastViewport() {
  const { toasts, remove } = useToastStore();

  useEffect(() => {
    const timers = toasts.map((t) =>
      setTimeout(() => remove(t.id), t.tone === "error" ? 5000 : 3000)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, remove]);

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            layout
            className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${
              toast.tone === "success"
                ? "border-emerald-500/50 bg-emerald-900/30 text-emerald-50"
                : toast.tone === "error"
                  ? "border-rose-500/50 bg-rose-900/30 text-rose-50"
                  : "border-slate-700 bg-slate-900/80 text-slate-100"
            }`}
          >
            <div className="font-semibold">{toast.title}</div>
            {toast.description && <div className="text-xs text-slate-200">{toast.description}</div>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
