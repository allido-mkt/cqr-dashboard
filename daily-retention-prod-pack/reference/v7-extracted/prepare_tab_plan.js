const unit = $json;
const tabPlan = unit.required_tabs.map(tab => ({
  ...tab,
  tab_key: `${unit.game_code}|${unit.target_month}|${tab.tab_name}`,
  source_file_id: unit.source_file_id,
  game_code: unit.game_code,
  period_key: unit.target_month,
  status: 'planned'
}));

return [{
  json: {
    ...unit,
    tab_plan: tabPlan,
    quality_signals: [],
    pipeline_status: 'planned'
  }
}];