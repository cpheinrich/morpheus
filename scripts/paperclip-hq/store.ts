import type { Command } from './protocol.js';

export interface CommandStore {
  get(id: string): Promise<Command | null>;
  transaction<T>(id: string, update: (current: Command | null) => { value: T; next?: Command }): Promise<T>;
  candidates(limit: number): Promise<Command[]>;
}
// An Admin Firestore instance is injected by Cloud Functions, never shipped to the Mac.
export function firestoreStore(db: any, companyId: string): CommandStore {
  const commands = db.collection('paperclipTransport').doc(companyId).collection('commands');
  return {
    async get(id) { const snap = await commands.doc(id).get(); return snap.exists ? snap.data() as Command : null; },
    async transaction(id, update) {
      return db.runTransaction(async (tx: any) => {
        const ref = commands.doc(id), snap = await tx.get(ref);
        const outcome = update(snap.exists ? snap.data() as Command : null);
        if (outcome.next) tx.set(ref, outcome.next);
        return outcome.value;
      });
    },
    async candidates(limit) {
      const snap = await commands.where('state', 'in', ['pending', 'claimed', 'applying']).orderBy('createdAt').limit(limit).get();
      return snap.docs.map((doc: any) => doc.data() as Command);
    },
  };
}
