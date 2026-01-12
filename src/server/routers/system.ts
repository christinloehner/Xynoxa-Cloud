/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, adminProcedure, protectedProcedure } from "@/server/trpc";
import { db } from "@/server/db";
import { users, files, folders, systemSettings } from "@/server/db/schema";
import { count, sql, inArray } from "drizzle-orm";
import os from "os";
import checkDiskSpace from "check-disk-space";
import { meiliClient } from "@/server/services/search";

export const systemRouter = router({
    getFormatSettings: protectedProcedure.query(async () => {
        const settings = await db.select().from(systemSettings).where(inArray(systemSettings.key, ["date_format", "time_format"]));

        let dateFormat = "dd.MM.yyyy"; // Default
        let timeFormat = "HH:mm";       // Default

        settings.forEach(s => {
            if (s.key === "date_format") dateFormat = JSON.parse(s.value);
            if (s.key === "time_format") timeFormat = JSON.parse(s.value);
        });

        return { dateFormat, timeFormat };
    }),

    stats: adminProcedure.query(async () => {
        // Quick counts
        const [userCount] = await db.select({ value: count() }).from(users);
        const [fileCount] = await db.select({ value: count() }).from(files);

        let disk = { free: 0, size: 0 };
        try {
            // Check disk space for current directory
            disk = await checkDiskSpace(process.cwd());
        } catch (e) {
            console.error("Disk space check failed", e);
        }

        let postgresVersion = "Unknown";
        try {
            const pgRes = await db.execute(sql`SELECT version()`) as { rows: { version: string }[] };
            // Standard PG version string: "PostgreSQL 15.1 ..."
            postgresVersion = pgRes.rows[0].version.split(" ")[1];
        } catch (e) {
            console.error("Failed to fetch Postgres version", e);
        }

        return {
            users: userCount.value,
            files: fileCount.value,
            hostname: os.hostname(),
            platform: os.platform() + " " + os.release(),
            nodeVersion: process.version,
            postgresVersion,
            uptime: os.uptime(),
            cpu: {
                model: os.cpus()[0].model,
                cores: os.cpus().length,
                loadAvg: os.loadavg()
            },
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem()
            },
            disk: {
                total: disk.size,
                free: disk.free,
                used: disk.size - disk.free
            }
        };
    }),

    status: adminProcedure.query(async () => {
        // Check DB health
        let dbStatus = "healthy";
        try {
            await db.select({ value: count() }).from(users).limit(1);
        } catch (e) {
            dbStatus = "error";
        }

        // Check Search health
        let searchStatus = "healthy";
        try {
            await meiliClient.health();
        } catch (e) {
            searchStatus = "error";
        }

        return { db: dbStatus, search: searchStatus };
    })
});
