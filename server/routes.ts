import type { Express } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { storage } from "./storage";

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

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

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
