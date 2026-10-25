import { createBackend, type Settings } from './backend.js';
import { firestoreStore } from './store.js';
import { TransportError } from './protocol.js';
import { firestoreProjectionStore } from './projection.js';

// SDK imports belong to the opt-in consumer deployment, rather than Morpheus's kit.
// onCall verifies Firebase ID tokens before passing request.auth. Never call this
// wrapper behind a route that constructs auth from browser JSON/session-cookie claims.
export function createFunctions({ onCall, HttpsError, db, auth, settings }: {
  onCall: any; HttpsError: any; db: any; auth: { getUser(uid: string): Promise<any> }; settings: Settings;
}) {
  const backend = createBackend({ settings, store: firestoreStore(db, settings.companyId), projection: firestoreProjectionStore(db, settings.companyId), user: uid => auth.getUser(uid) });
  return Object.fromEntries(Object.entries(backend).map(([name, handler]) => [name, onCall({ cors: settings.allowedOrigins ?? false }, async (request: any) => {
    try { return await (handler as any)(request.auth, request.data ?? {}); }
    catch (error) {
      if (error instanceof TransportError) throw new HttpsError(error.code, error.message);
      throw new HttpsError('internal', 'HQ transport failed; preserve the operation ID');
    }
  })]));
}
