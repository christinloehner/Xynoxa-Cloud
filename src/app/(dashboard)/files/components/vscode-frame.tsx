/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VsCodeFrameProps {
  url: string | null;
  open: boolean;
  onClose: () => void;
  loading?: boolean;
}

export function VsCodeFrame({ url, open, onClose, loading }: VsCodeFrameProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 overflow-hidden bg-slate-950 border-slate-800">
        <DialogHeader className="px-4 py-3 border-b border-slate-800 flex flex-row items-center justify-between">
          <DialogTitle className="text-slate-100 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> VS Code
          </DialogTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>
        <div className="relative h-full">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 z-10">
              <div className="flex items-center gap-2 text-slate-200">
                <Loader2 className="h-5 w-5 animate-spin" /> Lädt Editor …
              </div>
            </div>
          )}
          {url ? (
            <iframe src={url} className="w-full h-full border-0" allow="clipboard-read; clipboard-write" />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400">Keine URL</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
