import { FC, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  ChevronRight,
  Loader2,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import { adminService, Track } from "../../api/services/admin";

export const TrackList: FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Track | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.listTracks();
      setTracks(data);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (track: Track) => {
    setDeleting(track.track_id);
    try {
      await adminService.deleteTrack(track.track_id);
      setTracks((prev) => prev.filter((t) => t.track_id !== track.track_id));
    } catch (e: unknown) {
      alert(`Delete failed: ${(e as Error).message}`);
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Tracks</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage learning tracks and their assessment dimensions
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={() => navigate("/admin/tracks/new")}
            className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            <Plus className="w-4 h-4" />
            New Track
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading tracks...
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center h-40 gap-3">
          <AlertCircle className="w-6 h-6 text-red-400" />
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={load} className="text-sm text-emerald-600 hover:underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && tracks.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-400">
          <BookOpen className="w-8 h-8" />
          <p className="text-sm">No tracks yet.</p>
          <button
            onClick={() => navigate("/admin/tracks/new")}
            className="text-sm text-emerald-600 hover:underline"
          >
            Create the first track
          </button>
        </div>
      )}

      {!loading && !error && tracks.length > 0 && (
        <div className="space-y-3">
          {tracks.map((track) => (
            <div
              key={track.track_id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-start gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono">#{track.track_id}</span>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {track.track_name}
                  </h3>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {track.description}
                </p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => navigate(`/admin/tracks/${track.track_id}`)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
                <button
                  onClick={() => navigate(`/admin/tracks/${track.track_id}`)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
                >
                  Dimensions
                  <ChevronRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setConfirmDelete(track)}
                  disabled={deleting === track.track_id}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors"
                >
                  {deleting === track.track_id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Delete Track?
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Are you sure you want to delete{" "}
              <strong className="text-gray-900 dark:text-gray-100">
                {confirmDelete.track_name}
              </strong>
              ? This will delete all associated assessment data, learning paths, and knowledge base
              entries.
            </p>
            <div className="flex gap-3 mt-5 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
