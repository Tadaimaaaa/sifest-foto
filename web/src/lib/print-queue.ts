// @ts-ignore
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

export type PrintStatus = 'PENDING' | 'PRINTING' | 'COMPLETED' | 'FAILED';

export interface PrintJob {
  id: number;
  session_id: string;
  status: PrintStatus;
  copies: number;
  slots?: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

class PrintQueue {
  private db: any;

  constructor() {
    const storagePath = process.env.STORAGE_PATH || '../storage';
    const absoluteStoragePath = path.resolve(process.cwd(), storagePath);
    
    if (!fs.existsSync(absoluteStoragePath)) {
      fs.mkdirSync(absoluteStoragePath, { recursive: true });
    }

    const dbPath = path.join(absoluteStoragePath, 'prints.db');
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        copies INTEGER NOT NULL,
        slots TEXT DEFAULT '1',
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Migrasi kolom slots jika tabel sudah ada dari sesi sebelumnya
    try {
      this.db.exec(`ALTER TABLE prints ADD COLUMN slots TEXT DEFAULT '1'`);
    } catch {}
    // Reset status PRINTING yang terputus agar tidak menggantung
    try {
      this.db.exec(`UPDATE prints SET status = 'FAILED' WHERE status = 'PRINTING'`);
    } catch {}
  }

  public addJob(sessionId: string, copies: number = 1, slots: string = '1'): PrintJob {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO prints (session_id, status, copies, slots)
        VALUES (?, 'PENDING', ?, ?)
      `);
      stmt.run(sessionId, copies, slots);
      return this.getJobBySession(sessionId)!;
    } catch (err: any) {
      if (err.message.includes('UNIQUE constraint failed')) {
        // Jika sesi yang sama dipencet lagi (misal user klik ulang 'CETAK FISIK'), reset ke PENDING dengan slot baru
        const updateStmt = this.db.prepare(`
          UPDATE prints 
          SET status = 'PENDING', copies = ?, slots = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE session_id = ?
        `);
        updateStmt.run(copies, slots, sessionId);
        return this.getJobBySession(sessionId)!;
      }
      throw err;
    }
  }

  public getPendingJobs(): PrintJob[] {
    const stmt = this.db.prepare(`
      SELECT * FROM prints 
      WHERE status = 'PENDING'
      ORDER BY updated_at ASC
    `);
    return stmt.all() as PrintJob[];
  }

  public updateStatus(sessionId: string, status: PrintStatus, errorMessage: string | null = null) {
    const stmt = this.db.prepare(`
      UPDATE prints 
      SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ?
    `);
    stmt.run(status, errorMessage, sessionId);
  }

  public getJobBySession(sessionId: string): PrintJob | undefined {
    const stmt = this.db.prepare('SELECT * FROM prints WHERE session_id = ?');
    return stmt.get(sessionId) as PrintJob | undefined;
  }
}

export const printQueue = new PrintQueue();
