export const PERMISSIONS = Object.freeze({
  VIEW_ADMIN_PANEL: "view_admin_panel",
  MANAGE_USER_ACCESS: "manage_user_access",
  VIEW_DATA_HEALTH: "view_data_health",
  RUN_RAW_CHECK: "run_raw_check",
  RUN_PIPELINE_CHECK: "run_pipeline_check",
  VIEW_DATA_CONTROL_HISTORY: "view_data_control_history",
  RUN_DATA_PREVIEW: "run_data_preview",
  RUN_DATA_CLEAR: "run_data_clear",
  RUN_DATA_BUILD: "run_data_build",
});

export const PREVIEW_PERMISSION_SETS = Object.freeze({
  regularUser: [],
  dataViewer: [
    PERMISSIONS.VIEW_ADMIN_PANEL,
    PERMISSIONS.VIEW_DATA_HEALTH,
    PERMISSIONS.VIEW_DATA_CONTROL_HISTORY,
  ],
  dataOperator: [
    PERMISSIONS.VIEW_ADMIN_PANEL,
    PERMISSIONS.VIEW_DATA_HEALTH,
    PERMISSIONS.RUN_RAW_CHECK,
    PERMISSIONS.RUN_PIPELINE_CHECK,
    PERMISSIONS.VIEW_DATA_CONTROL_HISTORY,
    PERMISSIONS.RUN_DATA_PREVIEW,
    PERMISSIONS.RUN_DATA_BUILD,
  ],
  superAdmin: Object.values(PERMISSIONS),
});

export function hasPermission(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}

export function canSeeAdminPanel(user) {
  return hasPermission(user, PERMISSIONS.VIEW_ADMIN_PANEL);
}
