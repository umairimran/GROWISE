import {
  BookOpen,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

export const learnerNavItems = [
  { path: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { path: "/course", label: "Learning Path", icon: BookOpen },
  { path: "/validator", label: "Real-World Validator", icon: Zap },
  { path: "/improvement", label: "Progress Analysis", icon: TrendingUp },
  { path: "/evaluation", label: "Evaluation Report", icon: FileText },
  { path: "/account", label: "Account & Security", icon: ShieldCheck },
] as const;

export const productRoutePrefixes = learnerNavItems.map((item) => item.path);

export const productStatusItems = [
  { label: "Adaptive assessments", value: "Adapts to your level" },
  { label: "Learning engine", value: "Personalized to your gaps" },
  { label: "Validator", value: "Practice interviews" },
  { label: "Theme", value: "Dual mode" },
] as const;

export const defaultProductBadge = {
  icon: Sparkles,
  label: "Your learning workspace",
};
