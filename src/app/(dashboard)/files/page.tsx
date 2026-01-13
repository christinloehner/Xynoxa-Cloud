/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { useFilesQuery, FileItem, SortConfig } from "./use-files-query";
import { FileList } from "./components/file-list";
import { FileGrid } from "./components/file-grid";
import { FileDetails, BulkDetails } from "./components/file-details";
import { useRightSidebar } from "@/lib/sidebar-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LayoutGrid, List as ListIcon, FolderPlus, ArrowLeft, Loader2, UploadCloud, ShieldCheck, ShieldAlert, Trash2, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useVaultKey } from "@/lib/vault-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import clsx from "clsx";

import { FileViewer } from "./components/file-viewer";
import { RenameDialog } from "@/components/modals/rename-dialog";
import { MoveCopyDialog } from "@/components/modals/move-copy-dialog";
import { ShareDialog } from "@/components/share/share-dialog";
import { UploadWindow } from "@/components/upload/upload-window";
import { VersionsDrawer } from "./components/versions-drawer";
import { VsCodeFrame } from "./components/vscode-frame";
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
import { useSearchParams, useRouter } from "next/navigation";

export default function FilesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [currentFolder, setCurrentFolder] = useState<string | null>(() => searchParams.get("folder"));
  const [viewTrash, setViewTrash] = useState<boolean>(() => searchParams.get("trash") === "1");

  // Sorting State with persistence
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("files-sort-config");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) { }
      }
    }
    return { key: "name", direction: "asc" };
  });

  // Persist on change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("files-sort-config", JSON.stringify(sortConfig));
    }
  }, [sortConfig]);

  const handleSort = (key: SortConfig["key"]) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const { items, isLoading } = useFilesQuery({ currentFolder, sortConfig, trashed: viewTrash });
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { setRightSidebar } = useRightSidebar();
  const { push } = useToast();
  const utils = trpc.useUtils();

  const [viewingFile, setViewingFile] = useState<FileItem | null>(null);
  const [versionsFile, setVersionsFile] = useState<FileItem | null>(null);
  const [vsCodeUrl, setVsCodeUrl] = useState<string | null>(null);
  const [vsCodeLoading, setVsCodeLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const breadcrumb = trpc.folders.breadcrumb.useQuery(
    { id: currentFolder as string },
    { enabled: !!currentFolder && !viewTrash }
  );

  // Folder/Datei aus URL öffnen (Deep-Link)
  // URL → State Sync: nur reagieren, wenn sich die URL ändert.
  // currentFolder darf hier NICHT in den Dependencies stehen, sonst überschreibt die URL
  // eine Navigation per Doppelklick sofort wieder (Regression).
  useEffect(() => {
    const folder = searchParams.get("folder");
    const trash = searchParams.get("trash") === "1";
    if (trash !== viewTrash) {
      setViewTrash(trash);
    }
    if (trash && currentFolder) {
      setCurrentFolder(null);
      return;
    }
    if (folder !== (currentFolder || null)) {
      setCurrentFolder(folder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const fileId = searchParams.get("file");
    if (!fileId || !items.length) return;
    const match = items.find((i) => i.kind === "file" && i.id === fileId);
    if (match) {
      setViewingFile(match);
      setSelectedIds(new Set([fileId]));
    }
  }, [searchParams, items]);

  const refreshFiles = async () => {
    const folderId = currentFolder ?? null;
    if (viewTrash) {
      await utils.files.listDeleted.invalidate();
      await utils.files.listDeleted.refetch();
    } else {
      await Promise.all([
        utils.files.list.invalidate({ folderId }),
        utils.folders.list.invalidate({ parentId: folderId }),
        currentFolder ? utils.folders.breadcrumb.invalidate({ id: currentFolder }) : Promise.resolve(),
        utils.files.list.refetch({ folderId }),
        utils.folders.list.refetch({ parentId: folderId })
      ]);
    }
  };

  // Actions
  const createFolder = trpc.folders.create.useMutation({ 
    onSuccess: () => refreshFiles(),
    onError: (err) => push({ title: "Fehler beim Erstellen", description: err.message, tone: "error" })
  });
  const [newFolderName, setNewFolderName] = useState("");

  // Dialog States
  const [renameItem, setRenameItem] = useState<FileItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<FileItem | null>(null);
  const [moveCopyItem, setMoveCopyItem] = useState<{ item: FileItem; mode: "move" | "copy" } | null>(null);
  const [shareItem, setShareItem] = useState<FileItem | null>(null);

  // Mutations
  const renameFile = trpc.files.rename.useMutation({ 
    onSuccess: () => { refreshFiles(); push({ title: "Umbenannt", tone: "success" }); },
    onError: (err) => push({ title: "Fehler", description: err.message, tone: "error" })
  });
  const renameFolder = trpc.folders.rename.useMutation({ 
    onSuccess: () => { refreshFiles(); push({ title: "Umbenannt", tone: "success" }); },
    onError: (err) => push({ title: "Fehler", description: err.message, tone: "error" })
  });

  const softDeleteFile = trpc.files.softDelete.useMutation({ 
    onSuccess: () => { refreshFiles(); push({ title: "In Papierkorb verschoben", tone: "success" }); },
    onError: (err) => push({ title: "Fehler beim Löschen", description: err.message, tone: "error" })
  });
  const restoreFile = trpc.files.restore.useMutation({ 
    onSuccess: () => { refreshFiles(); push({ title: "Wiederhergestellt", tone: "success" }); },
    onError: (err) => push({ title: "Fehler", description: err.message, tone: "error" })
  });
  const deleteFile = trpc.files.permanentDelete.useMutation({ 
    onSuccess: () => { refreshFiles(); push({ title: "Endgültig gelöscht", tone: "success" }); },
    onError: (err) => push({ title: "Fehler beim Löschen", description: err.message, tone: "error" })
  });
  const deleteFolder = trpc.folders.delete.useMutation({
    onSuccess: () => { refreshFiles(); push({ title: "Ordner gelöscht", tone: "success" }); },
    onError: (err) => push({ title: "Fehler", description: err.message, tone: "error" })
  });

  const moveFile = trpc.files.move.useMutation({ 
    onSuccess: () => { refreshFiles(); push({ title: "Verschoben", tone: "success" }); },
    onError: (err) => push({ title: "Fehler beim Verschieben", description: err.message, tone: "error" })
  });
  const moveFolder = trpc.folders.move.useMutation({ 
    onSuccess: () => { refreshFiles(); push({ title: "Verschoben", tone: "success" }); },
    onError: (err) => push({ title: "Fehler beim Verschieben", description: err.message, tone: "error" })
  });

  const copyFile = trpc.files.copy.useMutation({ 
    onSuccess: () => { refreshFiles(); push({ title: "Kopiert", tone: "success" }); },
    onError: (err) => push({ title: "Fehler beim Kopieren", description: err.message, tone: "error" })
  });

  const toggleVault = trpc.files.toggleVault.useMutation({
    onSuccess: () => { refreshFiles(); push({ title: "Vault Status geändert", tone: "success" }); },
    onError: (err) => push({ title: "Fehler", description: err.message, tone: "error" })
  });

  const imageItems = useMemo(() => {
    const isImage = (it: FileItem) => {
      const ext = (it.name.split(".").pop() || "").toLowerCase();
      const mime = (it.mime || "").toLowerCase();
      return mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "tif", "tiff", "heic", "heif"].includes(ext);
    };
    return items.filter(i => i.kind === "file" && isImage(i));
  }, [items]);
  const currentImageIndex = useMemo(
    () => (viewingFile ? imageItems.findIndex(i => i.id === viewingFile.id) : -1),
    [imageItems, viewingFile]
  );

  // View mode persistieren (Grid/List)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("files-view-mode");
    if (saved === "grid" || saved === "list") {
      setViewMode(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("files-view-mode", viewMode);
  }, [viewMode]);


  const handleRename = (newName: string) => {
    if (!renameItem) return;
    if (renameItem.kind === "folder") {
      renameFolder.mutate({ id: renameItem.id, name: newName });
    } else {
      renameFile.mutate({ id: renameItem.id, name: newName });
    }
    setRenameItem(null);
  };

  const handleDelete = async () => {
    // If specific item marked for delete, use it. Otherwise use selection.
    const idsToDelete = deleteItem ? [deleteItem.id] : Array.from(selectedIds);
    if (idsToDelete.length === 0) return;

    const itemsToProcess = items.filter(i => idsToDelete.includes(i.id));
    const hasLockedVault = itemsToProcess.some(i => i.kind === "file" && i.vault && !hasKey);
    if (hasLockedVault) {
      setVaultDialogOpen(true);
      push({ title: "Vault gesperrt", description: "Zum Löschen von Vault-Dateien bitte zuerst die Passphrase eingeben.", tone: "error" });
      return;
    }

    // First clear UI state immediately
    setDeleteItem(null);
    setSelectedIds(new Set());

    // Then execute the mutations sequentially to avoid state conflicts
    for (const id of idsToDelete) {
      const item = items.find(i => i.id === id);
      if (!item) continue;
      if (item.kind === "folder") {
        deleteFolder.mutate({ id });
      } else {
        if (viewTrash) {
          deleteFile.mutate({ fileId: id });
        } else {
          softDeleteFile.mutate({ fileId: id });
        }
      }
    }
  };

  const handleOpenVersions = useCallback((item: FileItem) => {
    if (item.kind !== "file") return;
    setVersionsFile(item);
  }, []);

  // Close file viewer and clean URL
  const handleCloseViewer = () => {
    setViewingFile(null);
    // Remove 'file' query parameter from URL
    const params = new URLSearchParams(searchParams.toString());
    params.delete("file");
    const newUrl = params.toString() ? `/files?${params.toString()}` : '/files';
    router.replace(newUrl as any, { scroll: false });
  };

  const handleMoveCopy = (targetFolderId: string | null) => {
    // If specific item targeted (e.g. from context menu context), use it. Else selection.
    // Currently moveCopyItem holds the "context" item. But if we are in bulk mode?
    // We should treat moveCopyItem as the "initiator" but if selectedIds has it, move all selected?
    // Let's assume if selecting multiple, user triggers "Move Selected".
    const idsToMove = moveCopyItem ? [moveCopyItem.item.id] : Array.from(selectedIds);
    // Logic collision: if I select 5 items, right click 1 (not in selection), what happens?
    // Windows: select new item, deselect others.
    // Here we probably just stick to "selectedIds" if moveCopyItem is inside selection, or if explicitly "Move Selected" button clicked.
    // For now, let's behave: IF moveCopyItem is set (from dialog trigger), check if it's in selection? 
    // Actually, `moveCopyItem` comes from `setMoveCopyItem` which comes from Sidebar (single) or... ? 
    // If I add a Bulk Bar, it will trigger `setMoveCopyItem` with maybe a dummy item or we customize the state.

    // Simplification: `handleMoveCopy` is called *by the Dialog* `onConfirm`.
    // The Dialog is open if `moveCopyItem` is not null.
    // So we need to ensure when we open the dialog for bulk, we set `moveCopyItem` (maybe with first item) but handle bulk executing.

    // Better: Allow `moveCopyItem` to be null if bulk?
    // Dialog requires `open={!!moveCopyItem}`.
    // I should probably change `moveCopyItem` to `moveCopyState`: `{ mode: 'move'|'copy', items: FileItem[] }`.

    // Modifying `moveCopyItem` state definition is tricky with replace_file.
    // Keep it simple: If `selectedIds` has > 0, we move ALL selected items, regardless of `moveCopyItem` (which might just be the one we clicked on).
    // But safer: Only move selectedIds.

    const itemsToProcess = selectedIds.size > 0
      ? items.filter(i => selectedIds.has(i.id))
      : (moveCopyItem ? [moveCopyItem.item] : []);

    const { mode } = moveCopyItem || { mode: "move" }; // Default to move if state lost?

    itemsToProcess.forEach(item => {
      if (mode === "move") {
        if (item.kind === "folder") {
          moveFolder.mutate({ id: item.id, parentId: targetFolderId });
        } else {
          moveFile.mutate({ id: item.id, folderId: targetFolderId });
        }
      } else {
        if (item.kind === "folder") {
          // skip copy folder for now
        } else {
          copyFile.mutate({ id: item.id, folderId: targetFolderId });
        }
      }
    });

    setMoveCopyItem(null);
    setSelectedIds(new Set());
  };

  const textExtensions = ["txt", "md", "js", "ts", "tsx", "jsx", "json", "css", "scss", "html", "xml", "php", "py", "rb", "go", "rs", "c", "cpp", "java", "sh", "yml", "yaml", "toml"];
  const isTextLikeFile = (file: FileItem) => {
    const mime = (file.mime || "").toLowerCase();
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const isKnownTextMime =
      mime.startsWith("text/") ||
      mime.includes("json") ||
      mime.includes("javascript") ||
      mime.includes("xml") ||
      mime === "application/x-sh";
    return isKnownTextMime || textExtensions.includes(ext);
  };

  const openInVsCode = useCallback(async (file: FileItem) => {
    try {
      setVsCodeLoading(true);
      const response = await fetch("/api/vscode/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `VS Code konnte nicht geöffnet werden (${response.status})`);
      }

      const data = await response.json();
      if (!data.url) {
        throw new Error("Ungültige Antwort vom VS Code Service.");
      }

      setVsCodeUrl(data.url);
      push({ title: "VS Code", description: "Editor wird im Fenster geladen.", tone: "success" });
    } catch (error: any) {
      push({ title: "Fehler", description: error.message || "VS Code konnte nicht gestartet werden.", tone: "error" });
      // Fallback: normale Vorschau öffnen
      setViewingFile(file);
    }
    finally {
      setVsCodeLoading(false);
    }
  }, [push]);


  const handleDownload = useCallback((item: FileItem) => {
    if (item.kind === "folder") {
      push({ title: "Info", description: "Bitte erst einen Share-Link für den Ordner erstellen und dort herunterladen.", tone: "default" });
      return;
    }
    window.open(`/api/files/download?id=${item.id}`, '_blank');
  }, [push]);


  // Vault
  const { hasKey, setPassphrase: activateVault, loading: vaultLoading } = useVaultKey();
  const [vaultDialogOpen, setVaultDialogOpen] = useState(false);
  const [vaultPassphrase, setVaultPassphrase] = useState("");

  const handleVaultUnlock = async () => {
    if (!vaultPassphrase.trim()) return;
    try {
      await activateVault(vaultPassphrase);
      setVaultDialogOpen(false);
      setVaultPassphrase("");
      push({ title: "Vault entsperrt", tone: "success" });
    } catch (e: any) {
      push({ title: "Fehler", description: e.message, tone: "error" });
    }
  };

  const handleToggleVault = useCallback((item: FileItem) => {
    if (item.kind === "folder") {
      push({ title: "Info", description: "Ordner Vault noch nicht unterstützt", tone: "default" });
      return;
    }

    // If trying to enable vault
    if (!item.vault) {
      if (!hasKey) {
        setVaultDialogOpen(true);
        push({ title: "Vault gesperrt", description: "Bitte entsperren Sie zuerst den Vault.", tone: "error" });
        return;
      }
      push({ title: "Info", description: "Bestehende Dateien können nicht nachträglich verschlüsselt werden. Bitte laden Sie die Datei erneut im Vault-Modus hoch.", tone: "default" });
      return;
    }

    // Disabling vault?
    toggleVault.mutate({ id: item.id, vault: !item.vault });
  }, [hasKey, push, toggleVault]);

  const [lastInteractedId, setLastInteractedId] = useState<string | null>(null);

  const handleToggleSelect = (id: string, multi: boolean, range: boolean) => {
    let newSet = new Set(multi ? selectedIds : new Set<string>());

    if (range && lastInteractedId && items.length > 0) {
      const lastIndex = items.findIndex(i => i.id === lastInteractedId);
      const currentIndex = items.findIndex(i => i.id === id);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);

        // If holding ctrl (multi), we add the range. If not, we might replace? 
        // Window Explorer: Shift+Click selects range. If previously selected, it extends?
        // Usually Shift resets other selections unless Ctrl is also held.
        // For simplicity: Shift+Click (without Ctrl) selects range from anchor to current, clearing others?
        // User asked: "Shift+Linksklick sollen mehrere Dateien ... markiert werden können, genau so wie in einem Windows File Explorer."
        // Windows:
        // Click A.
        // Shift+Click C -> Selects A, B, C. (Clears others if any, unless Ctrl held?)
        // Let's implement: If Range -> Select inclusive range. If Multi (Ctrl) -> keep existing.

        if (!multi) {
          newSet = new Set<string>();
        }

        for (let i = start; i <= end; i++) {
          newSet.add(items[i].id);
        }
      }
    } else {
      // Normal toggle or single select
      if (multi) {
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
      } else {
        // If clicking single item without modifier, usually selects just that one
        // But check if already selected?
        // Windows: Click on selected -> deselects others, selects this one. 
        // Click on unselected -> selects this one.
        newSet = new Set([id]);
      }
    }

    setSelectedIds(newSet);
    setLastInteractedId(id);
  };

  const handleNavigate = (id: string, itemArg?: FileItem) => {
    const item = itemArg ?? items.find(i => i.id === id);
    if (!item) return;
    if (item.kind === "folder") {
      setCurrentFolder(id);
      setSelectedIds(new Set());
      handleCloseViewer();
      return;
    }
    // File
    if (item.vault && !hasKey) {
      setVaultDialogOpen(true);
      push({ title: "Vault gesperrt", description: "Bitte Passphrase eingeben, um verschlüsselte Dateien zu öffnen.", tone: "error" });
      return;
    }
    if (isTextLikeFile(item)) {
      void openInVsCode(item);
      return;
    }
    setViewingFile(item);
  };

  const handleBack = () => {
    if (viewTrash) return;
    if (viewingFile) {
      handleCloseViewer();
      return;
    }

    if (!breadcrumb.data || breadcrumb.data.length === 0) return;
    if (breadcrumb.data.length === 1) {
      setCurrentFolder(null);
    } else {
      setCurrentFolder(breadcrumb.data[breadcrumb.data.length - 2].id);
    }
  };

  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmBulkPermanentDelete, setConfirmBulkPermanentDelete] = useState(false);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);

  useEffect(() => {
    if (viewTrash) {
      setRightSidebar(null);
      return;
    }

    if (viewingFile) {
      setRightSidebar(null);
      return;
    }

    if (selectedIds.size === 1) {
      const selectedItem = items.find(i => selectedIds.has(i.id));
      if (selectedItem) {
        setRightSidebar(
          <FileDetails
            item={selectedItem}
            onClose={() => setSelectedIds(new Set())}
            onDownload={handleDownload}
            onRename={(item) => setRenameItem(item)}
            onShare={(item) => setShareItem(item)}
            onDelete={(item) => setDeleteItem(item)}
            onToggleVault={handleToggleVault}
            onCopy={(item) => setMoveCopyItem({ item, mode: "copy" })}
            onMove={(item) => setMoveCopyItem({ item, mode: "move" })}
            onVersions={(item) => handleOpenVersions(item)}
            // VS Code Editor Modal
            onOpenInEditor={(item) => openInVsCode(item)}
          />
        );
      }
    } else if (selectedIds.size > 1) {
      setRightSidebar(
        <BulkDetails
          count={selectedIds.size}
          onClose={() => setSelectedIds(new Set())}
          onDelete={() => setConfirmBulkDelete(true)}
          onMove={() => {
            const first = items.find(i => selectedIds.has(i.id));
            if (first) setMoveCopyItem({ item: first, mode: 'move' });
          }}
          onCopy={() => {
            const first = items.find(i => selectedIds.has(i.id));
            if (first) setMoveCopyItem({ item: first, mode: 'copy' });
          }}
        />
      );
    } else {
      setRightSidebar(null);
    }
  }, [selectedIds, items, setRightSidebar, viewingFile, handleDownload, handleOpenVersions, handleToggleVault, openInVsCode, viewTrash]);

  useEffect(() => {
    return () => setRightSidebar(null);
  }, [setRightSidebar]);


  if (viewingFile) {
    return (
      <div className="flex flex-col h-full gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleCloseViewer} className="h-8 w-8 text-slate-400 hover:text-slate-100">
            <ArrowLeft size={18} />
          </Button>
          <h1 className="text-lg font-semibold text-slate-100">
            Dateivorschau
          </h1>
        </div>
        <div className="flex-1 min-h-0">
          <FileViewer
            file={viewingFile}
            onClose={handleCloseViewer}
            onPrev={() => {
              if (currentImageIndex > 0) setViewingFile(imageItems[currentImageIndex - 1]);
            }}
            onNext={() => {
              if (currentImageIndex >= 0 && currentImageIndex < imageItems.length - 1) {
                setViewingFile(imageItems[currentImageIndex + 1]);
              }
            }}
            canPrev={currentImageIndex > 0}
            canNext={currentImageIndex >= 0 && currentImageIndex < imageItems.length - 1}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sticky top-0 z-10 backdrop-blur-md">

        {/* Left: Navigation / Breadcrumbs */}
        <div className="flex items-center gap-4">
          {currentFolder && !viewTrash && (
            <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8 text-slate-400 hover:text-slate-100">
              <ArrowLeft size={18} />
            </Button>
          )}
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold text-slate-100">
              {viewTrash ? "Papierkorb" : (currentFolder && breadcrumb.data ? breadcrumb.data[breadcrumb.data.length - 1]?.name : "Meine Dateien")}
            </h1>
            {!viewTrash && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span>Root</span>
                {breadcrumb.data?.map(b => (
                  <span key={b.id}> / {b.name}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions & View Toggle */}
        {/* Right: Actions & View Toggle */}
        <div className="flex items-center gap-3">
          <Button
            variant={viewTrash ? "default" : "ghost"}
            size="sm"
            className={clsx(viewTrash ? "bg-amber-600 hover:bg-amber-500 text-white" : "text-slate-400 hover:text-slate-200")}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              if (viewTrash) {
                params.delete("trash");
              } else {
                params.set("trash", "1");
                params.delete("folder");
              }
              const newUrl = params.toString() ? `/files?${params.toString()}` : "/files";
              router.replace(newUrl as any, { scroll: false });
              setSelectedIds(new Set());
            }}
          >
            <Trash2 size={16} className="mr-2" />
            Papierkorb
          </Button>
          {/* Vault Toggle */}
          <Button
            variant={hasKey ? "ghost" : "outline"}
            size="sm"
            className={clsx(hasKey ? "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30" : "text-amber-400 border-amber-900/50 hover:bg-amber-950/30")}
            onClick={() => setVaultDialogOpen(true)}
          >
            {hasKey ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
            {hasKey ? <span className="ml-2 hidden sm:inline">Entsperrt</span> : <span className="ml-2 hidden sm:inline">Gesperrt</span>}
          </Button>

          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950/50 p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={clsx("p-1.5 rounded transition", viewMode === "grid" ? "bg-slate-800 text-cyan-400" : "text-slate-500 hover:text-slate-300")}
            >
              <LayoutGrid size={16} />
            </button>
            <div className="w-px h-4 bg-slate-800 mx-1" />
            <button
              onClick={() => setViewMode("list")}
              className={clsx("p-1.5 rounded transition", viewMode === "list" ? "bg-slate-800 text-cyan-400" : "text-slate-500 hover:text-slate-300")}
            >
              <ListIcon size={16} />
            </button>
          </div>

          <div className="h-6 w-px bg-slate-800" />

          {!viewTrash && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Neuer Ordner..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="h-9 w-32 bg-slate-950/50 border-slate-800 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFolderName.trim()) {
                    createFolder.mutate({ name: newFolderName, parentId: currentFolder });
                    setNewFolderName("");
                  }
                }}
              />
              <Button size="sm" variant="secondary" onClick={() => {
                if (newFolderName.trim()) {
                  createFolder.mutate({ name: newFolderName, parentId: currentFolder });
                  setNewFolderName("");
                }
              }}>
                <FolderPlus size={16} />
              </Button>
            </div>
          )}

          {viewTrash ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={selectedIds.size === 0}
                onClick={() => {
                  Array.from(selectedIds).forEach((id) => restoreFile.mutate({ fileId: id }));
                  setSelectedIds(new Set());
                }}
              >
                <RotateCcw size={16} className="mr-2" />
                Wiederherstellen
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={selectedIds.size === 0}
                onClick={() => setConfirmBulkPermanentDelete(true)}
              >
                Endgültig löschen
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={items.length === 0}
                onClick={() => setConfirmEmptyTrash(true)}
              >
                Papierkorb leeren
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="default"
              className="bg-cyan-600 hover:bg-cyan-500 text-white"
              onClick={() => setUploadOpen(true)}
            >
              <UploadCloud size={16} className="mr-2" /> Upload
            </Button>
          )}
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="flex items-center justify-center flex-1 py-20">
          <Loader2 className="animate-spin text-cyan-500" size={32} />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-20 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/20">
          <div className="p-4 rounded-full bg-slate-900 mb-4">
            <UploadCloud size={32} className="text-slate-500" />
          </div>
          <p className="text-slate-400 font-medium">Dieser Ordner ist leer.</p>
          <p className="text-sm text-slate-600 mb-4">Ziehe Dateien hierher oder nutze den Upload Button.</p>
          <Button onClick={() => setUploadOpen(true)} variant="outline">
            Upload starten
          </Button>
        </div>
      ) : (
        <div className="pb-10" onClick={() => setSelectedIds(new Set())}>
          {viewMode === "grid" ? (
            <FileGrid
              items={items}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onNavigate={handleNavigate}
            />
          ) : (
            <FileList
              items={items}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onNavigate={handleNavigate}
              sortConfig={sortConfig}
              onSort={handleSort}
            />
          )}
        </div>
      )}

      {/* Dialogs */}
      <RenameDialog
        open={!!renameItem}
        onOpenChange={(open) => !open && setRenameItem(null)}
        initialName={renameItem?.name || ""}
        onConfirm={handleRename}
      />

      <MoveCopyDialog
        open={!!moveCopyItem}
        onOpenChange={(open) => !open && setMoveCopyItem(null)}
        mode={moveCopyItem?.mode || "move"}
        onConfirm={handleMoveCopy}
      />

      <UploadWindow
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploadComplete={() => { refreshFiles(); push({ title: "Upload erfolgreich", tone: "success" }); }}
        currentFolderId={currentFolder}
      />

      <AlertDialog open={!!deleteItem} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bist du sicher?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du &quot;{deleteItem?.name}&quot; wirklich {viewTrash ? "endgültig löschen" : "in den Papierkorb verschieben"}?
              {deleteItem?.kind === "folder" && " Alle enthaltenen Dateien werden ebenfalls gelöscht."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {viewTrash ? "Endgültig löschen" : "In Papierkorb"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bist du sicher?</AlertDialogTitle>
          <AlertDialogDescription>
            Möchtest du {selectedIds.size} Elemente wirklich {viewTrash ? "endgültig löschen" : "in den Papierkorb verschieben"}?
          </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              handleDelete();
              setConfirmBulkDelete(false);
            }} className="bg-red-600 hover:bg-red-700">{viewTrash ? "Endgültig löschen" : "In Papierkorb"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmBulkPermanentDelete} onOpenChange={setConfirmBulkPermanentDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bist du sicher?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du {selectedIds.size} Elemente wirklich endgültig löschen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const idsToDelete = Array.from(selectedIds);
              setSelectedIds(new Set());
              setConfirmBulkPermanentDelete(false);
              for (const id of idsToDelete) {
                deleteFile.mutate({ fileId: id });
              }
            }} className="bg-red-600 hover:bg-red-700">Endgültig löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmEmptyTrash} onOpenChange={setConfirmEmptyTrash}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Papierkorb leeren?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du alle Dateien im Papierkorb endgültig löschen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const filesToDelete = items.filter(item => item.kind === "file");
              setConfirmEmptyTrash(false);
              for (const item of filesToDelete) {
                deleteFile.mutate({ fileId: item.id });
              }
            }} className="bg-red-600 hover:bg-red-700">
              Papierkorb leeren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={vaultDialogOpen} onOpenChange={setVaultDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vault entsperren</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-400">
              Geben Sie Ihre Vault-Passphrase ein, um auf verschlüsselte Dateien zuzugreifen oder neue hochzuladen.
            </p>
            <Input
              type="password"
              placeholder="Passphrase"
              value={vaultPassphrase}
              onChange={(e) => setVaultPassphrase(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVaultUnlock()}
            />
            <Button onClick={handleVaultUnlock} disabled={vaultLoading} className="w-full">
              {vaultLoading ? "Entsperren..." : "Vault entsperren"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {shareItem && (
        <ShareDialog
          open={!!shareItem}
          onOpenChange={(o) => { if (!o) setShareItem(null); }}
          entityId={shareItem.id}
          entityType={shareItem.kind === "folder" ? "folder" : "file"}
          title={shareItem.name}
        />
      )}
      <VersionsDrawer file={versionsFile} open={!!versionsFile} onClose={() => setVersionsFile(null)} />
      <VsCodeFrame url={vsCodeUrl} open={!!vsCodeUrl} loading={vsCodeLoading} onClose={() => setVsCodeUrl(null)} />
    </div>
  );
}
