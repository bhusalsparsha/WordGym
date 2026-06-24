declare interface D1Database {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      all<T = unknown>(): Promise<{ results: T[] }>;
      first<T = unknown>(): Promise<T | null>;
    };
  };
}

declare interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  setAlarm(timestamp: number): Promise<void>;
}

declare interface DurableObjectState {
  storage: DurableObjectStorage;
}

declare interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

declare interface DurableObjectId {}

declare interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

declare interface KVNamespace {}

declare interface Queue {}

declare interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

declare interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}
