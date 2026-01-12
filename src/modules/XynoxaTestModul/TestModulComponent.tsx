/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

/**
 * Test Modul Component
 * 
 * Hauptkomponente des Test Moduls.
 * Zeigt wie Module mit dem Xynoxa Design-System integriert werden.
 */

import { TestTube, Check, Package, Code, Rocket } from "lucide-react";
import { motion } from "framer-motion";

export default function TestModulComponent() {
  const features = [
    {
      icon: Package,
      title: "Modulares System",
      description: "Einfache Integration neuer Funktionen über das Modul-System"
    },
    {
      icon: Code,
      title: "Type-Safe",
      description: "Vollständig typisierte Schnittstellen mit TypeScript"
    },
    {
      icon: Rocket,
      title: "Hot-Reload Ready",
      description: "Module können zur Laufzeit geladen und entladen werden"
    }
  ];

  const codeExample = `import { XynoxaModule } from "@/types/module";
import { MyIcon } from "lucide-react";

const myModule: XynoxaModule = {
  metadata: {
    id: "my-module",
    name: "My Module",
    version: "1.0.0",
    author: "Your Name"
  },
  navigation: [{
    id: "my-module-link",
    label: "My Module",
    href: "/my-module",
    icon: MyIcon
  }]
};

export default myModule;`;

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 p-3 shadow-lg">
            <TestTube className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent dark:from-slate-100 dark:to-slate-400">
              Test Modul
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Xynoxa Modul-System v1.0.0
            </p>
          </div>
        </div>
      </motion.div>

      {/* Success Message */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 dark:border-emerald-800 dark:bg-emerald-900/20"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-emerald-500 p-1">
            <Check className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
              Modul erfolgreich geladen! 🎉
            </h2>
            <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
              Das Test-Modul wurde erfolgreich in die Xynoxa Cloud Anwendung integriert. 
              Es nutzt das gleiche Design-System und Layout wie der Rest der Anwendung.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Features Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-8 grid gap-6 md:grid-cols-3"
      >
        {features.map((feature, index) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-200 bg-white/50 p-6 backdrop-blur-sm transition-all hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/50"
          >
            <div className="mb-4 inline-flex rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-600/10 p-3">
              <feature.icon className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {feature.title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {feature.description}
            </p>
          </div>
        ))}
      </motion.div>

      {/* Code Example */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="rounded-2xl border border-slate-200 bg-white/50 p-6 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/50"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
          Beispiel: Eigenes Modul erstellen
        </h2>
        <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm text-slate-100 dark:bg-slate-950">
          <code>{codeExample}</code>
        </pre>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          Module befinden sich im <code className="rounded bg-slate-200 px-2 py-1 dark:bg-slate-800">modules/</code> Verzeichnis 
          und folgen der Namenskonvention <code className="rounded bg-slate-200 px-2 py-1 dark:bg-slate-800">XynoxaModulName</code>.
        </p>
      </motion.div>

      {/* Module Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-8 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100/50 p-6 dark:border-slate-800 dark:from-slate-900/50 dark:to-slate-800/50"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
          Nächste Schritte
        </h2>
        <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
            <span>Notes als Modul auslagern</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
            <span>Bookmarks als Modul auslagern</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
            <span>Calendar als Modul auslagern</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
            <span>Settings-Integration für Module</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
            <span>Modul-Marketplace (optional)</span>
          </li>
        </ul>
      </motion.div>
    </div>
  );
}
