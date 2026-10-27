import fs from 'node:fs';
import path from 'node:path';

/**
 * In-memory document store, one collection per API resource.
 *
 * Records keep their insertion order so cursor pagination is stable, and each
 * record remembers the parent it was created under (`/api/invoices/{id}/
 * invoice_line_items` and friends) even when the resource schema has no
 * foreign-key field of its own.
 */
export class Store {
  constructor({ persistPath = null } = {}) {
    /** @type {Map<string, Map<string, {id:string,record:object,parent:object|null,seq:number}>>} */
    this.collections = new Map();
    this.persistPath = persistPath;
    this.seq = 0;
  }

  collection(resource) {
    if (!this.collections.has(resource)) this.collections.set(resource, new Map());
    return this.collections.get(resource);
  }

  insert(resource, record, parent = null) {
    this.seq += 1;
    const entry = { id: record.id, record, parent, seq: this.seq };
    this.collection(resource).set(record.id, entry);
    return record;
  }

  getEntry(resource, id) {
    return this.collection(resource).get(id) || null;
  }

  get(resource, id) {
    return this.getEntry(resource, id)?.record || null;
  }

  update(resource, id, patch) {
    const entry = this.getEntry(resource, id);
    if (!entry) return null;
    entry.record = patch;
    return entry.record;
  }

  remove(resource, id) {
    const entry = this.getEntry(resource, id);
    if (!entry) return null;
    this.collection(resource).delete(id);
    return entry.record;
  }

  /** Every entry in a collection, oldest first. */
  entries(resource) {
    return [...this.collection(resource).values()].sort((a, b) => a.seq - b.seq);
  }

  count(resource) {
    return this.collection(resource).size;
  }

  stats() {
    return Object.fromEntries(
      [...this.collections.entries()].map(([name, map]) => [name, map.size]).sort()
    );
  }

  toJSON() {
    return {
      seq: this.seq,
      collections: Object.fromEntries(
        [...this.collections.entries()].map(([name, map]) => [name, [...map.values()]])
      ),
    };
  }

  save(target = this.persistPath) {
    if (!target) return false;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(this.toJSON()));
    return true;
  }

  load(target = this.persistPath) {
    if (!target || !fs.existsSync(target)) return false;
    const snapshot = JSON.parse(fs.readFileSync(target, 'utf8'));
    this.collections = new Map(
      Object.entries(snapshot.collections || {}).map(([name, list]) => [
        name,
        new Map(list.map((entry) => [entry.id, entry])),
      ])
    );
    this.seq = snapshot.seq || 0;
    return true;
  }
}
