import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { createFunctions } from './functions.js';
import type { Settings } from './backend.js';

// Explicit local/operator config; never guess company, connector UID or profiles.
const value = process.env.MORPHEUS_HQ_SETTINGS_JSON;
if (!value) throw new Error('MORPHEUS_HQ_SETTINGS_JSON must contain the explicit HQ mapping');
const settings: Settings = JSON.parse(value);
initializeApp();
const handlers = createFunctions({ onCall, HttpsError, db: getFirestore(), auth: getAuth(), settings });
export const hqEnqueue = handlers.enqueue;
export const hqRead = handlers.read;
export const hqPending = handlers.pending;
export const hqInspect = handlers.inspect;
export const hqClaim = handlers.claim;
export const hqBeginApply = handlers.beginApply;
export const hqComplete = handlers.complete;
