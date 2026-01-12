/*
 * Copyright (C) 2025 Christin Löhner
 */

import { readFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_APP_DOMAIN: process.env.APP_DOMAIN,
  },
  reactStrictMode: true,
  typedRoutes: true,
  // Packages that should only be resolved on server (not bundled for client)
  serverExternalPackages: [
    'jsdom',
    'pg',
    'pgvector',
    'argon2',
    'nodemailer',
    'minio',
    'bullmq',
    'ioredis',
    'sharp',
    'pdf-parse',
    'mammoth',
    'tesseract.js',
    '@xenova/transformers',
    'winston',
    'winston-daily-rotate-file',
  ],
  // Turbopack config (required for Next.js 16)
  turbopack: {
    // Turbopack uses serverExternalPackages from above
  },
  async headers() {
    const appDomain = process.env.APP_DOMAIN || 'dev.xynoxa.com';
    return [
      {
        source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self';
              script-src 'self' 'unsafe-eval' 'unsafe-inline';
              style-src 'self' 'unsafe-inline';
              img-src 'self' blob: data: https:;
              font-src 'self';
              object-src 'none';
              base-uri 'self';
              form-action 'self';
              frame-src 'self';
              connect-src 'self';
              frame-ancestors 'none';
            `.replace(/\s{2,}/g, ' ').trim(),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
