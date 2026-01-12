/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextResponse } from "next/server";
import { logError } from "../services/logger";
import { TRPCError } from "@trpc/server";

/**
 * Global error handler for API routes
 */
export function handleApiError(error: any, context?: { userId?: string; endpoint?: string }) {
  const errorInfo = {
    message: error?.message || "Unknown error",
    stack: error?.stack,
    name: error?.name,
    code: error?.code,
    ...context
  };

  // Log the error
  logError("API Error", error, errorInfo);

  // Return appropriate response
  if (error instanceof TRPCError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: getHttpStatusFromTRPCCode(error.code) }
    );
  }

  // Generic 500 error
  return NextResponse.json(
    { error: "Internal Server Error", details: process.env.NODE_ENV === "development" ? error.message : undefined },
    { status: 500 }
  );
}

function getHttpStatusFromTRPCCode(code: string): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "BAD_REQUEST":
      return 400;
    case "CONFLICT":
      return 409;
    case "PRECONDITION_FAILED":
      return 412;
    case "PAYLOAD_TOO_LARGE":
      return 413;
    case "TIMEOUT":
      return 408;
    default:
      return 500;
  }
}

/**
 * Wrap async API route handlers with error handling
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  context?: { endpoint?: string }
): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error, context);
    }
  }) as T;
}
