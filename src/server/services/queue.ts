/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Simple in-process job queue for background tasks
 * Can be replaced with a proper queue system (BullMQ, etc.) for production
 */

type JobHandler = () => Promise<void>;

interface Job {
  id: string;
  name: string;
  handler: JobHandler;
  attempts: number;
  maxAttempts: number;
  scheduledAt: Date;
  error?: Error;
}

class JobQueue {
  private queue: Job[] = [];
  private processing = false;
  private maxConcurrent = 3;
  private activeJobs = 0;

  /**
   * Add a job to the queue
   */
  async add(name: string, handler: JobHandler, maxAttempts = 3): Promise<string> {
    const id = `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const job: Job = {
      id,
      name,
      handler,
      attempts: 0,
      maxAttempts,
      scheduledAt: new Date()
    };

    this.queue.push(job);

    if (!this.processing) {
      this.processQueue();
    }

    return id;
  }

  /**
   * Process jobs from the queue
   */
  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 || this.activeJobs > 0) {
      // Wait if we're at max concurrent jobs
      if (this.activeJobs >= this.maxConcurrent) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      const job = this.queue.shift();
      if (!job) {
        // No more jobs in queue, wait for active jobs to finish
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      this.activeJobs++;

      // Execute job in background
      this.executeJob(job)
        .catch(error => {
          console.error(`Job ${job.name} (${job.id}) failed:`, error);
        })
        .finally(() => {
          this.activeJobs--;
        });
    }

    this.processing = false;
  }

  /**
   * Execute a single job
   */
  private async executeJob(job: Job): Promise<void> {
    job.attempts++;

    try {
      await job.handler();
    } catch (error) {
      job.error = error as Error;

      if (job.attempts < job.maxAttempts) {
        // Retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, job.attempts), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Re-queue the job
        this.queue.push(job);
      } else {
        console.error(`Job ${job.name} (${job.id}) failed after ${job.attempts} attempts:`, error);
      }

      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queued: this.queue.length,
      active: this.activeJobs,
      processing: this.processing
    };
  }

  /**
   * Clear all queued jobs (not active ones)
   */
  clear() {
    const cleared = this.queue.length;
    this.queue = [];
    return cleared;
  }
}

// Singleton instance
export const jobQueue = new JobQueue();

/**
 * Helper to queue Meilisearch index operations
 */
export async function queueIndexJob(indexName: string, document: any) {
  const { indexDocument } = await import("./search");
  return jobQueue.add(`index-${indexName}`, async () => {
    await indexDocument(indexName, document);
  });
}

/**
 * Helper to queue text extraction jobs
 */
export async function queueExtractJob(fileId: string, buffer: Buffer, mime: string) {
  const { extractText, saveExtractedText } = await import("./extract");
  const { db } = await import("../db");

  return jobQueue.add(`extract-${fileId}`, async () => {
    const text = await extractText({ fileId, buffer, mime });
    if (text && text.trim()) {
      await saveExtractedText(db, fileId, text);
    }
  });
}

/**
 * Helper to queue embedding generation jobs
 */
export async function queueEmbeddingJob(params: {
  ownerId: string;
  entity: "file" | "note" | "bookmark" | "event" | "task";
  entityId: string;
  title: string;
  text: string;
}) {
  const { upsertEmbedding } = await import("./embeddings");
  const { db } = await import("../db");

  return jobQueue.add(`embed-${params.entityId}`, async () => {
    await upsertEmbedding({
      db,
      ownerId: params.ownerId,
      entity: params.entity,
      entityId: params.entityId,
      title: params.title,
      text: params.text
    });
  });
}
