/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * A tiny in-memory IndexedDB covering what the photo album uses: open with
 * an upgrade, one object store keyed by a property, and get / getAll / put /
 * delete requests that complete asynchronously like the real thing.
 */

type Handler = (() => void) | null;

class FakeRequest<T> {
  result = undefined as T;
  error: unknown = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;
}

type Row = Record<string, unknown>;

class FakeStore {
  readonly rows = new Map<unknown, Row>();

  constructor(
    private readonly owner: FakeIndexedDB,
    readonly keyPath: string,
  ) {}

  createIndex(): void {}

  private respond<T>(compute: () => T): FakeRequest<T> {
    const request = new FakeRequest<T>();
    queueMicrotask(() => {
      if (this.owner.failRequests) {
        request.error = new Error('fake IndexedDB request failed');
        request.onerror?.();
        return;
      }
      request.result = compute();
      request.onsuccess?.();
    });
    return request;
  }

  getAll(): FakeRequest<Row[]> {
    return this.respond(() => [...this.rows.values()].map((row) => ({ ...row })));
  }

  get(key: unknown): FakeRequest<Row | undefined> {
    return this.respond(() => {
      const row = this.rows.get(key);
      return row ? { ...row } : undefined;
    });
  }

  put(value: Row): FakeRequest<unknown> {
    return this.respond(() => {
      this.rows.set(value[this.keyPath], { ...value });
      return value[this.keyPath];
    });
  }

  delete(key: unknown): FakeRequest<undefined> {
    return this.respond(() => {
      this.rows.delete(key);
      return undefined;
    });
  }
}

class FakeDatabase {
  readonly stores = new Map<string, FakeStore>();

  constructor(private readonly owner: FakeIndexedDB) {}

  createObjectStore(name: string, options: { keyPath: string }): FakeStore {
    const store = new FakeStore(this.owner, options.keyPath);
    this.stores.set(name, store);
    return store;
  }

  transaction(name: string): { objectStore: (store: string) => FakeStore } {
    return {
      objectStore: (store) => {
        const found = this.stores.get(store ?? name);
        if (!found) throw new Error(`no object store ${store}`);
        return found;
      },
    };
  }
}

export class FakeIndexedDB {
  readonly databases = new Map<string, FakeDatabase>();
  /** Make every request (not open) fail. */
  failRequests = false;
  /** Make open() fail. */
  failOpen = false;

  /** The object to install as `globalThis.indexedDB`. */
  readonly factory = {
    open: (name: string): FakeRequest<FakeDatabase> => {
      const request = new FakeRequest<FakeDatabase>();
      queueMicrotask(() => {
        if (this.failOpen) {
          request.error = new Error('fake IndexedDB open failed');
          request.onerror?.();
          return;
        }
        let database = this.databases.get(name);
        request.result = database ?? new FakeDatabase(this);
        if (!database) {
          database = request.result;
          this.databases.set(name, database);
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    },
  };

  /** Pre-populate a store (creating the database) before the module opens it. */
  seed(database: string, store: string, keyPath: string, rows: Row[]): void {
    const db = this.databases.get(database) ?? new FakeDatabase(this);
    this.databases.set(database, db);
    const target = db.stores.get(store) ?? db.createObjectStore(store, { keyPath });
    for (const row of rows) target.rows.set(row[keyPath], { ...row });
  }

  rows(database: string, store: string): Row[] {
    return [...(this.databases.get(database)?.stores.get(store)?.rows.values() ?? [])];
  }
}
