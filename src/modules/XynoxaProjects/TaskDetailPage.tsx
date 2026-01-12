/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil, CheckCircle2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

export default function TaskDetailPage({ taskId }: { taskId: string }) {
  const router = useRouter();
  const routeParams = useParams();
  const routeTaskIdRaw = (routeParams as { taskId?: string | string[] } | undefined)?.taskId;
  const routeTaskId = Array.isArray(routeTaskIdRaw) ? routeTaskIdRaw[0] : routeTaskIdRaw;
  const resolvedTaskId = typeof taskId === "string" && taskId.trim().length > 0
    ? taskId
    : typeof routeTaskId === "string" && routeTaskId.trim().length > 0
      ? routeTaskId
      : undefined;
  const hasTaskId = typeof resolvedTaskId === "string" && resolvedTaskId.trim().length > 0;

  useEffect(() => {
    if (!hasTaskId) {
      console.warn("[TaskDetailPage] taskId fehlt oder leer", { taskId, routeTaskId });
    }
  }, [hasTaskId, routeTaskId, taskId]);

  const taskInput = hasTaskId ? {
    moduleId: "projects",
    procedure: "getTask",
    input: { taskId: resolvedTaskId }
  } : skipToken;

  const commentsInput = hasTaskId ? {
    moduleId: "projects",
    procedure: "listTaskComments",
    input: { taskId: resolvedTaskId }
  } : skipToken;

  const taskQuery = trpc.moduleApi.invokeQuery.useQuery(taskInput);

  const commentsQuery = trpc.moduleApi.invokeQuery.useQuery(commentsInput);

  const addComment = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      setCommentText("");
      setReplyText("");
      setReplyToId(null);
      commentsQuery.refetch();
    }
  });

  const [commentText, setCommentText] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const task = taskQuery.data as any;
  const comments = (commentsQuery.data as any[] | undefined) ?? [];

  const threaded = useMemo(() => {
    const map = new Map<string, any>();
    comments.forEach((comment) => map.set(comment.id, { ...comment, replies: [] as any[] }));
    const roots: any[] = [];
    map.forEach((comment) => {
      if (comment.parentId) {
        const parent = map.get(comment.parentId);
        if (parent) parent.replies.push(comment);
        else roots.push(comment);
      } else {
        roots.push(comment);
      }
    });
    return roots;
  }, [comments]);

  if (!hasTaskId) {
    return <div className="text-sm text-slate-400">Task nicht gefunden.</div>;
  }

  if (taskQuery.isLoading) {
    return <div className="text-sm text-slate-400">Task wird geladen...</div>;
  }

  if (!task) {
    return <div className="text-sm text-slate-400">Task nicht gefunden.</div>;
  }

  const canEdit = task.role === "owner" || task.role === "manager" || task.role === "member";

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-aurora-mint/12 to-xynoxa-cyan/16 p-6 md:p-8 shadow-xl dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-xynoxa-cyan/20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-aurora-mint">Task</p>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white">{task.title}</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{task.description || "Keine Beschreibung"}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Priorität: {task.priority}</span>
              {task.dueAt ? <span>Fällig: {new Date(task.dueAt).toLocaleDateString("de-DE")}</span> : null}
              {task.assigneeEmail ? <span>Zugewiesen: {task.assigneeName || task.assigneeEmail}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-xynoxa-cyan/60 text-xynoxa-cyan" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück
            </Button>
            {canEdit && (
              <Button variant="outline" className="border-xynoxa-cyan/60 text-xynoxa-cyan" onClick={() => router.push(`/projects/${task.projectId}`)}>
                <Pencil className="mr-2 h-4 w-4" />
                Bearbeiten
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-50">Kommentare</h2>
          <Badge className="bg-emerald-500/20 text-emerald-200">
            {comments.length} Kommentare
          </Badge>
        </div>

        <div className="mt-4 space-y-3">
          {threaded.length === 0 && (
            <div className="text-sm text-slate-500">Noch keine Kommentare.</div>
          )}
          {threaded.map((comment) => (
            <ThreadedComment
              key={comment.id}
              comment={comment}
              depth={0}
              canEdit={canEdit}
              onReply={(parentId, content) =>
                addComment.mutate({
                  moduleId: "projects",
                  procedure: "addTaskComment",
                  input: { taskId: resolvedTaskId, content, parentId }
                })
              }
              replyToId={replyToId}
              setReplyToId={setReplyToId}
              replyText={replyText}
              setReplyText={setReplyText}
            />
          ))}
        </div>

        {canEdit && (
          <div className="mt-6 space-y-2">
            <textarea
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
              placeholder="Kommentar hinzufügen..."
            />
            <Button
              onClick={() =>
                addComment.mutate({
                  moduleId: "projects",
                  procedure: "addTaskComment",
                  input: { taskId: resolvedTaskId, content: commentText }
                })
              }
              disabled={!commentText.trim()}
            >
              Kommentar speichern
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadedComment({
  comment,
  depth,
  canEdit,
  onReply,
  replyToId,
  setReplyToId,
  replyText,
  setReplyText
}: {
  comment: any;
  depth: number;
  canEdit: boolean;
  onReply: (parentId: string, content: string) => void;
  replyToId: string | null;
  setReplyToId: (id: string | null) => void;
  replyText: string;
  setReplyText: (value: string) => void;
}) {
  return (
    <div style={{ marginLeft: depth * 16 }} className="space-y-2">
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100">
        <div className="text-xs text-slate-400">
          {comment.displayName || comment.email} · {new Date(comment.createdAt).toLocaleString("de-DE")}
        </div>
        <div className="mt-1 whitespace-pre-wrap">{comment.content}</div>
        {canEdit && (
          <button
            className="mt-2 text-xs text-aurora-mint hover:text-aurora-mint/80"
            onClick={() => {
              setReplyToId(comment.id);
              setReplyText("");
            }}
          >
            Antworten
          </button>
        )}
      </div>
      {replyToId === comment.id && canEdit && (
        <div className="space-y-2">
          <textarea
            value={replyText}
            onChange={(event) => setReplyText(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
            placeholder="Antwort schreiben..."
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onReply(comment.id, replyText)} disabled={!replyText.trim()}>
              Antworten
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReplyToId(null)}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}
      {(comment.replies ?? []).map((child: any) => (
        <ThreadedComment
          key={child.id}
          comment={child}
          depth={depth + 1}
          canEdit={canEdit}
          onReply={onReply}
          replyToId={replyToId}
          setReplyToId={setReplyToId}
          replyText={replyText}
          setReplyText={setReplyText}
        />
      ))}
    </div>
  );
}
