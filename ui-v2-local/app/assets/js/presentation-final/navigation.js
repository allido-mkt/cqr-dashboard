import { PERMISSIONS } from "./permissions.js";

export const NAVIGATION = [
  {
    id: "main",
    label: "Main Menu",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "dashboard", href: "./dashboard-v2.html" },
      { id: "ai-insight", label: "AI Insight", icon: "sparkles" },
    ],
  },
  {
    id: "admin",
    label: "Admin Panel",
    permission: PERMISSIONS.VIEW_ADMIN_PANEL,
    items: [
      { id: "user-access", label: "User Access", icon: "users", permission: PERMISSIONS.MANAGE_USER_ACCESS },
      {
        id: "data-health",
        label: "Data Health",
        icon: "health",
        permission: PERMISSIONS.VIEW_DATA_HEALTH,
        children: [
          { id: "data-health-overview", label: "Overview", icon: "overview", permission: PERMISSIONS.VIEW_DATA_HEALTH },
          { id: "check-raw", label: "Check Raw", icon: "raw", permission: PERMISSIONS.RUN_RAW_CHECK },
          { id: "pipeline-check", label: "Pipeline Check", icon: "pipeline", permission: PERMISSIONS.RUN_PIPELINE_CHECK },
        ],
      },
      {
        id: "data-control",
        label: "Data Control",
        icon: "control",
        permission: PERMISSIONS.VIEW_DATA_CONTROL_HISTORY,
        children: [
          { id: "data-control-history", label: "History", icon: "history", permission: PERMISSIONS.VIEW_DATA_CONTROL_HISTORY },
          { id: "data-control-preview", label: "Preview", icon: "eye", permission: PERMISSIONS.RUN_DATA_PREVIEW },
          { id: "data-control-clear", label: "Clear", icon: "trash", permission: PERMISSIONS.RUN_DATA_CLEAR },
          { id: "data-control-build", label: "Build", icon: "build", permission: PERMISSIONS.RUN_DATA_BUILD },
        ],
      },
    ],
  },
];
