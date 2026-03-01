import { FC, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Laptop2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ApiHttpError } from "../api/http";
import { authService } from "../api/services/auth";
import type { components } from "../api/generated/openapi";
import { Button } from "../components/Button";
import { useAuthStore } from "../state/authStore";

type UserSessionResponse = components["schemas"]["UserSessionResponse"];

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiHttpError) {
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) {
    return "N/A";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "N/A";
  }

  return parsed.toLocaleString();
};

const truncateSessionId = (value: string): string => {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-8)}`;
};

const DELETE_CONFIRMATION_TEXT = "DELETE";

export const AccountSecurity: FC = () => {
  const navigate = useNavigate();
  const currentSessionId = useAuthStore((snapshot) => snapshot.session.sessionId);
  const authUser = useAuthStore((snapshot) => snapshot.currentUser);

  const [fullName, setFullName] = useState(authUser?.full_name ?? "");
  const [email, setEmail] = useState(authUser?.email ?? "");
  const [sessions, setSessions] = useState<UserSessionResponse[]>([]);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [isSessionsRefreshing, setIsSessionsRefreshing] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsSuccess, setSessionsSuccess] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [isRevokingAll, setIsRevokingAll] = useState(false);

  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadAccountData = useCallback(async () => {
    setPageError(null);

    try {
      const [me, activeSessions] = await Promise.all([authService.me(), authService.listSessions(true)]);
      setFullName(me.full_name);
      setEmail(me.email);
      setSessions(activeSessions);
    } catch (error) {
      setPageError(toErrorMessage(error, "Failed to load account details."));
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    setIsSessionsRefreshing(true);
    setSessionsError(null);

    try {
      const activeSessions = await authService.listSessions(true);
      setSessions(activeSessions);
    } catch (error) {
      setSessionsError(toErrorMessage(error, "Failed to refresh sessions."));
    } finally {
      setIsSessionsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAccountData();
  }, [loadAccountData]);

  useEffect(() => {
    if (!authUser) {
      return;
    }

    setFullName(authUser.full_name);
    setEmail(authUser.email);
  }, [authUser]);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        if (a.session_id === currentSessionId) {
          return -1;
        }
        if (b.session_id === currentSessionId) {
          return 1;
        }

        return Date.parse(b.last_activity) - Date.parse(a.last_activity);
      }),
    [currentSessionId, sessions]
  );

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextFullName = fullName.trim();
    const nextEmail = email.trim();
    if (!nextFullName || !nextEmail) {
      setProfileError("Full name and email are required.");
      return;
    }

    setIsProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(null);

    try {
      await authService.updateMe({
        full_name: nextFullName,
        email: nextEmail,
      });

      const me = await authService.me();
      setFullName(me.full_name);
      setEmail(me.email);
      setProfileSuccess("Profile updated successfully.");
    } catch (error) {
      setProfileError(toErrorMessage(error, "Failed to update your profile."));
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError("All password fields are required.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setIsPasswordSaving(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    try {
      await authService.changePassword({
        old_password: oldPassword,
        new_password: newPassword,
      });

      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password changed successfully.");
    } catch (error) {
      setPasswordError(toErrorMessage(error, "Failed to change password."));
    } finally {
      setIsPasswordSaving(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    setSessionsError(null);
    setSessionsSuccess(null);

    try {
      await authService.revokeSession(sessionId);
      setSessions((currentSessions) =>
        currentSessions.filter((session) => session.session_id !== sessionId)
      );
      setSessionsSuccess(
        sessionId === currentSessionId
          ? "Current session revoked. Redirecting to login."
          : "Session revoked successfully."
      );
    } catch (error) {
      setSessionsError(toErrorMessage(error, "Failed to revoke this session."));
    } finally {
      setRevokingSessionId(null);
    }
  };

  const handleRevokeAllSessions = async (exceptCurrent: boolean) => {
    const confirmationText = exceptCurrent
      ? "Revoke all other active sessions?"
      : "Revoke all active sessions (including this one)?";
    if (!window.confirm(confirmationText)) {
      return;
    }

    setIsRevokingAll(true);
    setSessionsError(null);
    setSessionsSuccess(null);

    try {
      await authService.revokeAllSessions(exceptCurrent);
      if (exceptCurrent) {
        await refreshSessions();
        setSessionsSuccess("All other sessions were revoked.");
      } else {
        setSessions([]);
        setSessionsSuccess("All sessions revoked. Redirecting to home.");
        navigate("/", { replace: true });
      }
    } catch (error) {
      setSessionsError(toErrorMessage(error, "Failed to revoke sessions."));
    } finally {
      setIsRevokingAll(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError(null);

    if (deleteConfirmation.trim().toUpperCase() !== DELETE_CONFIRMATION_TEXT) {
      setDeleteError(`Type "${DELETE_CONFIRMATION_TEXT}" to confirm account deletion.`);
      return;
    }

    if (!window.confirm("This action is permanent. Delete your account now?")) {
      return;
    }

    setIsDeletingAccount(true);

    try {
      await authService.deleteMe();
      navigate("/", { replace: true });
    } catch (error) {
      setDeleteError(toErrorMessage(error, "Failed to delete your account."));
      setIsDeletingAccount(false);
    }
  };

  if (isInitialLoading) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-500">Loading account settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-bold text-contrast">Account & Security</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your profile, password, active sessions, and account access.
            </p>
          </div>
        </div>
      </section>

      {pageError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-3">
          <span className="flex-1">{pageError}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setIsInitialLoading(true);
              void loadAccountData();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleProfileSubmit}
          className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-contrast">Profile</h2>
          </div>

          {profileError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {profileError}
            </p>
          )}
          {profileSuccess && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {profileSuccess}
            </p>
          )}

          <div>
            <label htmlFor="account-full-name" className="block text-sm font-medium text-gray-700 mb-1.5">
              Full name
            </label>
            <input
              id="account-full-name"
              type="text"
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div>
            <label htmlFor="account-email" className="block text-sm font-medium text-gray-700 mb-1.5">
              Email address
            </label>
            <input
              id="account-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div className="pt-2">
            <Button type="submit" isLoading={isProfileSaving}>
              Save profile
            </Button>
          </div>
        </form>

        <form
          onSubmit={handlePasswordSubmit}
          className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-contrast">Change password</h2>
          </div>

          {passwordError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {passwordError}
            </p>
          )}
          {passwordSuccess && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {passwordSuccess}
            </p>
          )}

          <div>
            <label htmlFor="old-password" className="block text-sm font-medium text-gray-700 mb-1.5">
              Current password
            </label>
            <input
              id="old-password"
              type="password"
              required
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1.5">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              minLength={8}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1.5">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div className="pt-2">
            <Button type="submit" isLoading={isPasswordSaving}>
              Update password
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Laptop2 className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-contrast">Active sessions</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshSessions()}
              isLoading={isSessionsRefreshing}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRevokeAllSessions(true)}
              isLoading={isRevokingAll}
            >
              Revoke Others
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleRevokeAllSessions(false)}
              isLoading={isRevokingAll}
            >
              Revoke All
            </Button>
          </div>
        </div>

        {sessionsError && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {sessionsError}
          </p>
        )}
        {sessionsSuccess && (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {sessionsSuccess}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {sortedSessions.length === 0 ? (
            <p className="text-sm text-gray-500">No active sessions found.</p>
          ) : (
            sortedSessions.map((session) => {
              const isCurrentSession = session.session_id === currentSessionId;
              return (
                <div
                  key={session.session_id}
                  className="rounded-xl border border-border px-4 py-3 bg-background/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-contrast">
                          {truncateSessionId(session.session_id)}
                        </span>
                        {isCurrentSession && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 break-all">
                        {session.user_agent || "Unknown device"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={isCurrentSession ? "ghost" : "outline"}
                      isLoading={revokingSessionId === session.session_id}
                      onClick={() => void handleRevokeSession(session.session_id)}
                    >
                      {isCurrentSession ? "Log Out This Device" : "Revoke"}
                    </Button>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-2 lg:grid-cols-4">
                    <div>IP: {session.ip_address || "Unknown"}</div>
                    <div>Created: {formatDateTime(session.created_at)}</div>
                    <div>Last activity: {formatDateTime(session.last_activity)}</div>
                    <div>Expires: {formatDateTime(session.expires_at)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-red-200 bg-red-50/70 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-red-100 p-2 text-red-700">
            <Trash2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-red-800">Delete account</h2>
            <p className="text-sm text-red-700 mt-1">
              This permanently deactivates your account and revokes all active sessions.
            </p>
          </div>
        </div>

        {deleteError && (
          <p className="mt-4 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {deleteError}
          </p>
        )}

        <div className="mt-4">
          <label htmlFor="delete-confirmation" className="block text-sm font-medium text-red-800 mb-1.5">
            Type "{DELETE_CONFIRMATION_TEXT}" to confirm
          </label>
          <input
            id="delete-confirmation"
            type="text"
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            className="block w-full max-w-sm rounded-lg border border-red-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
          />
        </div>

        <div className="mt-4">
          <Button
            type="button"
            variant="ghost"
            className="text-red-700 hover:text-red-700 hover:bg-red-100"
            onClick={() => void handleDeleteAccount()}
            isLoading={isDeletingAccount}
          >
            Delete Account
          </Button>
        </div>
      </section>
    </div>
  );
};
