import { getState, setRoute } from "../state.js";
import { icon, formatNumber, statusPill } from "../ui.js";

function dashboardData(filters) {
  const gameFactor = { ALL: 3.7, CBM_TH: 1, CBM_SEA: .78, CBPC_TH: .84, CBPC_SEA: .61 }[filters.game] || 1;
  const channelFactor = { ALL: 1, "Facebook Ads": .28, "Google Ads": .24, "In-App Register": .19, "Organic / Unknown": .29 }[filters.channel] || 1;
  const weekly = filters.periodType === "week";
  const scale = gameFactor * channelFactor * (weekly ? .26 : 1);
  const registered = Math.round(184320 * scale);
  const d1 = Math.max(14.8, 32.4 - (filters.channel === "Facebook Ads" ? 2.4 : 0) + (filters.game === "CBM_TH" ? 1.1 : 0));
  const d7 = Math.max(7.2, d1 * .54);
  const d14 = Math.max(4.3, d1 * .37);
  const retention = weekly ? [100, d1 + 2, d1, d1 - 4, d7 + 2, d7, d14] : [100, d1, 24.1, 19.8, d7, 9.8, d14];
  return { registered, d1, d7, d14, retention };
}

function kpi(iconName,tone,label,value,foot,delta) {
  return `<article class="surface-card kpi-card"><div class="kpi-icon ${tone}">${icon(iconName)}</div><div><div class="kpi-label">${label}</div><div class="kpi-value num">${value}</div><div class="kpi-foot">${foot}${delta ? ` <span class="delta ${delta.startsWith("+") ? "up" : "down"}">${delta}</span>` : ""}</div></div></article>`;
}

function lineChart(values) {
  const width = 680, height = 230, left = 42, right = 18, top = 18, bottom = 36;
  const plotW = width-left-right, plotH = height-top-bottom;
  const labels = ["Register","D1","D3","D5","D7","D10","D14"];
  const x = (i) => left + (plotW/(values.length-1))*i;
  const y = (v) => top + plotH - (v/100)*plotH;
  const points = values.map((v,i)=>`${x(i)},${y(v)}`).join(" ");
  const area = `${left},${top+plotH} ${points} ${x(values.length-1)},${top+plotH}`;
  const grid = [0,25,50,75,100].map((v)=>`<line class="chart-gridline" x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}"/><text class="chart-label" x="${left-8}" y="${y(v)+4}" text-anchor="end">${v}%</text>`).join("");
  const xLabels = labels.map((label,i)=>`<text class="chart-label" x="${x(i)}" y="${height-8}" text-anchor="middle">${label}</text>`).join("");
  const dots = values.map((v,i)=>`<circle class="chart-point" cx="${x(i)}" cy="${y(v)}" r="4"/><text class="chart-label" x="${x(i)}" y="${y(v)-10}" text-anchor="middle">${v.toFixed(i===0?0:1)}%</text>`).join("");
  return `<svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Retention curve"><defs><linearGradient id="warmArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a45" stop-opacity=".24"/><stop offset="1" stop-color="#ff7a45" stop-opacity="0"/></linearGradient></defs>${grid}<polygon class="chart-area" points="${area}"/><polyline class="chart-line-main" points="${points}"/>${dots}${xLabels}</svg>`;
}

function channelTable() {
  const rows = [
    ["Facebook Ads","#64748b","38,420","31.2%","16.7%","11.2%","Volume สูง แต่ D7 ต่ำกว่าค่าเฉลี่ยเล็กน้อย","warning"],
    ["Google Ads","#ff7a45","31,850","34.8%","19.5%","13.4%","คุณภาพดีและรักษา D14 ได้ดีที่สุด","ready"],
    ["In-App Register","#8a7ca9","26,110","36.1%","20.3%","13.9%","ควรใช้เป็น Proxy ของ Install Campaign","ready"],
    ["Organic / Unknown","#9aa0a8","42,730","30.4%","17.6%","12.1%","Volume สูง ควรแยก Source เพิ่มเติม","warning"],
  ];
  return rows.map(r=>`<tr><td><span class="channel-name"><span class="channel-dot" style="background:${r[1]}"></span>${r[0]}</span></td><td class="num">${r[2]}</td><td class="num">${r[3]}</td><td class="num">${r[4]}</td><td class="num">${r[5]}</td><td class="verdict">${r[6]}</td><td>${statusPill(r[7],r[7]==="ready"?"Healthy":"Review")}</td></tr>`).join("");
}

function gameMatrix() {
  const rows = [
    ["CBM TH","64,220","33.5%","18.4%","12.6%","Healthy"],
    ["CBM SEA","47,510","31.8%","17.1%","11.7%","Review"],
    ["CBPC TH","42,890","34.2%","19.0%","13.1%","Healthy"],
    ["CBPC SEA","29,700","29.6%","15.8%","10.5%","Review"],
  ];
  return rows.map(r=>`<tr><td><b>${r[0]}</b></td><td class="num">${r[1]}</td><td class="num">${r[2]}</td><td class="num">${r[3]}</td><td class="num">${r[4]}</td><td>${statusPill(r[5]==="Healthy"?"ready":"warning",r[5])}</td></tr>`).join("");
}

export function renderDashboardPage() {
  const state = getState();
  const data = dashboardData(state.filters);
  const period = state.filters.periodType === "week" ? state.filters.week : state.filters.month;
  return `<div class="page-grid">
    <section class="grid-4">
      ${kpi("users","warm","Registered",formatNumber(data.registered),period,"+6.8%")}
      ${kpi("target","green","D1 Retention",`${data.d1.toFixed(1)}%`,"เทียบช่วงก่อน","+1.2 pt")}
      ${kpi("retention","","D7 Retention",`${data.d7.toFixed(1)}%`,"เทียบช่วงก่อน","+0.5 pt")}
      ${kpi("chart","purple","D14 Retention",`${data.d14.toFixed(1)}%`,"คุณภาพระยะกลาง","-0.2 pt")}
    </section>

    <section class="grid-main-aside">
      <article class="surface-card">
        <div class="card-header"><div><h2 class="card-title">Performance Overview</h2><p class="card-description">รูปแบบข้อมูลหลักจาก Dashboard เดิม ปรับสไตล์ให้เข้ากับ UI ใหม่</p></div>${statusPill("ready","Data Ready")}</div>
        <div class="card-body overview-layout">
          <div class="overview-stats">
            <div class="overview-stat"><b class="num">${formatNumber(Math.round(data.registered*.73))}</b><span>First Login</span></div>
            <div class="overview-stat"><b class="num">${formatNumber(Math.round(data.registered*.28))}</b><span>Returners</span></div>
            <div class="overview-stat"><b class="num">${formatNumber(Math.round(data.registered*.11))}</b><span>Late Starters</span></div>
            <div class="overview-stat"><b class="num">${formatNumber(Math.round(data.registered*.64))}</b><span>DAU Peak</span></div>
          </div>
          <div>
            <div class="ai-summary-list">
              <div class="ai-summary-line"><span class="ai-tag">Key finding</span><span>Google Ads และ In-App Register มี D7/D14 แข็งแรงที่สุดใน Context ปัจจุบัน</span></div>
              <div class="ai-summary-line"><span class="ai-tag">Risk</span><span>Facebook Ads มี Volume สูง แต่ Drop ระหว่าง D1 → D7 มากกว่าค่าเฉลี่ย</span></div>
              <div class="ai-summary-line"><span class="ai-tag">Action</span><span>แยก Cohort ตาม Campaign แล้วตรวจ Onboarding ช่วง 3 วันแรก</span></div>
            </div>
            <div class="toolbar" style="margin-top:14px"><button class="button warm" type="button" data-route="ai-insight">${icon("sparkles","nav-icon")} Open AI Insight</button><button class="button" type="button" data-route="data-health-overview">${icon("health","nav-icon")} View Data Health</button></div>
          </div>
        </div>
      </article>
      <aside class="surface-card warm-card">
        <div class="card-header"><div><h2 class="card-title">Executive Insight</h2><p class="card-description">สรุปสั้นจาก Context ล่าสุด</p></div>${statusPill("warm","AI")}</div>
        <div class="card-body list-stack">
          <div class="list-item"><div class="list-item-icon">${icon("retention")}</div><div><div class="list-item-title">Retention Drop</div><div class="list-item-meta">D1 → D3 เป็นช่วงที่ควรตรวจ Onboarding และ First Session</div></div></div>
          <div class="list-item"><div class="list-item-icon">${icon("channel")}</div><div><div class="list-item-title">Channel Quality</div><div class="list-item-meta">Organic มี Volume สูง แต่ควรแยก Unknown Source ออกจาก Organic จริง</div></div></div>
          <div class="list-item"><div class="list-item-icon">${icon("warning")}</div><div><div class="list-item-title">Watchlist</div><div class="list-item-meta">CBPC SEA ต่ำกว่าค่าเฉลี่ยที่ D7 และ D14</div></div></div>
        </div>
        <div class="card-footer"><button class="button primary" type="button" data-route="ai-insight">Go to AI Insight ${icon("arrow","nav-icon")}</button></div>
      </aside>
    </section>

    <section class="grid-2">
      <article class="surface-card chart-shell"><div class="card-header"><div><h2 class="card-title">Retention Curve</h2><p class="card-description">Register → D14 ตาม ${state.filters.periodType === "week" ? "Weekly" : "Monthly"} view</p></div><div class="chart-legend"><span class="legend-item"><span class="legend-dot" style="background:var(--warm)"></span>Current period</span></div></div><div class="card-body">${lineChart(data.retention)}</div></article>
      <article class="surface-card"><div class="card-header"><div><h2 class="card-title">Channel Mix</h2><p class="card-description">สัดส่วน Register และคุณภาพเบื้องต้น</p></div></div><div class="card-body bar-list">
        <div class="bar-row"><span class="bar-label">Organic / Unknown</span><div class="bar-track"><div class="bar-fill warm" style="width:74%"></div></div><span class="bar-value">29%</span></div>
        <div class="bar-row"><span class="bar-label">Facebook Ads</span><div class="bar-track"><div class="bar-fill" style="width:68%"></div></div><span class="bar-value">26%</span></div>
        <div class="bar-row"><span class="bar-label">Google Ads</span><div class="bar-track"><div class="bar-fill" style="width:57%"></div></div><span class="bar-value">23%</span></div>
        <div class="bar-row"><span class="bar-label">In-App Register</span><div class="bar-track"><div class="bar-fill" style="width:49%"></div></div><span class="bar-value">22%</span></div>
        <div class="notice warm">Channel Mix บอก Volume ส่วนการตัดสินใจ Budget ควรดู D7/D14 และ Cost ร่วมกัน</div>
      </div></article>
    </section>

    <article class="surface-card"><div class="card-header"><div><h2 class="card-title">Channel Performance</h2><p class="card-description">ตารางหลักจาก Dashboard เดิม พร้อม Verdict สำหรับตัดสินใจ</p></div><button class="button small" type="button" data-route="ai-insight">Ask AI</button></div><div class="card-body"><div class="table-wrap"><table><thead><tr><th>Channel</th><th>Registered</th><th>D1</th><th>D7</th><th>D14</th><th>Verdict</th><th>Status</th></tr></thead><tbody>${channelTable()}</tbody></table></div></div></article>

    <article class="surface-card"><div class="card-header"><div><h2 class="card-title">Game × Channel Detail</h2><p class="card-description">เปรียบเทียบทุกเกมในโครงแบบตารางเดิม โดยรักษา Column Alignment</p></div></div><div class="card-body"><div class="table-wrap"><table><thead><tr><th>Game</th><th>Registered</th><th>D1</th><th>D7</th><th>D14</th><th>Health</th></tr></thead><tbody>${gameMatrix()}</tbody></table></div></div></article>
  </div>`;
}

export function bindDashboardPage() {
  document.querySelectorAll("[data-route]").forEach((button)=>button.addEventListener("click",()=>setRoute(button.dataset.route)));
}
