/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useEffect, useState } from "react";
import { FileItem } from "@/app/(dashboard)/files/use-files-query";
import { Loader2, AlertCircle } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";

type Props = {
    file: FileItem;
};

function detectLanguage(file: FileItem) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const map: Record<string, string> = {
        js: "javascript",
        mjs: "javascript",
        cjs: "javascript",
        ts: "typescript",
        tsx: "tsx",
        jsx: "jsx",
        json: "json",
        css: "css",
        scss: "scss",
        md: "markdown",
        markdown: "markdown",
        html: "markup",
        xml: "markup",
        yml: "yaml",
        yaml: "yaml",
        php: "php",
        py: "python",
        rb: "ruby",
        go: "go",
        rs: "rust",
        c: "c",
        h: "c",
        cpp: "cpp",
        hpp: "cpp",
        java: "java",
        sh: "bash",
        txt: "text"
    };
    return map[ext] || "text";
}

export function TextViewer({ file }: Props) {
    const [content, setContent] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        setLoading(true);
        fetch(`/api/files/content/${file.id}`)
            .then(async (res) => {
                if (!res.ok) throw new Error(`Status ${res.status}`);
                return res.text();
            })
            .then((txt) => {
                if (active) {
                    setContent(txt);
                    setError(null);
                }
            })
            .catch((err) => {
                if (active) setError(err.message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [file.id]);

    const lang = detectLanguage(file);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center text-slate-400 gap-2">
                <Loader2 className="animate-spin" size={18} /> Lädt Vorschau...
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-amber-300">
                <AlertCircle size={32} />
                <p className="text-sm">Vorschau fehlgeschlagen ({error})</p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto bg-slate-950">
            <Highlight code={content} language={lang as any} theme={themes.vsDark}>
                {({ className, style, tokens, getLineProps, getTokenProps }) => (
                    <pre className={`${className} text-sm`} style={{ ...style, padding: "16px", margin: 0 }}>
                        {tokens.map((line, i) => (
                            <div key={i} {...getLineProps({ line, key: i })}>
                                {line.map((token, key) => (
                                    <span key={key} {...getTokenProps({ token, key })} />
                                ))}
                            </div>
                        ))}
                    </pre>
                )}
            </Highlight>
        </div>
    );
}
