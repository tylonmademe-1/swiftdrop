import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';

export interface DeviceRow {
  id: string;
  user_id: string;
  user_defined_label: string;
  metadata: string | null;
  created_at: number;
  last_seen_at: number;
  revoked_at: number | null;
}

export class DeviceRepository {
  constructor(private db: DatabaseSync) {}

  public listUserDevices(userId: string): DeviceRow[] {
    return this.db.prepare(`
      SELECT * FROM devices
      WHERE user_id = ? AND revoked_at IS NULL
      ORDER BY last_seen_at DESC
    `).all(userId) as unknown as DeviceRow[];
  }

  public saveDevice(userId: string, label: string, metadata?: string): DeviceRow {
    const id = crypto.randomUUID();
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO devices (id, user_id, user_defined_label, metadata, created_at, last_seen_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `).run(id, userId, label.trim(), metadata || null, now, now);

    return this.db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as unknown as DeviceRow;
  }

  public updateDeviceLabel(deviceId: string, userId: string, label: string): boolean {
    const result = this.db.prepare(`
      UPDATE devices SET user_defined_label = ?
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL
    `).run(label.trim(), deviceId, userId);
    return Number(result.changes) > 0;
  }

  public deleteDevice(deviceId: string, userId: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM devices WHERE id = ? AND user_id = ?
    `).run(deviceId, userId);
    return Number(result.changes) > 0;
  }

  public touchDevice(deviceId: string): void {
    this.db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(Date.now(), deviceId);
  }
}
