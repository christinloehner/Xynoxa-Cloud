/*
 * Copyright (C) 2025 Christin Löhner
 */

import Link from "next/link";

export const dynamic = "force-dynamic";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Shield, FileText, Database, HardDrive, BrainCircuit, Lock } from "lucide-react";
import { db } from "@/server/db";
import { systemSettings, users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export default async function Home() {
  const [setting] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "registration_disabled"))
    .limit(1);

  // Check for setup
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  if (!admin) {
    redirect("/auth/setup");
  }

  // Enabled if mismatch (undefined) or explicitly "false" (though we store "true" for disabled)
  // "registration_disabled" -> true means DISABLED.
  // "registration_disabled" -> false means ENABLED.
  // Missing means ENABLED.
  const registrationEnabled = !setting || setting.value !== "true";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500/30">
      {/* Navbar Placeholder */}
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/">
          <Image
            src="/images/logo/xynoxa-logo-transparent-dark.png"
            alt="Xynoxa"
            width={150}
            height={40}
            className="h-10 w-auto object-contain"
            priority
          />
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/auth/login">
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-800">
              Login
            </Button>
          </Link>
          {registrationEnabled && (
            <Link href="/auth/register">
              <Button className="bg-xynoxa-cyan hover:bg-cyan-500 text-white border-0">
                Get Started
              </Button>
            </Link>
          )}
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6">
        {/* Hero Section */}
        <section className="py-20 text-center lg:py-32">
          <Badge className="mb-6 rounded-full border border-xynoxa-cyan/50 bg-xynoxa-cyan/10 px-4 py-1 text-xynoxa-cyan hover:bg-xynoxa-cyan/20">
            The Personal Cloud Platform
          </Badge>
          <h1 className="mx-auto max-w-4xl font-display text-5xl font-bold tracking-tight text-white sm:text-7xl">
            Own your <span className="text-transparent bg-clip-text bg-gradient-to-r from-xynoxa-cyan to-aurora-mint">digital universe.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Deine Daten, dein Flow, deine Welt. Xynoxa kombiniert Self-Hosting, moderne UX und semantische Suche zu einem privaten digitalen Arbeitsplatz. Ohne Big Tech. Ohne Limits.
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Link href="/dashboard">
              <Button size="lg" className="h-12 bg-white text-slate-950 hover:bg-slate-200">
                Launch Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="https://www.xynoxa.com" target="_blank">
              <Button size="lg" variant="outline" className="h-12 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                Mehr erfahren
              </Button>
            </Link>
          </div>
        </section>

        {/* Features Grid */}
        <section className="grid gap-6 py-12 md:grid-cols-2 lg:grid-cols-3">
          <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-sm transition hover:border-xynoxa-cyan/50">
            <CardHeader>
              <FileText className="h-8 w-8 text-aurora-mint mb-2" />
              <CardTitle className="text-slate-100">Files & Docs</CardTitle>
              <CardDescription className="text-slate-400">Drag & Drop, Versionierung und Sharing. Alle deine Dokumente an einem Ort.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-sm transition hover:border-xynoxa-cyan/50">
            <CardHeader>
              <BrainCircuit className="h-8 w-8 text-xynoxa-cyan mb-2" />
              <CardTitle className="text-slate-100">Semantic Index</CardTitle>
              <CardDescription className="text-slate-400">Semantische Suche über alle Inhalte hinweg.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-sm transition hover:border-xynoxa-cyan/50">
            <CardHeader>
              <Lock className="h-8 w-8 text-nebula-pink mb-2" />
              <CardTitle className="text-slate-100">Private Vault</CardTitle>
              <CardDescription className="text-slate-400">Client-side Encryption für deine sensibelsten Daten. Echte Privatsphäre.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-sm transition hover:border-xynoxa-cyan/50">
            <CardHeader>
              <Database className="h-8 w-8 text-indigo-400 mb-2" />
              <CardTitle className="text-slate-100">Knowledge Graph</CardTitle>
              <CardDescription className="text-slate-400">Verknüpfe Notizen, Dateien und Aufgaben. Entdecke Zusammenhänge.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-sm transition hover:border-xynoxa-cyan/50">
            <CardHeader>
              <Shield className="h-8 w-8 text-emerald-400 mb-2" />
              <CardTitle className="text-slate-100">Self-Hosted</CardTitle>
              <CardDescription className="text-slate-400">Deine Hardware, deine Regeln. Docker-basiert und einfach zu deployen.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-sm transition hover:border-xynoxa-cyan/50">
            <CardHeader>
              <HardDrive className="h-8 w-8 text-cyan-400 mb-2" />
              <CardTitle className="text-slate-100">Unlimited</CardTitle>
              <CardDescription className="text-slate-400">Keine Abos, keine Speicherlimits. Du bestimmst, wie groß deine Cloud ist.</CardDescription>
            </CardHeader>
          </Card>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-800/50 py-12 text-center">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} Xynoxa Platform. A project by <a href="https://www.xynoxa.com" target="_blank" className="font-medium text-xynoxa-cyan hover:underline hover:text-cyan-300">xynoxa.com</a>
          </p>
          <div className="mt-4 flex justify-center gap-6 text-sm text-slate-600">
            <Link href="/auth/login" className="hover:text-slate-300">Login</Link>
            {registrationEnabled && (
              <Link href="/auth/register" className="hover:text-slate-300">Register</Link>
            )}
            <a href="https://github.com/xynoxa" target="_blank" className="hover:text-slate-300">GitHub</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
