/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";

type RightSidebarContextType = {
    content: ReactNode | null;
    setRightSidebar: (content: ReactNode | null) => void;
    isOpen: boolean;
};

const RightSidebarContext = createContext<RightSidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [content, setContent] = useState<ReactNode | null>(null);

    return (
        <RightSidebarContext.Provider
            value={{
                content,
                setRightSidebar: setContent,
                isOpen: !!content,
            }}
        >
            {children}
        </RightSidebarContext.Provider>
    );
}

export function useRightSidebar() {
    const context = useContext(RightSidebarContext);
    if (context === undefined) {
        throw new Error("useRightSidebar must be used within a SidebarProvider");
    }
    return context;
}
