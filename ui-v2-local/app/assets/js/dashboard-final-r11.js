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

/* CQR_PLOTLY_READABILITY_FINAL_START */
(() => {
  "use strict";

  const root = window;
  const KNOWN_PLOTS = ["curve", "new-retention-line", "ret", "dau", "heat", "pie"];
  const AXIS_FONT = { family: "Sarabun", size: 11, color: "#5f6d80" };
  const GRID = "rgba(117,132,155,.17)";
  const LINE = "rgba(117,132,155,.16)";

  function plotId(target) {
    return typeof target === "string" ? target : String(target?.id || "");
  }

  function axis(source = {}, overrides = {}) {
    return {
      ...source,
      automargin: true,
      showline: false,
      zeroline: false,
      gridcolor: GRID,
      gridwidth: 1,
      tickcolor: LINE,
      ticklen: 4,
      tickfont: { ...(source.tickfont || {}), ...AXIS_FONT },
      titlefont: { ...(source.titlefont || {}), ...AXIS_FONT },
      ...overrides,
    };
  }

  function margins(current = {}, preferred = {}) {
    return { ...current, ...preferred, pad: 0 };
  }

  function tuneTrace(id, trace) {
    const next = { ...trace };

    if (id === "pie") {
      next.hole = .64;
      next.textinfo = "percent";
      next.textposition = "inside";
      next.insidetextorientation = "horizontal";
      next.textfont = { ...(trace.textfont || {}), family: "Sarabun", size: 10, color: "#ffffff" };
      next.marker = {
        ...(trace.marker || {}),
        line: { ...(trace.marker?.line || {}), color: "#ffffff", width: 3 },
      };
      return next;
    }

    if (String(trace.mode || "").includes("text")) {
      next.textfont = {
        ...(trace.textfont || {}),
        family: "Sarabun",
        size: Math.max(Number(trace.textfont?.size || 0), 10),
      };
    }

    if (trace.line) {
      next.line = {
        ...trace.line,
        width: Math.max(Number(trace.line.width || 0), 2.8),
      };
    }

    if (trace.marker) {
      next.marker = {
        ...trace.marker,
        size: Array.isArray(trace.marker.size)
          ? trace.marker.size
          : Math.max(Number(trace.marker.size || 0), 6),
      };
    }

    if (id === "heat") {
      next.textfont = { ...(trace.textfont || {}), family: "Sarabun", size: 10.5, color: "#1e293b" };
      next.colorbar = {
        ...(trace.colorbar || {}),
        thickness: 11,
        tickfont: { family: "Sarabun", size: 10, color: "#5f6d80" },
      };
    }

    return next;
  }

  function tuneLayout(id, source = {}) {
    const layout = {
      ...source,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { ...(source.font || {}), family: "Sarabun", size: 11, color: "#5f6d80" },
      hoverlabel: {
        ...(source.hoverlabel || {}),
        font: { ...(source.hoverlabel?.font || {}), family: "Sarabun", size: 11 },
      },
    };

    if (id === "pie") {
      return {
        ...layout,
        height: 300,
        margin: margins(source.margin, { t: 8, r: 8, b: 8, l: 8 }),
        showlegend: false,
        uniformtext: { ...(source.uniformtext || {}), minsize: 9, mode: "hide" },
      };
    }

    if (id === "curve") {
      layout.height = Math.max(Number(source.height || 0), 330);
      layout.margin = margins(source.margin, { t: 42, r: 24, b: 76, l: 58 });
      layout.xaxis = axis(source.xaxis, { tickangle: 0 });
      layout.yaxis = axis(source.yaxis);
      layout.legend = {
        ...(source.legend || {}),
        orientation: "h",
        x: .5,
        xanchor: "center",
        y: -.22,
        font: { ...(source.legend?.font || {}), family: "Sarabun", size: 10.5, color: "#526174" },
      };
    } else if (id === "new-retention-line") {
      layout.height = Math.max(Number(source.height || 0), 276);
      layout.margin = margins(source.margin, { t: 30, r: 20, b: 38, l: 62 });
      layout.xaxis = axis(source.xaxis, { tickangle: 0 });
      layout.yaxis = axis(source.yaxis, { separatethousands: true });
    } else if (id === "ret") {
      layout.height = Math.max(Number(source.height || 0), 276);
      layout.margin = margins(source.margin, { t: 30, r: 20, b: 38, l: 56 });
      layout.xaxis = axis(source.xaxis, { tickangle: 0 });
      layout.yaxis = axis(source.yaxis);
    } else if (id === "dau") {
      layout.height = Math.max(Number(source.height || 0), 320);
      layout.margin = margins(source.margin, { t: 42, r: 24, b: 64, l: 64 });
      layout.xaxis = axis(source.xaxis, { tickangle: -30, nticks: Number(source.xaxis?.nticks || 8) });
      layout.yaxis = axis(source.yaxis, { separatethousands: true });
    } else if (id === "heat") {
      layout.height = Math.max(Number(source.height || 0), 280);
      layout.margin = margins(source.margin, { t: 24, r: 58, b: 50, l: 68 });
      layout.xaxis = axis(source.xaxis, { tickangle: 0, showgrid: false });
      layout.yaxis = axis(source.yaxis, { showgrid: false });
    }

    if (Array.isArray(source.annotations)) {
      layout.annotations = source.annotations.map((item) => ({
        ...item,
        font: { ...(item.font || {}), family: "Sarabun", size: Math.max(Number(item.font?.size || 0), 10) },
      }));
    }

    return layout;
  }

  function tunedArgs(target, data, layout, config) {
    const id = plotId(target);
    const traces = Array.isArray(data) ? data.map((trace) => tuneTrace(id, trace)) : data;
    const tunedLayout = tuneLayout(id, layout || {});
    const tunedConfig = { ...(config || {}), displayModeBar: false, responsive: true };
    return [target, traces, tunedLayout, tunedConfig];
  }

  function tuneExisting(Plotly) {
    KNOWN_PLOTS.forEach((id) => {
      const node = document.getElementById(id);
      if (!node || !Array.isArray(node.data) || !node.layout) return;
      const [, data, layout, config] = tunedArgs(node, node.data, node.layout, node._context || {});
      try {
        Plotly.react(node, data, layout, config);
      } catch (_) {
        /* Runtime review will surface a plot-specific issue without breaking the page. */
      }
    });
  }

  function install(retry = 0) {
    const Plotly = root.Plotly;
    if (!Plotly) {
      if (retry < 160) root.setTimeout(() => install(retry + 1), 100);
      return;
    }

    if (!Plotly.__cqrReadabilityPatched) {
      Plotly.__cqrReadabilityPatched = true;
      const originalNewPlot = Plotly.newPlot.bind(Plotly);
      Plotly.newPlot = function(target, data, layout, config) {
        return originalNewPlot(...tunedArgs(target, data, layout, config));
      };
    }

    root.setTimeout(() => tuneExisting(Plotly), 0);
    root.setTimeout(() => tuneExisting(Plotly), 500);
    root.setTimeout(() => tuneExisting(Plotly), 1500);
  }

  install();
  root.addEventListener("load", () => install(), { once: true });
})();
/* CQR_PLOTLY_READABILITY_FINAL_END */
