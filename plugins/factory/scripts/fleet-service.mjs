import { createServer } from "node:http";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { z } from "zod";
import { fleetModel } from "../src/config.mjs";
import { createFleetApi, taskWorkspaceLeaseError, validTaskWorkspaceLease } from "../src/fleet-api.mjs";
import { githubRepository } from "../src/fleet-display.mjs";
import { fleetObjects } from "../src/fleet-objects.mjs";

import { workspacePolicy } from "../src/fleet-workspace.mjs";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const schema = z.strictObject({
  projectId: id,
  databaseId: id,
  bucket: z.string().regex(/^[a-z0-9._-]{3,63}$/),
  users: z.record(id, z.discriminatedUnion("role", [
    z.strictObject({ role: z.literal("controller"), projects: z.array(id).min(1) }),
    z.strictObject({ role: z.literal("viewer"), project: id, repository: z.string().max(150).regex(githubRepository) }),
    z.strictObject({ role: z.literal("worker"), hostId: id, slotId: id }),
  ])),
  workspaces: z.record(id, workspacePolicy).optional(),
  claudeSelection: z.strictObject({ provider: z.literal("claude"), gateway: id, model: fleetModel }).optional(),
  projects: z.record(id, z.strictObject({
    revision: z.union([z.string().regex(/^[a-f0-9]{40}$/), z.literal("git")]),
    workspaceKey: id,
    workspaceLease: z.literal("task").optional(),
    workspace: id.optional(),
    eligibleSlots: z.array(id).min(1).max(16),
    selection: z.strictObject({ provider: z.literal("codex"), gateway: id, model: fleetModel }),
  }).refine(validTaskWorkspaceLease, taskWorkspaceLeaseError)),
});

const config = schema.parse(JSON.parse(process.env.FACTORY_ENROLLMENT ?? "{}"));
const credential = applicationDefault();
const app = initializeApp({ credential, projectId: config.projectId, storageBucket: config.bucket });
const auth = getAuth(app);
const db = getFirestore(app, config.databaseId);
const api = createFleetApi({ db, config, verifyToken: (token) => auth.verifyIdToken(token, true),
  objects: fleetObjects(getStorage(app).bucket(), credential) });
createServer({ requestTimeout: 45_000 }, api).listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
