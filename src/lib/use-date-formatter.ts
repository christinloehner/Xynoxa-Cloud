/*
 * Copyright (C) 2025 Christin Löhner
 */

import { trpc } from "@/lib/trpc-client";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useCallback } from "react";
import { formatDate as dateFnsFormat } from "date-fns";

export function useDateFormatter() {
    const { data: settings } = trpc.system.getFormatSettings.useQuery(undefined, {
        staleTime: 1000 * 60 * 60, // Cache for 1 hour
        refetchOnWindowFocus: false,
    });

    const formatDate = useCallback((date: Date | string | null | undefined) => {
        if (!date) return "-";
        const d = new Date(date);
        const dateFormat = settings?.dateFormat || "dd.MM.yyyy";
        try {
            return dateFnsFormat(d, dateFormat, { locale: de });
        } catch (e) {
            return dateFnsFormat(d, "dd.MM.yyyy"); // Fallback
        }
    }, [settings?.dateFormat]);

    const formatDateTime = useCallback((date: Date | string | null | undefined) => {
        if (!date) return "-";
        const d = new Date(date);
        const dateFormat = settings?.dateFormat || "dd.MM.yyyy";
        const timeFormat = settings?.timeFormat || "HH:mm";
        const fullFormat = `${dateFormat} ${timeFormat}`;
        try {
            return dateFnsFormat(d, fullFormat, { locale: de });
        } catch (e) {
            return dateFnsFormat(d, "dd.MM.yyyy HH:mm"); // Fallback
        }
    }, [settings?.dateFormat, settings?.timeFormat]);

    return { formatDate, formatDateTime, isLoading: !settings };
}
