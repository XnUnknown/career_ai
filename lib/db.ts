/**
 * lib/db.ts — the single Prisma client for the app.
 *
 * Next.js dev mode re-evaluates modules on every hot reload, which would open a
 * new connection pool each time and eventually exhaust Postgres. Caching the
 * client on `globalThis` keeps one pool across reloads.
 *
 * SERVER-ONLY — never import from a "use client" component.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
