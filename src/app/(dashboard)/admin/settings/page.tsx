/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AdminSettingsPage() {
    const { data: settings, isLoading, refetch } = trpc.admin.getSettings.useQuery();
    const updateSetting = trpc.admin.updateSetting.useMutation({
        onSuccess: () => {
            toast.success("Einstellung gespeichert.");
            refetch();
        },
        onError: (e) => {
            toast.error(`Fehler beim Speichern: ${e.message}`);
        }
    });

    const [clientId, setClientId] = useState("");
    const [clientSecret, setClientSecret] = useState("");
    const [redirectUri, setRedirectUri] = useState("");
    const recommendedRedirect = settings?.["app_url"]
        ? `${settings["app_url"]}/api/google/oauth/callback`
        : "";

    useEffect(() => {
        if (settings) {
            setClientId(settings["google_client_id"] ?? "");
            setClientSecret(settings["google_client_secret"] ?? "");
            setRedirectUri(settings["google_oauth_redirect"] ?? recommendedRedirect);
        }
    }, [settings, recommendedRedirect]);

    const registrationDisabled = settings?.["registration_disabled"] === true;

    const handleToggleRegistration = (checked: boolean) => {
        updateSetting.mutate({
            key: "registration_disabled",
            value: checked,
            description: "Wenn wahr, ist die Registrierung für neue Nutzer deaktiviert."
        });
    };

    const saveGoogle = () => {
        updateSetting.mutate({
            key: "google_client_id",
            value: clientId,
            description: "Google OAuth Client ID"
        });
        updateSetting.mutate({
            key: "google_client_secret",
            value: clientSecret,
            description: "Google OAuth Client Secret"
        });
        updateSetting.mutate({
            key: "google_oauth_redirect",
            value: recommendedRedirect || redirectUri,
            description: "Google OAuth Redirect URI"
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    System-Einstellungen
                </h1>
                <p className="text-slate-500 dark:text-slate-400">
                    Konfiguriere das globale Verhalten der Xynoxa Instanz.
                </p>
            </div>

            {isLoading && (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-xynoxa-cyan" />
                </div>
            )}

            {!isLoading && (
            <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/40">
                <CardHeader>
                    <CardTitle className="text-lg">Authentifizierung</CardTitle>
                    <CardDescription>Einstellungen zu Login und Registrierung.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <div className="space-y-0.5">
                            <Label htmlFor="registration-toggle" className="text-base font-medium">
                                Registrierung verbieten
                            </Label>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Wenn aktiviert, können sich keine neuen Benutzer registrieren. Bestehende Benutzer können sich weiterhin einloggen.
                            </p>
                        </div>
                        <Switch
                            id="registration-toggle"
                            checked={registrationDisabled}
                            onCheckedChange={handleToggleRegistration}
                            disabled={updateSetting.isPending}
                        />
                    </div>
                </CardContent>
            </Card>
            )}

            <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/40">
                <CardHeader>
                    <CardTitle className="text-lg">Lokalisierung & Formatierung</CardTitle>
                    <CardDescription>Einstellungen für Datums- und Zeitdarstellung.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Datumsformat</Label>
                            <Select
                                value={settings?.["date_format"] || "dd.MM.yyyy"}
                                onValueChange={(val) => updateSetting.mutate({ key: "date_format", value: val, description: "Globales Datumsformat" })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="dd.MM.yyyy">31.12.2023 (Standard)</SelectItem>
                                    <SelectItem value="yyyy-MM-dd">2023-12-31 (ISO)</SelectItem>
                                    <SelectItem value="MM/dd/yyyy">12/31/2023 (US)</SelectItem>
                                    <SelectItem value="PPP">31. Dezember 2023 (Lang)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Zeitformat</Label>
                            <Select
                                value={settings?.["time_format"] || "HH:mm"}
                                onValueChange={(val) => updateSetting.mutate({ key: "time_format", value: val, description: "Globales Zeitformat" })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="HH:mm">14:00 (24h Standard)</SelectItem>
                                    <SelectItem value="HH:mm:ss">14:00:30 (24h mit Sekunden)</SelectItem>
                                    <SelectItem value="hh:mm a">02:00 PM (12h)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/40">
                <CardHeader>
                    <CardTitle className="text-lg">Kalender-Integration (Google)</CardTitle>
                    <CardDescription>Client-Credentials für Google Calendar OAuth. Werden verschlüsselt in der DB gespeichert.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Client ID</Label>
                        <Input
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            placeholder="xxxxxxxxxxxx.apps.googleusercontent.com"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Client Secret</Label>
                        <Input
                            type="password"
                            value={clientSecret}
                            onChange={(e) => setClientSecret(e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Redirect URI (fest vorgegeben)</Label>
                        <div className="flex flex-col gap-2 rounded-lg border border-slate-800/70 bg-slate-900/40 p-3">
                            <div className="flex items-center justify-between text-xs text-slate-400">
                                <span>Diese URI muss in der Google OAuth Client-ID hinterlegt werden.</span>
                                {recommendedRedirect && (
                                    <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(recommendedRedirect)}>
                                        Kopieren
                                    </Button>
                                )}
                            </div>
                            <code className="text-[11px] break-all text-slate-200">
                                {recommendedRedirect || ""}
                            </code>
                        </div>
                        <p className="text-xs text-slate-500">
                            Der Backend-Endpunkt existiert unter /api/google/oauth/callback. Diese URI ist unveränderlich.
                        </p>
                    </div>
                    <Button onClick={saveGoogle} disabled={updateSetting.isPending}>
                        {updateSetting.isPending ? "Speichere..." : "Speichern"}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
