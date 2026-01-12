/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRightSidebar } from "@/lib/sidebar-context";

export function RightSidebar() {
    const { content, isOpen } = useRightSidebar();

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.aside
                    initial={{ x: "100%", opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: "100%", opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="fixed right-0 top-14 bottom-0 w-80 border-l border-slate-200 bg-white/85 shadow-xl p-4 overflow-y-auto backdrop-blur-md z-20 dark:border-slate-800 dark:bg-slate-950/60"
                >
                    {content}
                </motion.aside>
            )}
        </AnimatePresence>
    );
}
