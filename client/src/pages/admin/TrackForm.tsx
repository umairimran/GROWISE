import { FC, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { adminService, Track, Dimension } from "../../api/services/admin";

// ---------------------------------------------------------------------------
// Dimension row
// ---------------------------------------------------------------------------
interface DimRowProps {
  dim: Dimension;
  onEdit: (d: Dimension) => void;
  onDelete: (id: number) => void;
}

const DimRow: FC<DimRowProps> = ({ dim, onEdit, onDelete }) => (
  <div className="flex items-start gap-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
          {dim.code}
        </span>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{dim.name}</span>
        <span className="text-xs text-gray-400">w={dim.weight}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
        {dim.description}
      </p>
    </div>
    <div className="flex gap-1 flex-shrink-0">
      <button
        onClick={() => onEdit(dim)}
        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onDelete(dim.dimension_id)}
        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Dimension form modal
// ---------------------------------------------------------------------------
interface DimFormProps {
  trackId: number;
  existing?: Dimension;
  onClose: () => void;
  onSaved: (d: Dimension) => void;
}

const DimFormModal: FC<DimFormProps> = ({ trackId, existing, onClose, onSaved }) => {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [weight, setWeight] = useState(String(existing?.weight ?? "0.2"));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim() || !description.trim()) {
      setErr("Name and description are required.");
      return;
    }
    const w = parseFloat(weight);
    if (isNaN(w) || w < 0 || w > 1) {
      setErr("Weight must be between 0 and 1.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      let saved: Dimension;
      if (existing) {
        saved = await adminService.updateDimension(existing.dimension_id, {
          name,
          description,
          weight: w,
        });
      } else {
        saved = await adminService.createDimension(trackId, { name, description, weight: w });
      }
      onSaved(saved);
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {existing ? "Edit Dimension" : "Add Dimension"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. Problem Solving"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              placeholder="What this dimension measures..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Weight (0–1, e.g. 0.2 = 20%)
            </label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {err && (
          <p className="mt-3 text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            {err}
          </p>
        )}

        <div className="flex gap-3 mt-5 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export const TrackForm: FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const trackId = isNew ? null : Number(id);
  const navigate = useNavigate();

  const [trackName, setTrackName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [dimsLoading, setDimsLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenMsg, setRegenMsg] = useState<string | null>(null);

  const [dimModal, setDimModal] = useState<{ open: boolean; existing?: Dimension }>({
    open: false,
  });

  // Load existing track data
  useEffect(() => {
    if (!trackId) return;
    adminService.listTracks().then((tracks) => {
      const t = tracks.find((x) => x.track_id === trackId);
      if (t) {
        setTrackName(t.track_name);
        setDescription(t.description);
      }
    });
    loadDimensions();
  }, [trackId]);

  const loadDimensions = async () => {
    if (!trackId) return;
    setDimsLoading(true);
    try {
      const dims = await adminService.getDimensions(trackId);
      setDimensions(dims);
    } catch {
      // ignore
    } finally {
      setDimsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!trackName.trim() || !description.trim()) {
      setSaveError("Track name and description are required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      if (isNew) {
        const created = await adminService.createTrack({
          track_name: trackName,
          description,
        });
        setSaveSuccess(true);
        setTimeout(() => navigate(`/admin/tracks/${created.track_id}`), 800);
      } else if (trackId) {
        await adminService.updateTrack(trackId, { track_name: trackName, description });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch (e: unknown) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!trackId) return;
    setRegenerating(true);
    setRegenMsg(null);
    try {
      const res = await adminService.regenerateDimensions(trackId);
      setRegenMsg(res.message + " Reload in a few seconds to see the new dimensions.");
      setTimeout(() => loadDimensions(), 5000);
    } catch (e: unknown) {
      setRegenMsg(`Error: ${(e as Error).message}`);
    } finally {
      setRegenerating(false);
    }
  };

  const handleDeleteDimension = async (dimId: number) => {
    try {
      await adminService.deleteDimension(dimId);
      setDimensions((prev) => prev.filter((d) => d.dimension_id !== dimId));
    } catch (e: unknown) {
      alert(`Delete failed: ${(e as Error).message}`);
    }
  };

  const handleDimSaved = (dim: Dimension) => {
    setDimensions((prev) => {
      const idx = prev.findIndex((d) => d.dimension_id === dim.dimension_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = dim;
        return next;
      }
      return [...prev, dim];
    });
    setDimModal({ open: false });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/admin/tracks")}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {isNew ? "New Track" : "Edit Track"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {isNew
              ? "AI will auto-generate assessment dimensions after creation."
              : "Update track details and manage its assessment dimensions."}
          </p>
        </div>
      </div>

      {/* Track form */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Track Name *</label>
          <input
            value={trackName}
            onChange={(e) => setTrackName(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="e.g. Machine Learning"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            placeholder="What learners will study in this track..."
          />
        </div>

        {saveError && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            {saveError}
          </p>
        )}
        {saveSuccess && (
          <p className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isNew ? "Track created! Redirecting..." : "Track saved."}
          </p>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : isNew ? "Create Track" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Dimensions panel (only for existing tracks) */}
      {!isNew && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Assessment Dimensions
              <span className="ml-2 text-xs text-gray-400 font-normal">
                ({dimensions.length} defined)
              </span>
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-600 dark:text-orange-400"
              >
                {regenerating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Regenerate AI
              </button>
              <button
                onClick={() => setDimModal({ open: true })}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>
          </div>

          {regenMsg && (
            <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">
              {regenMsg}
            </div>
          )}

          {dimsLoading ? (
            <div className="flex items-center gap-2 text-gray-400 py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading dimensions...</span>
            </div>
          ) : dimensions.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">
              No dimensions yet. Click "Regenerate AI" to auto-generate, or "Add" to create one
              manually.
            </p>
          ) : (
            <div>
              {dimensions.map((d) => (
                <DimRow
                  key={d.dimension_id}
                  dim={d}
                  onEdit={(dim) => setDimModal({ open: true, existing: dim })}
                  onDelete={handleDeleteDimension}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dimension modal */}
      {dimModal.open && trackId && (
        <DimFormModal
          trackId={trackId}
          existing={dimModal.existing}
          onClose={() => setDimModal({ open: false })}
          onSaved={handleDimSaved}
        />
      )}
    </div>
  );
};
