import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/apiClient';
import { useToast } from '../components/Toast';
import {
  User,
  Shield,
  Eye,
  EyeOff,
  Download,
  Trash2,
  Lock,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export const SettingsPage: React.FC<{
  onNavigate: (route: string) => void;
  initialTab?: 'profile' | 'security' | 'privacy';
}> = ({ onNavigate, initialTab = 'profile' }) => {
  const { user, preferences, updatePreferences, refreshUser, logout } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'privacy'>(initialTab);

  // Profile Form
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Password Form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Delete Account
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setIsUpdatingProfile(true);
    try {
      await apiClient.updateProfile(displayName.trim());
      await refreshUser();
      showToast('Profile updated.', 'success');
    } catch {
      showToast('Failed to update profile', 'error');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    if (newPassword.length < 8) {
      showToast('New password must be at least 8 characters long.', 'error');
      return;
    }

    setIsChangingPassword(true);
    try {
      await apiClient.changePassword(currentPassword, newPassword);
      showToast('Password changed successfully.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      showToast(err?.message || 'Failed to change password', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleExportData = async () => {
    try {
      showToast('Exporting your account data...', 'info');
      await apiClient.exportUserData();
      showToast('Account data exported.', 'success');
    } catch {
      showToast('Could not export account data', 'error');
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      showToast('Please enter your password to confirm deletion.', 'error');
      return;
    }

    setIsDeleting(true);
    try {
      await apiClient.deleteAccount(deletePassword);
      showToast('Your account has been deleted.', 'info');
      await logout();
      onNavigate('home');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete account', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Settings & Privacy
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Manage your account profile, security keys, and data retention preferences.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-8 overflow-x-auto text-xs font-semibold gap-6">
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'profile'
              ? 'border-[#cc785c] text-[#cc785c]'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Profile
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`pb-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'security'
              ? 'border-[#cc785c] text-[#cc785c]'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Security
        </button>
        <button
          onClick={() => setActiveTab('privacy')}
          className={`pb-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'privacy'
              ? 'border-[#cc785c] text-[#cc785c]'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Privacy & Data
        </button>
      </div>

      {/* TAB 1: Profile */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-6 sm:p-8 max-w-xl">
          <h3 className="font-bold text-slate-900 text-base mb-1">Personal Profile</h3>
          <p className="text-xs text-slate-500 mb-6">Manage how your name appears to receiving devices.</p>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Display name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#cc785c]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email address</label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full px-4 py-2.5 text-sm bg-slate-100 text-slate-500 border border-slate-200 rounded-xl cursor-not-allowed"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Account email cannot be modified.</span>
            </div>

            <button
              type="submit"
              disabled={isUpdatingProfile}
              className="px-5 py-2.5 bg-[#cc785c] hover:bg-[#b8654a] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              {isUpdatingProfile ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: Security */}
      {activeTab === 'security' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-6 sm:p-8 max-w-xl">
          <h3 className="font-bold text-slate-900 text-base mb-1">Change Password</h3>
          <p className="text-xs text-slate-500 mb-6">Update your account password. Must be at least 8 characters.</p>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Current password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#cc785c]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">New password</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#cc785c]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm new password</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#cc785c]"
              />
            </div>

            <button
              type="submit"
              disabled={isChangingPassword}
              className="px-5 py-2.5 bg-[#cc785c] hover:bg-[#b8654a] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              {isChangingPassword ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: Privacy & Data Controls */}
      {activeTab === 'privacy' && (
        <div className="space-y-6 max-w-xl">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-6 sm:p-8 space-y-6">
            <div>
              <h3 className="font-bold text-slate-900 text-base mb-1">Transfer History Recording</h3>
              <p className="text-xs text-slate-500">
                Choose whether SwiftDrop records metadata for transfers associated with your account.
              </p>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
              <div>
                <p className="text-xs font-bold text-slate-800">Record Transfer History</p>
                <p className="text-[11px] text-slate-500">Keep metadata, filenames, and receipts in database</p>
              </div>

              <input
                type="checkbox"
                checked={preferences.saveTransferHistory}
                onChange={(e) => updatePreferences({ saveTransferHistory: e.target.checked })}
                className="w-5 h-5 accent-[#cc785c] rounded cursor-pointer"
              />
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-800">Export All Account Data</p>
                <p className="text-[11px] text-slate-500">Download a full JSON copy of your profile, preferences, devices, and transfer logs</p>
              </div>

              <button
                type="button"
                onClick={handleExportData}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
            </div>
          </div>

          {/* Delete Account Warning Box */}
          <div className="bg-rose-50/60 border border-rose-200 rounded-3xl p-6 sm:p-8">
            <h4 className="font-bold text-rose-900 text-sm mb-1">Danger Zone: Delete Account</h4>
            <p className="text-xs text-rose-700 mb-4 leading-relaxed">
              Permanently delete your SwiftDrop account, all associated login sessions, device labels, and transfer history. Note: This cannot delete files already saved onto physical devices.
            </p>

            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Delete account permanently
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141413]/40 backdrop-blur-2xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#e6dfd8] space-y-4">
            <div className="flex items-center gap-2.5 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-slate-900 text-base">Confirm Account Deletion</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              This action is permanent and irreversible. Please enter your account password to confirm deletion.
            </p>

            <input
              type="password"
              placeholder="Your account password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="w-full px-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-600"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting || !deletePassword}
                onClick={handleDeleteAccount}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
