import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { useToast } from '../components/Toast';
import {
  Laptop,
  Smartphone,
  Plus,
  Trash2,
  Edit2,
  LogOut,
  Shield,
  Info,
  CheckCircle2,
  Clock
} from 'lucide-react';

export const DevicesPage: React.FC = () => {
  const { showToast } = useToast();

  // Saved Devices
  const [devices, setDevices] = useState<any[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [isAddingDevice, setIsAddingDevice] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState('');

  // Active Login Sessions
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [devData, sessData] = await Promise.all([
        apiClient.fetchDevices(),
        apiClient.fetchSessions()
      ]);
      setDevices(devData.devices || []);
      setSessions(sessData.sessions || []);
      setCurrentSessionId(sessData.currentSessionId || null);
    } catch {
      showToast('Failed to load device & session details', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;

    try {
      const res = await apiClient.saveDevice(newLabel.trim());
      setDevices((prev) => [res.device, ...prev]);
      setNewLabel('');
      setIsAddingDevice(false);
      showToast('Saved device label added.', 'success');
    } catch {
      showToast('Could not save device label', 'error');
    }
  };

  const handleUpdateLabel = async (id: string) => {
    if (!editLabelValue.trim()) return;
    try {
      await apiClient.updateDevice(id, editLabelValue.trim());
      setDevices((prev) =>
        prev.map((d) => (d.id === id ? { ...d, user_defined_label: editLabelValue.trim() } : d))
      );
      setEditingDeviceId(null);
      showToast('Device label updated.', 'success');
    } catch {
      showToast('Could not update device label', 'error');
    }
  };

  const handleDeleteDevice = async (id: string) => {
    try {
      await apiClient.deleteDevice(id);
      setDevices((prev) => prev.filter((d) => d.id !== id));
      showToast('Device label removed.', 'success');
    } catch {
      showToast('Could not remove device', 'error');
    }
  };

  const handleRevokeSession = async (id: string) => {
    try {
      await apiClient.revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      showToast('Session revoked.', 'success');
    } catch {
      showToast('Failed to revoke session', 'error');
    }
  };

  const handleLogoutOtherSessions = async () => {
    try {
      await apiClient.logoutOtherSessions();
      setSessions((prev) => prev.filter((s) => s.isCurrent));
      showToast('All other sessions signed out.', 'success');
    } catch {
      showToast('Failed to sign out other sessions', 'error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Devices & Sessions
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Manage your saved device display labels and active account login sessions.
        </p>
      </div>

      {/* Educational Notice Banner */}
      <div className="bg-[#f5f0e8] border border-[#e6dfd8] rounded-2xl p-4 flex items-start gap-3 text-xs text-[#141413] leading-relaxed">
        <Info className="w-4 h-4 text-[#cc785c] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Device & Session Boundaries:</p>
          <ul className="list-disc list-inside space-y-0.5 text-[#6c6a64]">
            <li><strong>Saved Device Labels</strong> are custom shortcuts for naming your frequent hardware.</li>
            <li><strong>Active Login Sessions</strong> are cryptographic tokens authorized to access your account.</li>
            <li><strong>File-Transfer Connections</strong> are short-lived WebRTC channels created on-demand per transfer.</li>
          </ul>
        </div>
      </div>

      {/* SECTION 1: Saved Device Labels */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Saved Device Labels</h3>
            <p className="text-[11px] text-slate-500">Convenient custom names for sender/receiver identification</p>
          </div>

          <button
            onClick={() => setIsAddingDevice(!isAddingDevice)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#cc785c] hover:bg-[#b8654a] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add device label</span>
          </button>
        </div>

        {isAddingDevice && (
          <form onSubmit={handleAddDevice} className="p-4 bg-slate-50 border-b border-slate-100 flex gap-2">
            <input
              type="text"
              required
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Work MacBook, Living Room Tablet, Pixel 8"
              className="flex-1 px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#cc785c]"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#cc785c] hover:bg-[#b8674d] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsAddingDevice(false)}
              className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
            >
              Cancel
            </button>
          </form>
        )}

        <div className="divide-y divide-slate-100">
          {devices.length > 0 ? (
            devices.map((dev) => (
              <div key={dev.id} className="px-6 py-3.5 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <Laptop className="w-4 h-4 text-slate-400 shrink-0" />
                  {editingDeviceId === dev.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editLabelValue}
                        onChange={(e) => setEditLabelValue(e.target.value)}
                        className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg"
                      />
                      <button
                        onClick={() => handleUpdateLabel(dev.id)}
                        className="text-xs text-[#cc785c] font-semibold px-2 py-1 cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingDeviceId(null)}
                        className="text-xs text-slate-500 px-2 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="font-semibold text-slate-800">{dev.user_defined_label}</p>
                      <p className="text-[11px] text-slate-400">
                        Added {new Date(dev.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingDeviceId(dev.id);
                      setEditLabelValue(dev.user_defined_label);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                    title="Edit label"
                    aria-label="Edit device label"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteDevice(dev.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                    title="Remove label"
                    aria-label="Remove device label"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              No custom device labels saved yet.
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: Active Account Login Sessions */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Active Account Login Sessions</h3>
            <p className="text-[11px] text-slate-500">Devices currently authenticated to your SwiftDrop account</p>
          </div>

          {sessions.length > 1 && (
            <button
              onClick={handleLogoutOtherSessions}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out other sessions</span>
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-100">
          {sessions.map((s) => (
            <div key={s.id} className="px-6 py-4 flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.isCurrent ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                  <Shield className="w-4 h-4" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-800 truncate">
                      {s.deviceLabel ? s.deviceLabel.slice(0, 40) : 'Web Session'}
                    </p>
                    {s.isCurrent && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                        This Device
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 font-mono tabular-nums mt-0.5">
                    <Clock className="w-3 h-3 text-slate-300" />
                    <span>Last active: {new Date(s.lastSeenAt).toLocaleString()}</span>
                  </p>
                </div>
              </div>

              {!s.isCurrent && (
                <button
                  onClick={() => handleRevokeSession(s.id)}
                  className="px-3 py-1 text-[11px] text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg transition-colors"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
