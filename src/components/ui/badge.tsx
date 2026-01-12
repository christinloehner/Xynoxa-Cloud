/*
 * Copyright (C) 2025 Christin Löhner
 */

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 dark:border-slate-800 dark:focus:ring-slate-300",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-slate-900 text-slate-50 hover:bg-slate-900/80 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-50/80",
        secondary:
          "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-800/80",
        destructive:
          "border-transparent bg-red-500 text-slate-50 hover:bg-red-500/80 dark:bg-red-900 dark:text-slate-50 dark:hover:bg-red-900/80",
        outline: "text-slate-950 dark:text-slate-50",
        // Legacy "tone" support mapped to variants
        cyan: "border-transparent bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border-cyan-500/20 border",
        emerald: "border-transparent bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20 border",
        amber: "border-transparent bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border-amber-500/20 border",
        slate: "border-transparent bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 border-slate-500/20 border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> {
  tone?: "cyan" | "emerald" | "amber" | "slate"; // Legacy prop
}

function Badge({ className, variant, tone, ...props }: BadgeProps) {
  // If tone is provided, override variant
  const finalVariant = tone ? (tone as any) : variant;

  return (
    <div className={cn(badgeVariants({ variant: finalVariant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
