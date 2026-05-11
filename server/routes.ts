import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { storage } from "./storage";
// In dev, the Express server stands in for Vercel's serverless runtime so
// that `npm run dev` can actually round-trip to Supabase. The handlers in
// `api/*.ts` are written against `VercelRequest`/`VercelResponse`, which are
// near-identical to Express's `Request`/`Response` (both extend the same Node
// IncomingMessage / ServerResponse). With `express.json()` populating `req.body`
// upstream, we can hand the Express objects directly to the Vercel handlers
// via a small type cast — no logic duplication, single source of truth.
import cardStampsHandler from "../api/card-stamps";
import cardStampsLookupHandler from "../api/card-stamps-lookup";
// Multiplayer (phase-4 / phase-6) Vercel-style handlers. Same bridge pattern
// as card-stamps above: dev parity with prod's serverless runtime so the
// lobby, transfer, ack, and resume flows can round-trip Supabase locally.
// Without these mounts, /api/mp/* would fall through to the SPA catchall and
// the multiplayer client would receive HTML instead of JSON.
import mpCreateRoomHandler from "../api/mp/create-room";
import mpJoinRoomHandler from "../api/mp/join-room";
import mpTransferHandler from "../api/mp/transfer";
import mpAckTransferHandler from "../api/mp/ack-transfer";
import mpResumeHandler from "../api/mp/resume";

type BackpackLogEntry = {
  id: string;
  timestamp: number;
  tag: string;
  payload: unknown;
};

const MAX_BACKPACK_LOG_ENTRIES = 2000;
const backpackLogs: BackpackLogEntry[] = [];

function appendBackpackLog(entry: BackpackLogEntry) {
  backpackLogs.push(entry);
  if (backpackLogs.length > MAX_BACKPACK_LOG_ENTRIES) {
    backpackLogs.splice(0, backpackLogs.length - MAX_BACKPACK_LOG_ENTRIES);
  }
}

/**
 * Bridge an `api/*.ts` Vercel handler onto an Express route. Catches any
 * thrown error so that a faulty handler never takes the dev server down or
 * cascades into the SPA catchall.
 */
function vercelBridge(
  handler: (req: any, res: any) => unknown | Promise<unknown>,
) {
  return async (req: Request, res: Response) => {
    try {
      await handler(req, res);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[vercelBridge] handler threw:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "internal_error" });
      }
    }
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  // Card-stamp social feature (mirrors `api/card-stamps.ts` /
  // `api/card-stamps-lookup.ts` on Vercel). In dev these would otherwise
  // fall through to the SPA catchall and silently drop writes / return HTML
  // for reads — making it look like the feature is "200 OK" while in fact
  // nothing is persisted. Mounting the same Vercel handlers here keeps the
  // dev experience identical to production.
  app.post("/api/card-stamps", vercelBridge(cardStampsHandler));
  app.post("/api/card-stamps-lookup", vercelBridge(cardStampsLookupHandler));

  // -------------------------------------------------------------------------
  // Multiplayer endpoints (phase 4 + 6). Each mirrors `api/mp/*.ts` 1:1 in
  // dev. All five handlers share the same `vercelBridge` so:
  //   - JSON body parsing is already done by the upstream `express.json()`
  //     middleware, which means `req.body` is populated identically to how
  //     Vercel's runtime delivers it.
  //   - Authorization headers are forwarded as-is, so the JWT-validation
  //     code in `api/mp/_shared.ts:getUserFromBearer` works without changes.
  //   - Thrown errors are caught & returned as 500 instead of crashing the
  //     dev server.
  // Anonymous-auth JWTs are validated by the handlers themselves (each
  // calls `getUserFromBearer` which hits Supabase `/auth/v1/user`), so the
  // dev server stays stateless and matches prod behavior.
  // -------------------------------------------------------------------------
  app.post("/api/mp/create-room", vercelBridge(mpCreateRoomHandler));
  app.post("/api/mp/join-room", vercelBridge(mpJoinRoomHandler));
  app.post("/api/mp/transfer", vercelBridge(mpTransferHandler));
  app.post("/api/mp/ack-transfer", vercelBridge(mpAckTransferHandler));
  app.post("/api/mp/resume", vercelBridge(mpResumeHandler));

  app.post("/api/backpack-logs", (req, res) => {
    const { tag, payload } = req.body ?? {};
    if (typeof tag !== "string" || tag.trim().length === 0) {
      return res.status(400).json({ message: "tag is required" });
    }

    const entry: BackpackLogEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      tag: tag.trim(),
      payload: payload ?? null,
    };

    appendBackpackLog(entry);
    return res.status(201).json({ id: entry.id });
  });

  app.get("/api/backpack-logs", (req, res) => {
    const { since } = req.query;
    let filteredLogs = backpackLogs;

    if (typeof since === "string") {
      const sinceNumber = Number(since);
      if (!Number.isNaN(sinceNumber)) {
        filteredLogs = backpackLogs.filter((entry) => entry.timestamp >= sinceNumber);
      }
    }

    res.json({ logs: filteredLogs });
  });

  app.delete("/api/backpack-logs", (_req, res) => {
    backpackLogs.length = 0;
    res.status(204).end();
  });

  const httpServer = createServer(app);

  return httpServer;
}
