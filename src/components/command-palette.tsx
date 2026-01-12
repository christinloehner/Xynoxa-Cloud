/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";

type Command = {
  label: string;
  shortcut?: string;
  href?: string;
  action?: () => void;
  category?: string;
};

const COMMANDS: Command[] = [
  // Navigation
  { label: "Zu Files springen", shortcut: "F", href: "/files", category: "Navigation" },
  { label: "Zu Calendar springen", shortcut: "C", href: "/calendar", category: "Navigation" },
  { label: "Globale Suche öffnen", shortcut: "S", href: "/search", category: "Navigation" },
  { label: "Vault öffnen", shortcut: "V", href: "/vault", category: "Navigation" },
  { label: "Settings öffnen", href: "/settings", category: "Navigation" },

  // Actions - werden dynamisch hinzugefügt basierend auf aktuellem Kontext
  { label: "Neues Event erstellen", href: "/calendar?action=newEvent", category: "Aktionen" },
  { label: "Neue Task erstellen", href: "/calendar?action=newTask", category: "Aktionen" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((x) => !x);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  // Clamp selected index to valid range
  const validIndex = Math.min(selectedIndex, Math.max(0, results.length - 1));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = results[validIndex];
      if (selected?.href) {
        window.location.href = selected.href;
      }
      setOpen(false);
    }
  };

  // Reset index when query changes (side effect in onChange is better than useEffect)
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSelectedIndex(0);
  };

  return (
    <>
      {/* Visible Trigger removed, invoked via Ctrl+K */}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 p-4 backdrop-blur"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Command Palette"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: -20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              role="document"
            >
              <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
                <input
                  autoFocus
                  value={query}
                  onChange={handleQueryChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Suchen oder Befehl ausführen…"
                  className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  aria-label="Befehlssuche"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="command-list"
                  aria-activedescendant={results[validIndex] ? `cmd-${validIndex}` : undefined}
                />
                <kbd className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-400" aria-label="Escape-Taste zum Schließen">
                  Esc
                </kbd>
              </div>
              <div className="max-h-80 overflow-y-auto px-2 py-2" id="command-list" role="listbox">
                {results.length === 0 && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="px-3 py-2 text-sm text-slate-500"
                    role="status"
                  >
                    Keine Befehle gefunden.
                  </motion.p>
                )}
                {results.map((cmd, index) => {
                  const showCategory = index === 0 || results[index - 1]?.category !== cmd.category;
                  return (
                    <div key={cmd.label}>
                      {showCategory && cmd.category && (
                        <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500" role="presentation">
                          {cmd.category}
                        </div>
                      )}
                      <motion.a
                        id={`cmd-${index}`}
                        href={cmd.href}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.03, duration: 0.15 }}
                        whileHover={{ x: 4, backgroundColor: "rgba(30, 41, 59, 0.8)" }}
                        whileTap={{ scale: 0.98 }}
                        className={clsx(
                          "flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-100 transition",
                          validIndex === index && "bg-slate-800/80 ring-1 ring-xynoxa-cyan/50"
                        )}
                        onClick={() => setOpen(false)}
                        role="option"
                        aria-selected={validIndex === index}
                      >
                        <span>{cmd.label}</span>
                        {cmd.shortcut && (
                          <span className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-400" aria-label={`Tastenkürzel ${cmd.shortcut}`}>
                            {cmd.shortcut}
                          </span>
                        )}
                      </motion.a>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
