/*
 * Copyright (C) 2025 Christin Löhner
 */

import { config } from "dotenv";
config();

import { Worker } from "bullmq";
import Redis from "ioredis";
import { EmailJobData, SearchJobData, MaintenanceJobData, CalendarJobData, ThumbnailJobData, emailQueue, searchQueue, maintenanceQueue, calendarQueue, thumbnailQueue } from "./queue";
import { sendEmail } from "../services/email";
import { ResetPasswordEmail } from "../emails/reset-password";
import { render } from "@react-email/render";
import { reindexAll } from "../services/search-reindex";
import { runFullReset, runOrphanRepair } from "../services/maintenance";
import { cleanupUnusedChunks } from "../services/chunk-store";
import { handleGoogleSyncJob, handleGooglePushJob } from "../services/google-calendar-jobs";
import { generateThumbnailForVersion } from "../services/thumbnails";

import { createServer } from "http";
import { QueueEvents } from "bullmq";

console.warn("Starting Workers...");

// Health check server
const healthServer = createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200);
        res.end("OK");
    } else {
        res.writeHead(404);
        res.end();
    }
});

healthServer.listen(3001, () => {
    console.warn("Worker health check listening on port 3001");
});

const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null
});

const emailWorker = new Worker<EmailJobData>(
    "email-queue",
    async (job) => {
        console.warn(`Processing Email Job ${job.id}: ${job.data.kind}`);

        try {
            switch (job.data.kind) {
                case "reset-password": {
                    // @ts-ignore
                    const html = await render(ResetPasswordEmail({ resetLink: job.data.resetLink }));
                    await sendEmail({
                        // @ts-ignore
                        to: job.data.to,
                        subject: "Passwort zurücksetzen - Xynoxa Cloud",
                        html
                    });
                    break;
                }
                case "verify-email": {
                    const html = `
                      <div style="font-family: Arial, sans-serif; color:#0f172a;">
                        <h2>Willkommen bei Xynoxa</h2>
                        <p>Bitte bestätige deine E-Mail-Adresse, indem du auf den folgenden Link klickst:</p>
                        <p><a href="${job.data.verifyLink}" style="color:#06b6d4;">E-Mail bestätigen</a></p>
                        <p>Falls der Link nicht klickbar ist, füge ihn in deinen Browser ein:</p>
                        <code>${job.data.verifyLink}</code>
                      </div>`;
                    await sendEmail({
                        // @ts-ignore
                        to: job.data.to,
                        subject: "Bitte bestätige deine E-Mail-Adresse",
                        html
                    });
                    break;
                }
                // Add other cases here
            }
            console.warn(`Email Job ${job.id} completed successfully`);
        } catch (error) {
            console.error(`Email Job ${job.id} failed:`, error);
            throw error;
        }
    },
    { connection: (emailQueue as any)().opts.connection }
);

const searchWorker = new Worker<SearchJobData>(
    "search-queue",
    async (job) => {
        console.warn(`Processing Search Job ${job.id}: ${job.data.kind}`);
        try {
            if (job.data.kind === "reindex") {
                await reindexAll(job.data.ownerId, async (p) => {
                    await job.updateProgress(p);
                });
            }
            console.warn(`Search Job ${job.id} completed`);
        } catch (error) {
            console.error(`Search Job ${job.id} failed:`, error);
            throw error;
        }
    },
    { connection: (searchQueue as any)().opts.connection }
);

const maintenanceWorker = new Worker<MaintenanceJobData>(
    "maintenance-queue",
    async (job) => {
        console.warn(`Processing Maintenance Job ${job.id}: ${job.data.kind}`);
        try {
            if (job.data.kind === "orphan-repair") {
                const res = await runOrphanRepair(async (p) => job.updateProgress(p));
                console.warn(`Orphan-Reparatur Ergebnis:`, res);
            } else if (job.data.kind === "full-reset") {
                const res = await runFullReset(async (p) => job.updateProgress(p));
                console.warn(`Full-Reset Ergebnis:`, res);
            } else if (job.data.kind === "chunk-gc") {
                const res = await cleanupUnusedChunks();
                console.warn(`Chunk-GC Ergebnis:`, res);
            }
            console.warn(`Maintenance Job ${job.id} completed`);
        } catch (error) {
            console.error(`Maintenance Job ${job.id} failed:`, error);
            throw error;
        }
    },
    { connection: (maintenanceQueue as any)().opts.connection }
);

// Simple interval-based GC enqueuer (every 6h) – runs only in worker process
const maintenanceEvents = new QueueEvents("maintenance-queue", { connection });
maintenanceEvents.on("waiting", async () => {
    // noop, just to ensure listener exists
});
const SIX_HOURS = 6 * 60 * 60 * 1000;
const enqueueGc = async () => {
    try {
        await maintenanceQueue().add("chunk-gc", { kind: "chunk-gc" }, { jobId: "chunk-gc-periodic", removeOnComplete: 10 });
    } catch (e) {
        console.error("Failed to enqueue chunk-gc", e);
    }
};
enqueueGc();
setInterval(enqueueGc, SIX_HOURS);

const calendarWorker = new Worker<CalendarJobData>(
    "calendar-queue",
    async (job) => {
        console.warn(`Processing Calendar Job ${job.id}: ${job.data.kind}`);
        if (job.data.kind === "google-sync") {
            await handleGoogleSyncJob(job.data.userId, job.data.reason);
        } else if (job.data.kind === "google-push-event") {
            await handleGooglePushJob(job.data.userId, job.data.eventId, job.data.action, job.data.snapshot);
        }
    },
    { connection: (calendarQueue as any)().opts.connection }
);

const thumbnailWorker = new Worker<ThumbnailJobData>(
    "thumbnail-queue",
    async (job) => {
        if (job.data.kind !== "generate-thumbnail") return;
        try {
            await generateThumbnailForVersion({
                fileId: job.data.fileId,
                versionId: job.data.versionId,
                size: job.data.size,
                mime: job.data.mime
            });
        } catch (error) {
            console.error(`Thumbnail Job ${job.id} failed:`, error);
            throw error;
        }
    },
    { connection: (thumbnailQueue as any)().opts.connection }
);

emailWorker.on("failed", (job, err) => {
    console.error(`Email Job ${job?.id} failed with error ${err.message}`);
});

searchWorker.on("failed", (job, err) => {
    console.error(`Search Job ${job?.id} failed with error ${err.message}`);
});

maintenanceWorker.on("failed", (job, err) => {
    console.error(`Maintenance Job ${job?.id} failed with error ${err.message}`);
});

calendarWorker.on("failed", (job, err) => {
    console.error(`Calendar Job ${job?.id} failed with error ${err.message}`);
});

thumbnailWorker.on("failed", (job, err) => {
    console.error(`Thumbnail Job ${job?.id} failed with error ${err.message}`);
});

process.on("SIGINT", async () => {
    await emailWorker.close();
    await searchWorker.close();
    await maintenanceWorker.close();
    await calendarWorker.close();
    await thumbnailWorker.close();
    healthServer.close();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await emailWorker.close();
    await searchWorker.close();
    await maintenanceWorker.close();
    await calendarWorker.close();
    await thumbnailWorker.close();
    healthServer.close();
    process.exit(0);
});
