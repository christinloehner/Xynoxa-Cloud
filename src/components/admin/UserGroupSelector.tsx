/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";

export function UserGroupSelector({ user, allGroups, onGroupAdd, selectedGroups, onSelect, className }: { user?: any, allGroups?: any[], onGroupAdd?: (groupId: string) => void, selectedGroups?: string[], onSelect?: (groupId: string) => void, className?: string }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    // Filter groups: exclude ones already selected/in, and match search
    const groups = allGroups || [];
    const currentGroupIds = selectedGroups || user?.groups?.map((ug: any) => ug.id) || [];

    const availableGroups = groups.filter(g =>
        !currentGroupIds.includes(g.id) &&
        g.name.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (groupId: string) => {
        if (onSelect) onSelect(groupId);
        else if (onGroupAdd) onGroupAdd(groupId);
        setOpen(false);
        setSearch("");
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button className={className || "h-5 w-5 flex items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/50 transition-colors"}>
                    <Plus className="h-3 w-3" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="p-3 w-64 border-slate-800 bg-slate-950" side="right" align="start">
                <div className="space-y-2">
                    <Input
                        placeholder="Gruppe suchen..."
                        className="h-8 text-xs bg-slate-900 border-slate-800 focus:border-cyan-500/50"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                    />
                    <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {availableGroups.length === 0 ? (
                            <div className="text-xs text-slate-500 py-2 text-center">Keine Gruppen gefunden</div>
                        ) : (
                            availableGroups.map(g => (
                                <button
                                    key={g.id}
                                    onClick={() => handleSelect(g.id)}
                                    className="w-full text-left px-2 py-1.5 text-sm rounded text-slate-300 hover:bg-slate-800 hover:text-cyan-400 transition-colors flex items-center"
                                >
                                    {g.name}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
