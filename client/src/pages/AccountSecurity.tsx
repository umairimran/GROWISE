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
import { HeroBadge, InlineNotice, Panel, StatusPill, WorkspaceFrame } from "../components/workspace";
import { useAuthStore } from "../state/authStore";

type UserSessionResponse = components["schemas"]["UserSessionResponse"];

const DELETE_CONFIRMATION_TEXT = "DELETE";

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
      [...sessions].sort((left, right) => {
        if (left.session_id === currentSessionId) {
          return -1;
        }

        if (right.session_id === currentSessionId) {
          return 1;
        }

        return Date.parse(right.last_activity) - Date.parse(left.last_activity);
      }),
    [currentSessionId, sessions],
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
        currentSessions.filter((session) => session.session_id !== sessionId),
      );
      setSessionsSuccess(
        sessionId === currentSessionId
          ? "Current session revoked. Redirecting to login."
          : "Session revoked successfully.",
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
      <Panel className="p-10 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">Loading account settings...</p>
      </Panel>
    );
  }

  return (
    <WorkspaceFrame
      label={<HeroBadge text="Settings" />}
      title="Account and security"
      description="Manage your profile, password, active sessions, and account access without leaving the workspace shell."
      actions={
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="neutral">{email}</StatusPill>
          <Button size="sm" variant="outline" onClick={() => void refreshSessions()} isLoading={isSessionsRefreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh sessions
          </Button>
        </div>
      }
      className="py-4"
    >
      {pageError && (
        <InlineNotice
          tone="error"
          title="Account data could not be loaded"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsInitialLoading(true);
                void loadAccountData();
              }}
            >
              Retry
            </Button>
          }
        >
          {pageError}
        </InlineNotice>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-primary" />
                <div className="metric-label">Profile</div>
              </div>
              <h2 className="mt-3 font-display text-3xl font-semibold text-contrast">Identity</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Keep your name and email aligned with the rest of the product.
              </p>
            </div>
            <StatusPill tone="accent">Primary account</StatusPill>
          </div>

          <form onSubmit={handleProfileSubmit} className="mt-8 space-y-5">
            {profileError && (
              <InlineNotice tone="error" title="Profile update failed">
                {profileError}
              </InlineNotice>
            )}
            {profileSuccess && (
              <InlineNotice tone="success" title="Profile saved">
                {profileSuccess}
              </InlineNotice>
            )}

            <div>
              <label htmlFor="account-full-name" className="field-label">
                Full name
              </label>
              <input
                id="account-full-name"
                type="text"
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="field-input"
              />
            </div>

            <div>
              <label htmlFor="account-email" className="field-label">
                Email address
              </label>
              <input
                id="account-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field-input"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="submit" isLoading={isProfileSaving}>
                Save profile
              </Button>
              <StatusPill tone="neutral">Used across auth, dashboard, and reports</StatusPill>
            </div>
          </form>
        </Panel>

        <Panel className="p-6 sm:p-7" muted>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <div className="metric-label">Credential update</div>
              </div>
              <h2 className="mt-3 font-display text-3xl font-semibold text-contrast">Password</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Keep your account secure with a direct password change flow and clear validation.
              </p>
            </div>
            <StatusPill tone="neutral">Min 8 characters</StatusPill>
          </div>

          <form onSubmit={handlePasswordSubmit} className="mt-8 space-y-5">
            {passwordError && (
              <InlineNotice tone="error" title="Password update failed">
                {passwordError}
              </InlineNotice>
            )}
            {passwordSuccess && (
              <InlineNotice tone="success" title="Password updated">
                {passwordSuccess}
              </InlineNotice>
            )}

            <div>
              <label htmlFor="old-password" className="field-label">
                Current password
              </label>
              <input
                id="old-password"
                type="password"
                required
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
                className="field-input"
              />
            </div>

            <div>
              <label htmlFor="new-password" className="field-label">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                minLength={8}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="field-input"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="field-label">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="field-input"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="submit" isLoading={isPasswordSaving}>
                Update password
              </Button>
              <StatusPill tone="neutral">Session aware</StatusPill>
            </div>
          </form>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <Panel className="p-6 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Laptop2 className="h-4 w-4 text-primary" />
                <div className="metric-label">Sessions</div>
              </div>
              <h2 className="mt-3 font-display text-3xl font-semibold text-contrast">Active devices</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Review and revoke active sessions without wrapping the whole page in a single card.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRevokeAllSessions(true)}
                isLoading={isRevokingAll}
              >
                Revoke others
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => void handleRevokeAllSessions(false)}
                isLoading={isRevokingAll}
              >
                Revoke all
              </Button>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {sessionsError && (
              <InlineNotice tone="error" title="Session action failed">
                {sessionsError}
              </InlineNotice>
            )}
            {sessionsSuccess && (
              <InlineNotice tone="success" title="Session update">
                {sessionsSuccess}
              </InlineNotice>
            )}

            {sortedSessions.length === 0 ? (
              <Panel className="p-8 text-center" muted>
                <Laptop2 className="mx-auto h-8 w-8 text-muted-foreground" />
                <h3 className="mt-4 font-display text-2xl font-semibold text-contrast">No active sessions</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Sessions will appear here once you sign in from a device.
                </p>
              </Panel>
            ) : (
              sortedSessions.map((session) => {
                const isCurrentSession = session.session_id === currentSessionId;

                return (
                  <div key={session.session_id} className="rounded-[24px] border border-border bg-surface/75 p-4 shadow-soft">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-contrast">
                            {truncateSessionId(session.session_id)}
                          </span>
                          {isCurrentSession && <StatusPill tone="accent">Current session</StatusPill>}
                        </div>
                        <p className="mt-2 break-all text-sm leading-6 text-muted-foreground">
                          {session.user_agent || "Unknown device"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={isCurrentSession ? "ghost" : "outline"}
                        isLoading={revokingSessionId === session.session_id}
                        onClick={() => void handleRevokeSession(session.session_id)}
                      >
                        {isCurrentSession ? "Log out this device" : "Revoke"}
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-3 text-xs uppercase tracking-[0.14em] text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <div className="metric-label">IP</div>
                        <div className="mt-2 text-[0.76rem] text-contrast">{session.ip_address || "Unknown"}</div>
                      </div>
                      <div>
                        <div className="metric-label">Created</div>
                        <div className="mt-2 text-[0.76rem] text-contrast">{formatDateTime(session.created_at)}</div>
                      </div>
                      <div>
                        <div className="metric-label">Last activity</div>
                        <div className="mt-2 text-[0.76rem] text-contrast">{formatDateTime(session.last_activity)}</div>
                      </div>
                      <div>
                        <div className="metric-label">Expires</div>
                        <div className="mt-2 text-[0.76rem] text-contrast">{formatDateTime(session.expires_at)}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        <Panel className="p-6 sm:p-7" tone="danger">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/12 text-danger">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <div className="metric-label text-danger">Danger zone</div>
              <h2 className="mt-3 font-display text-3xl font-semibold text-contrast">Delete account</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This permanently deactivates your account and revokes all active sessions.
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-5">
            {deleteError && (
              <InlineNotice tone="error" title="Delete account failed">
                {deleteError}
              </InlineNotice>
            )}

            <div>
              <label htmlFor="delete-confirmation" className="field-label">
                Type "{DELETE_CONFIRMATION_TEXT}" to confirm
              </label>
              <input
                id="delete-confirmation"
                type="text"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                className="field-input"
              />
            </div>

            <div className="rounded-[20px] border border-danger/18 bg-danger/8 px-4 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-danger" />
                <p className="text-sm leading-6 text-muted-foreground">
                  This cannot be undone. Your progress, sessions, and account access will be removed.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="danger"
                onClick={() => void handleDeleteAccount()}
                isLoading={isDeletingAccount}
              >
                Delete account
              </Button>
              <StatusPill tone="danger">Permanent action</StatusPill>
            </div>
          </div>
        </Panel>
      </div>
    </WorkspaceFrame>
  );
};
