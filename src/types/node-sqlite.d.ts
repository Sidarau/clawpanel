declare module 'node:sqlite' {
  export interface DatabaseSyncOptions {
    readOnly?: boolean
  }

  export interface StatementSync {
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown
    run(...params: unknown[]): unknown
  }

  export class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
