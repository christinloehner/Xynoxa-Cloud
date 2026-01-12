/*
 * Copyright (C) 2025 Christin Löhner
 */

import { Queue } from "bullmq";
import Redis from "ioredis";

const isBuild = process.env.NEXT_PHASE === "phase-production-build";
let sharedConnection: Redis | null = null;

function getConnection() {
    if (isBuild) {
        throw new Error("Queues werden zur Build-Zeit nicht initialisiert.");
    }
    if (!sharedConnection) {
        sharedConnection = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
            maxRetriesPerRequest: null,
            lazyConnect: true,
            enableReadyCheck: false
        });
    }
    return sharedConnection;
}

export type EmailJobData = {
    kind: "reset-password";
    to: string;
    resetLink: string;
} | {
    kind: "welcome";
    to: string;
    name: string;
} | {
    kind: "verify-email";
    to: string;
    verifyLink: string;
};

export type SearchJobData = {
    kind: "reindex";
    ownerId: string;
};

export type MaintenanceJobData = {
    kind: "orphan-repair";
} | {
    kind: "full-reset";
} | {
    kind: "chunk-gc";
    force?: boolean;
};

export type CalendarJobData =
    | { kind: "google-sync"; userId: string; reason?: string }
    | {
        kind: "google-push-event";
        userId: string;
        eventId: string;
        action: "create" | "update" | "delete";
        snapshot?: {
            externalId?: string | null;
            externalCalendarId?: string | null;
            title?: string | null;
            description?: string | null;
            location?: string | null;
            startsAt?: string | null;
            endsAt?: string | null;
        };
    };

export type ThumbnailJobData = {
    kind: "generate-thumbnail";
    fileId: string;
    versionId: string;
    size?: number;
    mime?: string | null;
};

export const emailQueue = () => new Queue<EmailJobData>("email-queue", {
    connection: getConnection(),
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 1000
        },
        removeOnComplete: true,
        removeOnFail: false
    }
});

export const searchQueue = () => new Queue<SearchJobData>("search-queue", {
    connection: getConnection(),
    defaultJobOptions: {
        removeOnComplete: 100, // Keep status for polling
        removeOnFail: 500
    }
});

export const maintenanceQueue = () => new Queue<MaintenanceJobData>("maintenance-queue", {
    connection: getConnection(),
    defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 50,
        removeOnFail: 100
    }
});

export const calendarQueue = () => new Queue<CalendarJobData>("calendar-queue", {
    connection: getConnection(),
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 50,
        removeOnFail: 50
    }
});

export const thumbnailQueue = () => new Queue<ThumbnailJobData>("thumbnail-queue", {
    connection: getConnection(),
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 200,
        removeOnFail: 200
    }
});
