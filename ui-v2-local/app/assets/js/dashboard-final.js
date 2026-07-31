(() => {
  "use strict";

  const CHANNEL_COLORS = {
    "Facebook Ads": "#3F7CF4",
    "Google Ads": "#F47A22",
    "In-App Register": "#8B71F6",
    "Organic / Unknown": "#26A98F"
  };
  const PLAYER_COLORS = ["#3F7CF4", "#26A98F", "#8B71F6", "#F6B441"];
  const CHART_IDS = ["curve", "pie", "ret", "dau", "heat"];
  let timer = 0;

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function relayout(id, layout) {
    const el = document.getElementById(id);
    if (!el || !window.Plotly || !Array.isArray(el.data) || !el.data.length) return;
    try {
      window.Plotly.relayout(el, layout);
    } catch (error) {
      console.warn("[Dashboard Final] relayout skipped", id, error);
    }
  }

  function restyle(id, update, traces) {
    const el = document.getElementById(id);
    if (!el || !window.Plotly || !Array.isArray(el.data) || !el.data.length) return;
    try {
      window.Plotly.restyle(el, update, traces);
    } catch (error) {
      console.warn("[Dashboard Final] restyle skipped", id, error);
    }
  }

  function baseLayout(extra = {}) {
    return Object.assign({
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        family: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","Sukhumvit Set","Thonburi","Sarabun",sans-serif',
        color: "#657080",
        size: 10
      },
      hoverlabel: {
        bgcolor: "#171a21",
        bordercolor: "#171a21",
        font: { color: "#ffffff", size: 11 }
      }
    }, extra);
  }

  function prepareForLegacyRender() {
    const funnel = document.getElementById("funnel");
    if (funnel && funnel.classList.contains("final-retention-flow")) {
      funnel.className = "";
      funnel.innerHTML = "";
      funnel.removeAttribute("data-final-flow");
      funnel.style.gridTemplateColumns = "";
    }
  }

  function polishCurve() {
    const el = document.getElementById("curve");
    if (!el || !Array.isArray(el.data) || !el.data.length) return;

    el.data.forEach((trace, index) => {
      const color = CHANNEL_COLORS[trace.name] || trace?.line?.color || "#657080";
      restyle("curve", {
        "line.color": color,
        "line.width": 2.8,
        "line.dash": "solid",
        "marker.color": color,
        "marker.size": 7,
        "marker.line.color": "#ffffff",
        "marker.line.width": 2,
        "textfont.color": color,
        "textfont.size": 10,
        "hovertemplate": "%{fullData.name}<br>%{x}: %{y:.1f}%<extra></extra>"
      }, [index]);
    });

    relayout("curve", baseLayout({
      height: 286,
      margin: { t: 28, r: 18, b: 58, l: 48 },
      legend: {
        orientation: "h",
        x: 0.5,
        xanchor: "center",
        y: -0.20,
        font: { size: 10, color: "#657080" }
      },
      "xaxis.showgrid": false,
      "xaxis.zeroline": false,
      "xaxis.tickfont": { size: 10, color: "#707a89" },
      "yaxis.gridcolor": "rgba(115,130,153,.14)",
      "yaxis.zeroline": false,
      "yaxis.tickfont": { size: 10, color: "#707a89" }
    }));
  }

  function polishPlayerLegend() {
    const stats = document.getElementById("pie-stats");
    if (!stats) return;
    const items = Array.from(stats.querySelectorAll(".ptype-item"));
    items.forEach((item, index) => {
      const dot = item.querySelector(".ptype-dot");
      if (dot) dot.style.background = PLAYER_COLORS[index % PLAYER_COLORS.length];
    });
  }

  function polishPie() {
    const el = document.getElementById("pie");
    if (!el || !window.Plotly || !Array.isArray(el.data) || !el.data[0]) return;

    const source = el.data[0];
    const labels = Array.isArray(source.labels) ? source.labels.map(String) : [];
    const values = Array.isArray(source.values) ? source.values.map(Number) : [];
    if (!labels.length || labels.length !== values.length) return;
    const total = values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);

    try {
      window.Plotly.react(el, [{
        type: "pie",
        labels,
        values,
        hole: 0.64,
        sort: false,
        direction: "clockwise",
        rotation: 0,
        textinfo: "percent",
        textposition: "inside",
        textfont: {
          color: "#ffffff",
          size: 11,
          family: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","Sarabun",sans-serif'
        },
        marker: {
          colors: PLAYER_COLORS,
          line: { color: "rgba(255,255,255,.96)", width: 3 }
        },
        hovertemplate: "%{label}<br>%{value:,} users<br>%{percent}<extra></extra>",
        showlegend: false,
        automargin: true
      }], baseLayout({
        height: 266,
        margin: { t: 8, r: 8, b: 8, l: 8 },
        showlegend: false,
        annotations: total ? [{
          x: 0.5,
          y: 0.5,
          xref: "paper",
          yref: "paper",
          showarrow: false,
          align: "center",
          text:
            '<span style="font-size:9px;color:#7a879a;letter-spacing:.05em">ACTIVE USERS</span>' +
            `<br><span style="font-size:20px;font-weight:700;color:#202633">${total.toLocaleString()}</span>`
        }] : []
      }), { displayModeBar: false, responsive: true });
    } catch (error) {
      console.warn("[Dashboard Final] pie polish failed", error);
    }

    polishPlayerLegend();
  }

  function transformFunnel() {
    const el = document.getElementById("funnel");
    if (!el || el.dataset.finalFlow === "1" || !Array.isArray(el.data) || !el.data.length) return;
    const trace = el.data[0];
    const labels = Array.isArray(trace.x) ? trace.x.map(String) : [];
    const values = Array.isArray(trace.y) ? trace.y.map(Number) : [];
    if (!labels.length || labels.length !== values.length) return;

    const base = values[0] || 1;
    try {
      window.Plotly?.purge(el);
    } catch (_) {}

    el.className = "final-retention-flow";
    el.dataset.finalFlow = "1";
    el.style.gridTemplateColumns = `repeat(${labels.length}, minmax(0, 1fr))`;
    el.innerHTML = labels.map((label, index) => {
      const value = Number.isFinite(values[index]) ? values[index] : 0;
      const share = index === 0 ? "100%" : `${((value / base) * 100).toFixed(1)}%`;
      return `
        <div class="final-flow-step">
          <span class="final-flow-label">${label}</span>
          <strong class="final-flow-value">${value.toLocaleString()}</strong>
          <span class="final-flow-share">${share}</span>
        </div>
      `;
    }).join("");
  }

  function polishTotalRetention() {
    const el = document.getElementById("ret");
    if (!el || !window.Plotly || !Array.isArray(el.data) || !el.data.length) return;
    const source = el.data[0];
    const x = Array.isArray(source.x) ? source.x.map(String) : [];
    const y = Array.isArray(source.y) ? source.y.map(Number) : [];
    if (!x.length || x.length !== y.length) return;

    try {
      window.Plotly.react(el, [{
        x,
        y,
        type: "scatter",
        mode: "lines+markers+text",
        line: { color: "#F67825", width: 3, shape: "spline" },
        marker: {
          size: 8,
          color: "#ffffff",
          line: { color: "#F67825", width: 2.5 }
        },
        fill: "tozeroy",
        fillcolor: "rgba(246,120,37,.10)",
        text: y.map(value => `${Number(value).toFixed(1)}%`),
        textposition: "top center",
        textfont: { size: 10, color: "#657080" },
        hovertemplate: "%{x}: %{y:.1f}%<extra></extra>"
      }], baseLayout({
        height: 198,
        margin: { t: 34, r: 20, b: 38, l: 46 },
        showlegend: false,
        "xaxis.showgrid": false,
        "xaxis.zeroline": false,
        "yaxis.gridcolor": "rgba(115,130,153,.14)",
        "yaxis.zeroline": false,
        "yaxis.rangemode": "tozero",
        "yaxis.ticksuffix": "%"
      }), { displayModeBar: false, responsive: true });
    } catch (error) {
      console.warn("[Dashboard Final] retention polish failed", error);
    }
  }

  function polishDau() {
    const el = document.getElementById("dau");
    if (!el || !Array.isArray(el.data) || !el.data[0]) return;
    restyle("dau", {
      "line.color": "#F67825",
      "line.width": 2.8,
      "marker.color": "#ffffff",
      "marker.size": 4.5,
      "marker.line.color": "#F67825",
      "marker.line.width": 1.8,
      "fillcolor": "rgba(246,120,37,.10)",
      "hovertemplate": "%{x}<br>%{y:,} users<extra></extra>"
    }, [0]);
    relayout("dau", baseLayout({
      height: 250,
      margin: { t: 28, r: 18, b: 40, l: 52 },
      "xaxis.gridcolor": "rgba(115,130,153,.06)",
      "xaxis.zeroline": false,
      "yaxis.gridcolor": "rgba(115,130,153,.13)",
      "yaxis.zeroline": false
    }));
  }

  function polishHeat() {
    relayout("heat", baseLayout({
      height: 210,
      margin: { t: 18, r: 24, b: 28, l: 54 },
      "xaxis.showgrid": false,
      "xaxis.zeroline": false,
      "yaxis.showgrid": false,
      "yaxis.zeroline": false
    }));
  }

  function resizeCharts() {
    CHART_IDS.forEach(id => {
      const el = document.getElementById(id);
      try {
        if (el && window.Plotly) window.Plotly.Plots.resize(el);
      } catch (_) {}
    });
  }

  function publishAuditSnapshot() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("audit")) return;

    const result = {
      ready: true,
      overviewCards: document.querySelectorAll("#overview-grid .kcard").length,
      channelRows: document.querySelectorAll("#channel-tbody tr").length,
      curveTraces: document.getElementById("curve")?.data?.length || 0,
      pieTraces: document.getElementById("pie")?.data?.length || 0,
      flowSteps: document.querySelectorAll("#funnel .final-flow-step").length,
      gameDetailCards: document.querySelectorAll("#sm-grid .gm-card").length,
      statCards: document.querySelectorAll(".stat3 .statcard").length,
      headerAdminButtons: document.querySelectorAll("#adminPanelLink,#authLogout").length,
      floatingChat: document.querySelectorAll("#fab,#chatPanel").length,
      filters: ["f-game","f-channel","f-month","f-period-type","f-week"].filter(id => document.getElementById(id)).length,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 4,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };

    let node = document.getElementById("dashboard-final-audit-result");
    if (!node) {
      node = document.createElement("pre");
      node.id = "dashboard-final-audit-result";
      node.hidden = true;
      document.body.appendChild(node);
    }
    node.textContent = JSON.stringify(result);
  }

  function applyFinalDesign() {
    document.body.classList.add("dashboard-final");
    polishCurve();
    polishPie();
    transformFunnel();
    polishTotalRetention();
    polishDau();
    polishHeat();
    resizeCharts();
    window.setTimeout(publishAuditSnapshot, 250);
  }

  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(applyFinalDesign, 120);
    window.setTimeout(applyFinalDesign, 450);
    window.setTimeout(applyFinalDesign, 1000);
  }

  function wrapRenderAll() {
    if (typeof window.renderAll !== "function" || window.renderAll.__dashboardFinalWrapped) return;
    const original = window.renderAll;
    const wrapped = function(...args) {
      prepareForLegacyRender();
      const result = original.apply(this, args);
      schedule();
      return result;
    };
    wrapped.__dashboardFinalWrapped = true;
    window.renderAll = wrapped;
  }

  ready(() => {
    document.body.classList.add("dashboard-final");
    wrapRenderAll();
    schedule();
    window.addEventListener("resize", schedule, { passive: true });
  });
  window.addEventListener("load", schedule, { once: true });
})();
