import { hasPermission, PERMISSIONS } from "./permissions.js";
import { getState, setRoute } from "./state.js";
import { renderDashboardPage, bindDashboardPage } from "./pages/dashboard.js";
import { renderAiInsightPage, bindAiInsightPage } from "./pages/ai-insight.js";
import { renderUserAccessPage, bindUserAccessPage } from "./pages/user-access.js";
import { renderDataHealthOverviewPage, bindDataHealthOverviewPage, renderPipelineCheckPage, bindPipelineCheckPage } from "./pages/data-health.js";
import { renderCheckRawPage, bindCheckRawPage } from "./pages/check-raw.js";
import { renderDataControlHistoryPage, bindDataControlHistoryPage, renderDataControlPreviewPage, bindDataControlPreviewPage, renderDataControlClearPage, bindDataControlClearPage, renderDataControlBuildPage, bindDataControlBuildPage } from "./pages/data-control.js";
import { renderProfilePage, bindProfilePage, renderPreferencesPage, bindPreferencesPage } from "./pages/profile.js";
import { accessDeniedPage } from "./pages/shared.js";

import { renderDailyRetentionPage, bindDailyRetentionPage } from "./pages/daily-retention.js?v=3303";
const ROUTES = {
  "daily-retention":{render:renderDailyRetentionPage,bind:bindDailyRetentionPage},
  dashboard:{render:renderDashboardPage,bind:bindDashboardPage},
  "ai-insight":{render:renderAiInsightPage,bind:bindAiInsightPage},
"user-access":{permission:PERMISSIONS.MANAGE_USER_ACCESS,render:renderUserAccessPage,bind:bindUserAccessPage},
  "data-health-overview":{permission:PERMISSIONS.VIEW_DATA_HEALTH,render:renderDataHealthOverviewPage,bind:bindDataHealthOverviewPage},
  "check-raw":{permission:PERMISSIONS.RUN_RAW_CHECK,render:renderCheckRawPage,bind:bindCheckRawPage},
  "pipeline-check":{permission:PERMISSIONS.RUN_PIPELINE_CHECK,render:renderPipelineCheckPage,bind:bindPipelineCheckPage},
  "data-control-history":{permission:PERMISSIONS.VIEW_DATA_CONTROL_HISTORY,render:renderDataControlHistoryPage,bind:bindDataControlHistoryPage},
  "data-control-preview":{permission:PERMISSIONS.RUN_DATA_PREVIEW,render:renderDataControlPreviewPage,bind:bindDataControlPreviewPage},
  "data-control-clear":{permission:PERMISSIONS.RUN_DATA_CLEAR,render:renderDataControlClearPage,bind:bindDataControlClearPage},
  "data-control-build":{permission:PERMISSIONS.RUN_DATA_BUILD,render:renderDataControlBuildPage,bind:bindDataControlBuildPage},
  profile:{render:renderProfilePage,bind:bindProfilePage},
  preferences:{render:renderPreferencesPage,bind:bindPreferencesPage},
};

export function renderCurrentPage() {
  const state=getState();
  const route=ROUTES[state.route];
  if(!route){setRoute("dashboard");return;}
  const content=document.getElementById("page-content");
  const allowed=!route.permission||hasPermission(state.user,route.permission);
  content.innerHTML=allowed?route.render():accessDeniedPage();
  content.focus({preventScroll:true});
  if(allowed)route.bind?.();
}
