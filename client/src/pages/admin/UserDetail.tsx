import { FC, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Shield,
  User,
  Loader2,
  AlertCircle,
  LogOut,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { adminService, AdminUser } from "../../api/services/admin";
import { useAuthStore } from "../../state/authStore";

export const UserDetail: FC = () => {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const navigate = useNavigate();

  const currentUser = useAuthStore((s) => s.currentUser);
  const isSelf = currentUser?.user_id === userId;

  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const u = await adminService.getUser(userId);
        setUser(u);
      } catch (e: unknown) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const doAction = async (fn: () => Promise<unknown>, successMsg: string) => {
    setWorking(true);
    setActionMsg(null);
    try {
      await fn();
      setActionMsg({ type: "ok", text: successMsg });
      // reload
      const u = await adminService.getUser(userId);
      setUser(u);
    } catch (e: unknown) {
      setActionMsg({ type: "err", text: (e as Error).message });
    } finally {
      setWorking(false);
    }
  };

  const handleRoleToggle = () => {
    if (!user) return;
    const newRole = user.role === "admin" ? "user" : "admin";
    doAction(
      () => adminService.updateUserRole(userId, newRole),
      `Role changed to ${newRole}.`
    );
  };

  const handleForceLogout = () => {
    doAction(() => adminService.forceLogoutUser(userId), "All sessions revoked.");
  };

  const handleDelete = async () => {
    setWorking(true);
    try {
      await adminService.deleteUser(userId);
      navigate("/admin/users");
    } catch (e: unknown) {
      setActionMsg({ type: "err", text: (e as Error).message });
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading user...
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-500">{error ?? "User not found"}</p>
        <button onClick={() => navigate("/admin/users")} className="text-sm text-emerald-600 hover:underline">
          Back to users
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/admin/users")}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{user.full_name}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{user.email}</p>
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
              {user.full_name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{user.full_name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {user.role === "admin" ? (
                <Shield className="w-3.5 h-3.5 text-purple-500" />
              ) : (
                <User className="w-3.5 h-3.5 text-gray-400" />
              )}
              <span
                className={`text-xs font-semibold ${
                  user.role === "admin"
                    ? "text-purple-700 dark:text-purple-400"
                    : "text-gray-500"
                }`}
              >
                {user.role}
              </span>
              {isSelf && (
                <span className="text-xs text-gray-400">(you)</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400">User ID</p>
            <p className="font-medium text-gray-800 dark:text-gray-200">#{user.user_id}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Joined</p>
            <p className="font-medium text-gray-800 dark:text-gray-200">
              {new Date(user.created_at).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Active Sessions</p>
            <p className="font-medium text-gray-800 dark:text-gray-200">
              {user.active_sessions_count ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Last Login</p>
            <p className="font-medium text-gray-800 dark:text-gray-200">
              {user.last_login ? new Date(user.last_login).toLocaleString() : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            actionMsg.type === "ok"
              ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
          }`}
        >
          {actionMsg.type === "ok" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {actionMsg.text}
        </div>
      )}

      {/* Actions */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Actions</h3>

        {/* Role toggle */}
        <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {user.role === "admin" ? "Demote to User" : "Promote to Admin"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {user.role === "admin"
                ? "Remove admin privileges from this account."
                : "Grant full admin access to this account."}
            </p>
          </div>
          <button
            onClick={handleRoleToggle}
            disabled={working || isSelf}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              user.role === "admin"
                ? "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                : "bg-purple-600 hover:bg-purple-700 text-white"
            } disabled:opacity-50`}
          >
            {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {user.role === "admin" ? "Demote" : "Promote"}
          </button>
        </div>

        {/* Force logout */}
        <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Force Logout</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Revoke all active sessions — user will need to log in again.
            </p>
          </div>
          <button
            onClick={handleForceLogout}
            disabled={working}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 font-medium disabled:opacity-50"
          >
            {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            Force Logout
          </button>
        </div>

        {/* Delete user */}
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete Account</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Permanently delete this user and all their data.
            </p>
          </div>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={working || isSelf}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Delete Account?
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              This will permanently delete{" "}
              <strong className="text-gray-900 dark:text-gray-100">{user.full_name}</strong> and
              all their learning data. This cannot be undone.
            </p>
            <div className="flex gap-3 mt-5 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={working}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium"
              >
                {working && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
