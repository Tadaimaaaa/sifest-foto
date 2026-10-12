// @ts-ignore
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export type UploadStatus = 'PENDING' | 'UPLOADING' | 'COMPLETED' | 'FAILED';

export interface UploadJob {
  id: number;
  session_id: string;
  token: string;
  status: UploadStatus;
  created_at: string;
  updated_at: string;
}

class UploadQueue {
  private db: any;

  constructor() {
    const storagePath = process.env.STORAGE_PATH || '../storage';
    const absoluteStoragePath = path.resolve(process.cwd(), storagePath);
    
    // Ensure storage directory exists
    if (!fs.existsSync(absoluteStoragePath)) {
      fs.mkdirSync(absoluteStoragePath, { recursive: true });
    }

    const dbPath = path.join(absoluteStoragePath, 'uploads.db');
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        token TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  public addJob(sessionId: string): string {
    const token = uuidv4();
    try {
      const stmt = this.db.prepare(`
        INSERT INTO uploads (session_id, token, status)
        VALUES (?, ?, 'PENDING')
      `);
      stmt.run(sessionId, token);
      return token;
    } catch (err: any) {
      if (err.message.includes('UNIQUE constraint failed')) {
        // Return existing token if already added
        const stmt = this.db.prepare('SELECT token FROM uploads WHERE session_id = ?');
        const row = stmt.get(sessionId) as { token: string };
        return row.token;
      }
      throw err;
    }
  }

  public getPendingJobs(): UploadJob[] {
    const stmt = this.db.prepare(`
      SELECT * FROM uploads 
      WHERE status = 'PENDING' OR status = 'FAILED'
      ORDER BY updated_at ASC
    `);
    return stmt.all() as UploadJob[];
  }

  public updateStatus(sessionId: string, status: UploadStatus) {
    const stmt = this.db.prepare(`
      UPDATE uploads 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ?
    `);
    stmt.run(status, sessionId);
  }

  public getJobBySession(sessionId: string): UploadJob | undefined {
    const stmt = this.db.prepare('SELECT * FROM uploads WHERE session_id = ?');
    return stmt.get(sessionId) as UploadJob | undefined;
  }
  
  public getJobByToken(token: string): UploadJob | undefined {
    const stmt = this.db.prepare('SELECT * FROM uploads WHERE token = ?');
    return stmt.get(token) as UploadJob | undefined;
  }
}

// Singleton instance
export const uploadQueue = new UploadQueue();
