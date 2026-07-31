import { APP_CONFIG } from "./config.js";
import { getSavedSession, isPreviewSession } from "./session.js";

const previewRawRequests = new Map();
const previewUsers = [
  {email:"bwm.workco@gmail.com",display_name:"Bew WM",role_id:"super_admin",status:"active",allowed_games:"ALL",allowed_regions:"ALL",last_login_at:new Date().toISOString()},
  {email:"viewer@example.com",display_name:"CQR Viewer",role_id:"viewer",status:"active",allowed_games:"ALL",allowed_regions:"ALL",last_login_at:""},
];
function wait(ms){ return new Promise((resolve)=>setTimeout(resolve,ms)); }
function previewHealth(params={}){
  const games=params.game&&params.game!=="ALL"?[params.game]:["CBM_TH","CBM_SEA","CBPC_TH","CBPC_SEA"];
  const month=params.month&&params.month!=="ALL"?params.month:"2026-06";
  const scope_rows=games.map((game,index)=>({game_code:game,period_key:month,raw:index===2?"Raw updated":"Raw ready",raw_level:index===2?"warn":"ok",raw_status:index===2?"raw_updated":"raw_ready",raw_hash:`${game.toLowerCase()}-${month}-new`,master:index===2?"Master behind":"Master ready",master_level:index===2?"warn":"ok",master_hash:index===2?`${game.toLowerCase()}-${month}-old`:`${game.toLowerCase()}-${month}-new`,action:index===2?"Preview, Clear, Build":"No action",action_level:index===2?"warn":"ok",action_status:index===2?"repair":"ready",ready_run_id:index===2?`RUN-${game}-${month}-OLD`:`RUN-${game}-${month}-READY`,latest_run_id:`RUN-${game}-${month}-LATEST`}));
  return {ok:true,source:"preview",game:params.game||"ALL",month:params.month||"ALL",summary:{health_score:"Needs Review",raw_ready:scope_rows.filter(r=>r.raw_status==="raw_ready").length,raw_updated:scope_rows.filter(r=>r.raw_status==="raw_updated").length,needs_review:1,cleanup_needed:1,data_index_rows:scope_rows.length},scope_rows,issues:[{level:"warn",badge:"Hash mismatch",game_code:"CBPC_TH",period_key:month,title:"CBPC_TH ยังใช้ข้อมูลเก่าอยู่",detail:"Raw hash ใหม่กว่า Master hash"}],recommendations:[{title:`ซ่อมข้อมูล CBPC_TH รอบ ${month}`,detail:"Preview ก่อน แล้วค่อย Clear และ Build",cleanup:{target_game_code:"CBPC_TH",target_month:month,run_id:`RUN-CBPC_TH-${month}-OLD`,search_hash:`cbpc_th-${month}-old`}}]};
}
function previewLookup(params={}){
  const game=params.game||"CBM_TH",month=params.month||"2026-06";
  return {ok:true,game,month,query:params.query||"",runs:[{run_id:`RUN-${game}-${month}-001`,game_code:game,period_key:month,status:"ready",data_hash_before:`${game}-${month}-old`,data_hash_after:`${game}-${month}-new`,created_at:new Date(Date.now()-86400000).toISOString()},{run_id:`RUN-${game}-${month}-002`,game_code:game,period_key:month,status:"needs_review",data_hash_before:`${game}-${month}-new`,data_hash_after:`${game}-${month}-newer`,created_at:new Date().toISOString()}]};
}
function previewRawStatus(requestId,includeJobs){
  const item=previewRawRequests.get(requestId); if(!item)return {ok:false,found:false,request_id:requestId,status:"not_found",jobs:[],poll_after_ms:500};
  const elapsed=Date.now()-item.createdAt;
  const status=elapsed<700?"queued":elapsed<1600?"running":"completed";
  const completed=status==="completed"?1:0,running=status==="running"?1:0,queued=status==="queued"?1:0;
  const result={ok:true,found:true,request_id:requestId,batch_id:item.batchId,target_games_csv:item.game,target_months_csv:item.month,total_jobs:1,queued_jobs:queued,running_jobs:running,completed_jobs:completed,failed_jobs:0,raw_ready_count:completed,raw_updated_count:0,raw_partial_count:0,raw_missing_count:0,status,current_job_id:running?item.jobId:"",current_game_code:running?item.game:"",current_period_key:running?item.month:"",requested_by:"local.preview@cqr.local",check_mode:"manual",source:"preview",created_at:new Date(item.createdAt).toISOString(),updated_at:new Date().toISOString(),finished_at:completed?new Date().toISOString():"",error_message:"",jobs_included:Boolean(includeJobs),poll_after_ms:500};
  if(includeJobs)result.jobs=[{job_id:item.jobId,request_id:requestId,game_code:item.game,period_key:item.month,status:"completed",result_status:"raw_ready",tab_count_found:5,tab_count_expected:5,missing_tabs:"",raw_data_hash:`preview-${item.game}-${item.month}-hash`,finished_at:new Date().toISOString(),error_message:""}];
  return result;
}
async function previewBackend(action,params={}){
  await wait(120);
  if(action==="ai.ask") return {ok:true,answer:`จากข้อมูลตัวอย่างของ ${params.game||"ALL"} ช่วง ${params.period||"ALL"} ภาพรวมยังแข็งแรง แต่ควรติดตามการลดลงระหว่าง D1 → D3 ของกลุ่มที่ได้จากแคมเปญแบบติดตั้ง\n\nสิ่งที่ควรตรวจต่อ\n• เทียบ D1, D3 และ D7 แยกตาม Channel\n• ดูขนาดตัวอย่างก่อนปรับงบ\n• ตรวจว่าแนวโน้มเกิดซ้ำในสัปดาห์ล่าสุดหรือไม่`,source:"preview",used_ai_model:"preview-evaluator"};
  if(action==="admin.users.list") return {ok:true,users:previewUsers};
  if(action==="admin.users.upsert"){ const next={email:String(params.email||"").toLowerCase(),display_name:params.display_name||"",role_id:params.role_id||"viewer",status:params.status||"active",allowed_games:params.allowed_games||"ALL",allowed_regions:params.allowed_regions||"ALL",last_login_at:""}; const i=previewUsers.findIndex(u=>u.email===next.email); if(i>=0)previewUsers[i]={...previewUsers[i],...next};else previewUsers.push(next);return {ok:true,user:next,users:previewUsers}; }
  if(action==="admin.users.delete"){ const i=previewUsers.findIndex(u=>u.email===String(params.email||"").toLowerCase()); if(i>=0)previewUsers.splice(i,1);return {ok:true,deleted_email:params.email,users:previewUsers}; }
  if(action==="admin.pipeline.health") return previewHealth(params);
  if(action==="admin.pipeline.run.lookup") return previewLookup(params);
  if(action==="admin.n8n.raw.check"){ const request_id=`PREVIEW-RAW-${Date.now()}`; previewRawRequests.set(request_id,{createdAt:Date.now(),game:params.game||params.target_game_code,month:params.month||params.target_month,batchId:`BATCH-${Date.now()}`,jobId:`JOB-${Date.now()}`}); return {ok:true,status:"accepted",request_id,n8n_result:{ok:true,status:"accepted",request_id,total_jobs:1,queued_jobs:1,message:"Raw Check request queued: 1 job(s)."}}; }
  if(action==="admin.n8n.raw.status") return previewRawStatus(params.request_id,/^(1|true|yes)$/i.test(String(params.include_jobs||"")));
  if(action==="admin.n8n.cleanup.preview") return {ok:true,command:"cleanup.preview",status:"sent",request_id:`PREVIEW-CLEANUP-${Date.now()}`,n8n_result:{ok:true,status:"preview_ready",matched_rows:184320,table_count:6,cross_game_rows:0,message:"Preview completed"}};
  if(action==="admin.n8n.cleanup.run") return {ok:true,command:"cleanup.run",status:"sent",request_id:`CLEAR-${Date.now()}`,n8n_result:{ok:true,status:"completed",deleted_rows:184320,message:"Clear completed"}};
  if(action==="admin.n8n.master.run") return {ok:true,command:"master.run",status:"sent",request_id:`BUILD-${Date.now()}`,n8n_result:{ok:true,status:"completed",registered_rows:184320,dau_rows:1024550,returners_rows:51420,login_rows:812770,message:"Build completed"}};
  throw new Error(`Preview backend does not implement ${action}`);
}
export function callAppsScript(action,params={},timeoutMs=25000){
  return new Promise((resolve,reject)=>{
    const callback=`cqrApi_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script=document.createElement("script");
    const timer=setTimeout(()=>{cleanup();reject(new Error("Apps Script ไม่ตอบกลับภายในเวลาที่กำหนด"));},timeoutMs);
    function cleanup(){clearTimeout(timer);delete window[callback];script.remove();}
    window[callback]=(payload)=>{cleanup();resolve(payload||{});};
    script.onerror=()=>{cleanup();reject(new Error("เรียก Apps Script ไม่สำเร็จ"));};
    const query=new URLSearchParams({action,callback,t:String(Date.now()),user_agent:navigator.userAgent});
    Object.entries(params||{}).forEach(([key,value])=>{if(value!==undefined&&value!==null&&key!=="_timeout_ms")query.set(key,typeof value==="string"?value:JSON.stringify(value));});
    script.src=`${APP_CONFIG.appsScriptUrl}?${query.toString()}`;document.head.appendChild(script);
  });
}
export async function callAuthorized(action,params={},timeoutMs){
  const session=getSavedSession();
  if(!session?.sessionToken) throw new Error("Session หมดอายุ กรุณา Sign in ใหม่");
  if(isPreviewSession(session)) return previewBackend(action,params);
  const result=await callAppsScript(action,{...params,session_token:session.sessionToken},timeoutMs||Number(params?._timeout_ms||25000));
  if(result?.ok===false) throw new Error(result.message||result.error||"Backend request failed");
  return result;
}
export function normalizePayload(result){
  let value=result?.n8n_result??result?.result??result;
  for(let i=0;i<3;i++){ if(Array.isArray(value)&&value.length===1)value=value[0]; if(value?.body&&typeof value.body==="object")value=value.body; else if(value?.json&&typeof value.json==="object")value=value.json; else break; }
  return value||{};
}
