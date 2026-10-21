import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';

export interface TransferFileRow {
  id: string;
  transfer_id: string;
  original_filename: string;
  declared_size: number;
  mime_type: string | null;
  verification_status: string;
  transfer_status: string;
  saved_status: string;
  created_at: number;
}

export interface TransferRow {
  id: string;
  owner_user_id: string | null;
  session_id: string | null;
  direction: 'sent' | 'received';
  status: 'completed' | 'failed' | 'cancelled' | 'in_progress';
  started_at: number;
  completed_at: number | null;
  failed_at: number | null;
  total_bytes: number;
  file_count: number;
  sender_device_label: string | null;
  receiver_device_label: string | null;
  failure_code: string | null;
}

export interface TransferDetails extends TransferRow {
  files: TransferFileRow[];
}

export class TransferRepository {
  constructor(private db: DatabaseSync) {}

  public createTransfer(
    ownerUserId: string | null,
    sessionId: string | null,
    direction: 'sent' | 'received',
    files: Array<{ name: string; size: number; mimeType?: string }>,
    senderDeviceLabel?: string,
    receiverDeviceLabel?: string
  ): TransferDetails {
    const transferId = crypto.randomUUID();
    const now = Date.now();
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

    // Insert transfer record
    this.db.prepare(`
      INSERT INTO transfers (
        id, owner_user_id, session_id, direction, status, started_at,
        total_bytes, file_count, sender_device_label, receiver_device_label
      ) VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?)
    `).run(
      transferId,
      ownerUserId || null,
      sessionId || null,
      direction,
      now,
      totalBytes,
      files.length,
      senderDeviceLabel || null,
      receiverDeviceLabel || null
    );

    // Insert file records
    const insertFileStmt = this.db.prepare(`
      INSERT INTO transfer_files (
        id, transfer_id, original_filename, declared_size, mime_type,
        verification_status, transfer_status, saved_status, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', 'pending', 'unknown', ?)
    `);

    const createdFiles: TransferFileRow[] = [];
    for (const f of files) {
      const fileId = crypto.randomUUID();
      insertFileStmt.run(fileId, transferId, f.name, f.size, f.mimeType || null, now);
      createdFiles.push({
        id: fileId,
        transfer_id: transferId,
        original_filename: f.name,
        declared_size: f.size,
        mime_type: f.mimeType || null,
        verification_status: 'pending',
        transfer_status: 'pending',
        saved_status: 'unknown',
        created_at: now
      });
    }

    const row = this.db.prepare('SELECT * FROM transfers WHERE id = ?').get(transferId) as unknown as TransferRow;
    return {
      ...row,
      files: createdFiles
    };
  }

  public updateTransferStatus(
    transferId: string,
    status: 'completed' | 'failed' | 'cancelled',
    totalBytes?: number,
    failureCode?: string
  ): void {
    const now = Date.now();
    const completedAt = status === 'completed' ? now : null;
    const failedAt = status === 'failed' || status === 'cancelled' ? now : null;

    if (totalBytes !== undefined) {
      this.db.prepare(`
        UPDATE transfers
        SET status = ?, completed_at = COALESCE(?, completed_at), failed_at = COALESCE(?, failed_at),
            total_bytes = ?, failure_code = ?
        WHERE id = ?
      `).run(status, completedAt, failedAt, totalBytes, failureCode || null, transferId);
    } else {
      this.db.prepare(`
        UPDATE transfers
        SET status = ?, completed_at = COALESCE(?, completed_at), failed_at = COALESCE(?, failed_at),
            failure_code = ?
        WHERE id = ?
      `).run(status, completedAt, failedAt, failureCode || null, transferId);
    }
  }

  public updateFileStatus(
    fileId: string,
    verificationStatus?: 'verified' | 'failed' | 'skipped',
    transferStatus?: 'completed' | 'failed' | 'cancelled',
    savedStatus?: 'saved' | 'download_initiated' | 'unknown'
  ): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (verificationStatus) {
      fields.push('verification_status = ?');
      values.push(verificationStatus);
    }
    if (transferStatus) {
      fields.push('transfer_status = ?');
      values.push(transferStatus);
    }
    if (savedStatus) {
      fields.push('saved_status = ?');
      values.push(savedStatus);
    }

    if (fields.length === 0) return;

    values.push(fileId);
    this.db.prepare(`UPDATE transfer_files SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  public getUserTransfers(
    userId: string,
    filters: {
      direction?: 'sent' | 'received';
      status?: 'completed' | 'failed' | 'cancelled';
      search?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): { transfers: TransferRow[]; totalCount: number } {
    let whereClause = 'WHERE owner_user_id = ?';
    const params: any[] = [userId];

    if (filters.direction) {
      whereClause += ' AND direction = ?';
      params.push(filters.direction);
    }
    if (filters.status) {
      whereClause += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.search) {
      whereClause += ` AND (
        id IN (SELECT transfer_id FROM transfer_files WHERE original_filename LIKE ?)
        OR sender_device_label LIKE ?
        OR receiver_device_label LIKE ?
      )`;
      const pattern = `%${filters.search}%`;
      params.push(pattern, pattern, pattern);
    }

    const countRow = this.db.prepare(`SELECT COUNT(*) as count FROM transfers ${whereClause}`).get(...params) as { count: number };
    const totalCount = Number(countRow?.count || 0);

    const limit = filters.limit || 20;
    const offset = filters.offset || 0;

    const transfers = this.db.prepare(`
      SELECT * FROM transfers
      ${whereClause}
      ORDER BY started_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as unknown as TransferRow[];

    return { transfers, totalCount };
  }

  public getTransferDetails(transferId: string, userId?: string): TransferDetails | null {
    let query = 'SELECT * FROM transfers WHERE id = ?';
    const params: any[] = [transferId];

    if (userId) {
      query += ' AND owner_user_id = ?';
      params.push(userId);
    }

    const transfer = this.db.prepare(query).get(...params) as unknown as TransferRow | undefined;
    if (!transfer) return null;

    const files = this.db.prepare(`
      SELECT * FROM transfer_files WHERE transfer_id = ? ORDER BY created_at ASC
    `).all(transferId) as unknown as TransferFileRow[];

    return {
      ...transfer,
      files
    };
  }

  public deleteTransfer(transferId: string, userId: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM transfers WHERE id = ? AND owner_user_id = ?
    `).run(transferId, userId);
    return Number(result.changes) > 0;
  }

  public clearUserHistory(userId: string): void {
    this.db.prepare('DELETE FROM transfers WHERE owner_user_id = ?').run(userId);
  }

  public getDashboardSummary(userId: string) {
    const successfulRow = this.db.prepare(`
      SELECT COUNT(*) as count FROM transfers WHERE owner_user_id = ? AND status = 'completed'
    `).get(userId) as { count: number };

    const sentRow = this.db.prepare(`
      SELECT COALESCE(SUM(total_bytes), 0) as total FROM transfers
      WHERE owner_user_id = ? AND direction = 'sent' AND status = 'completed'
    `).get(userId) as { total: number };

    const receivedRow = this.db.prepare(`
      SELECT COALESCE(SUM(total_bytes), 0) as total FROM transfers
      WHERE owner_user_id = ? AND direction = 'received' AND status = 'completed'
    `).get(userId) as { total: number };

    const failedRow = this.db.prepare(`
      SELECT COUNT(*) as count FROM transfers
      WHERE owner_user_id = ? AND status IN ('failed', 'cancelled')
    `).get(userId) as { count: number };

    const recentActivity = this.db.prepare(`
      SELECT * FROM transfers
      WHERE owner_user_id = ?
      ORDER BY started_at DESC
      LIMIT 5
    `).all(userId) as unknown as TransferRow[];

    return {
      successfulTransfers: Number(successfulRow?.count || 0),
      totalSentBytes: Number(sentRow?.total || 0),
      totalReceivedBytes: Number(receivedRow?.total || 0),
      failedOrCancelledTransfers: Number(failedRow?.count || 0),
      recentActivity
    };
  }
}
