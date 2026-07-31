(() => {
  "use strict";

  function visible(selector) {
    return Array.from(document.querySelectorAll(selector)).filter(node => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
  }

  function ratio(left,right) {
    const a = left?.getBoundingClientRect().width || 0;
    const b = right?.getBoundingClientRect().width || 0;
    return a+b ? Math.round((a/(a+b))*1000)/1000 : 0;
  }

  function heightDelta(first,second) {
    const a = first?.getBoundingClientRect().height || 0;
    const b = second?.getBoundingClientRect().height || 0;
    return Math.round(Math.abs(a-b));
  }

  function buildAuditSnapshot() {
    const overviewLabels = Array.from(document.querySelectorAll("#overview-grid .klbl"))
      .map(node => (node.textContent || "").trim());
    const topGrid = document.querySelector('.dashboard-top-grid');
    const topChildren = topGrid ? Array.from(topGrid.children) : [];
    const firstKpi = document.querySelector('#overview-grid .kcard');
    const firstKpiStyle = firstKpi ? window.getComputedStyle(firstKpi) : null;
    const curveCard = document.querySelector('.section-curve');
    const playerCard = document.querySelector('.section-player-type');
    const newRetentionCard = document.querySelector('.section-new-retention');
    const totalRetentionCard = document.querySelector('.section-total-retention');
    const curve = document.getElementById("curve");
    const pie = document.getElementById("pie");
    const newRetention = document.getElementById("new-retention-line");
    const totalRetention = document.getElementById("ret");

    return {
      ready: true,
      overviewCards: document.querySelectorAll("#overview-grid .kcard").length,
      overviewLabels,
      activeUserValue: document.querySelector('[data-overview-key="active_user"] .kval')?.textContent?.trim() || "",
      topLeftRatio: ratio(topChildren[0],topChildren[1]),
      topHeightDelta: heightDelta(topChildren[0],topChildren[1]),
      overviewDisplay: firstKpiStyle?.display || '',
      overviewTextAlign: firstKpiStyle?.textAlign || '',
      overviewGridColumns: firstKpiStyle?.gridTemplateColumns || '',
      qualityHeightDelta: heightDelta(curveCard,playerCard),
      retentionHeightDelta: heightDelta(newRetentionCard,totalRetentionCard),
      curveTraces: Array.isArray(curve?.data) ? curve.data.length : 0,
      playerTypeItems: document.querySelectorAll("#pie-stats .ptype-item").length,
      playerTypeCenter: document.querySelector(".ptype-center-value")?.textContent?.trim() || "",
      pieTextInfo: pie?.data?.[0]?.textinfo || '',
      newRetentionTraceType: newRetention?.data?.[0]?.type || '',
      newRetentionFill: newRetention?.data?.[0]?.fill || '',
      totalRetentionTraceType: totalRetention?.data?.[0]?.type || '',
      totalRetentionFill: totalRetention?.data?.[0]?.fill || '',
      newRetentionKpis: document.querySelectorAll('#funnel .retention-kpi').length,
      totalRetentionKpis: document.querySelectorAll('#total-retention-box .retention-kpi').length,
      headerAdminButtons: visible(".admin-panel-link,#adminPanelLink").length,
      headerSignOutButtons: visible(".auth-logout,#authLogout").length,
      floatingAiChat: visible("#fab,#chatPanel,.fab,.chat-panel").length,
      filters: ["f-game","f-channel","f-month","f-period-type","f-week"].filter(id => document.getElementById(id)).length,
      exportMenu: Boolean(document.querySelector(".export-menu")),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 4,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  }

  function publishAuditSnapshot() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("audit")) return;
    let node = document.getElementById("dashboard-r11-audit-result");
    if (!node) {
      node = document.createElement("pre");
      node.id = "dashboard-r11-audit-result";
      node.hidden = true;
      document.body.appendChild(node);
    }
    node.textContent = JSON.stringify(buildAuditSnapshot());
  }

  document.body.classList.add("dashboard-r11");
  window.CQR_DASHBOARD_R11 = { publishAuditSnapshot, buildAuditSnapshot };
  window.addEventListener("load", () => window.setTimeout(publishAuditSnapshot, 1800), { once: true });
})();
