import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { encryptLinodeToken } from "../src/crypto/token-crypto";

const baseEnv = { API_AUTH_TOKEN: "secret-api-token", TELEGRAM_WEBHOOK_SECRET: "telegram-secret", SUPER_ADMIN_TELEGRAM_ID: "123456789", TELEGRAM_BOT_TOKEN: "bot-token", LINODE_TOKEN_ENCRYPTION_KEY: "encryption-key", APP_TIMEZONE: "Asia/Shanghai", BATCH_CONCURRENCY: "5", OPERATION_LOG_RETENTION_DAYS: "1", LOGIN_EVENT_RETENTION_DAYS: "1" };
type Account = { id: number; alias: string; encrypted_token: string; token_fingerprint: string; token_status: string; status: string; group_id?: number | null; created_at: string; updated_at: string; deleted_at: string | null; last_seen_login_id: string | null; last_login_check_at: string | null };
type Schedule = { id: number; name: string; enabled: number; action: string; scope: string; account_id: number | null; group_id?: number | null; instance_id?: number | null; cron_expr: string; timezone: string; last_run_at: string | null; next_run_at: string | null; created_at: string; updated_at: string; deleted_at: string | null; metadata_json: string | null };
type Presence = { id: number; last_checkin_at: string | null; last_checkin_actor: string | null; current_cycle_id: string | null; created_at: string; updated_at: string };
type Policy = { id: number; name: string; enabled: number; scope: string; rules_json: string; created_at: string; updated_at: string; deleted_at: string | null };
type Audit = { action: string; target_type: string; target_id: string | null; risk_level: string; result: string; error_code: string | null; metadata_json: string | null; request_id: string; actor: string; source: string };
type FakeRunRecord = { id?: number; values: unknown[] };
type TelegramMessage = { id: number; chat_id: string; message_id: string; purpose: string; delete_status: string; attempts: number; last_error_code: string | null; created_at: string; deleted_at: string | null; metadata_json: string | null };
class FakePreparedStatement { constructor(private db: FakeD1Database, private sql: string) {} private values: unknown[] = []; bind(...values: unknown[]) { this.values = values; return this; } first<T=unknown>() { return Promise.resolve(this.db.first<T>(this.sql, this.values)); } all<T=unknown>() { return Promise.resolve({ results: this.db.all<T>(this.sql, this.values), success: true, meta: {} }); } run() { return Promise.resolve({ success: true, meta: this.db.run(this.sql, this.values) }); } }
class FakeD1Database {
 settings = new Map<string, string>();
 groups=[{id:1,name:"未分组",is_default:1,created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z",deleted_at:null},{id:2,name:"西班牙",is_default:0,created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z",deleted_at:null}];
 accounts: Account[]=[]; schedules: Schedule[]=[]; presence: Presence | null=null; policies: Policy[]=[]; telegramMessages: TelegramMessage[]=[]; scheduleRuns: FakeRunRecord[]=[]; presenceRuns: FakeRunRecord[]=[]; jobRuns: FakeRunRecord[]=[]; auditLogs: Audit[]=[]; nextPresenceRunId=1; nextTelegramMessageId=1;
 prepare(sql:string){return new FakePreparedStatement(this,sql)}
 first<T>(sql:string, values:unknown[]=[]):T|null{ if(sql.includes("FROM settings")){ const value=this.settings.get(values[0] as string); return value ? ({ value_json: value } as T) : null; } if(sql.includes("FROM telegram_messages")&&sql.includes("SELECT id")) return (this.telegramMessages.find((message)=>message.chat_id===String(values[0])&&message.message_id===String(values[1])&&message.purpose===String(values[2])) as T|undefined)??null; if(sql.includes("FROM admin_presence_policy_runs")) return null; if(sql.includes("FROM admin_presence")) return this.presence as T|null; if(sql.includes("FROM login_events")) return null; if(sql.includes("FROM linode_accounts")&&sql.includes("WHERE id = ?")) return (this.accounts.find(a=>a.id===Number(values[0])) as T|undefined)??null; if(sql.includes("FROM groups")&&sql.includes("WHERE id = ?")) return (this.groups.find(g=>g.id===Number(values[0])&&g.deleted_at===null) as T|undefined)??null; if(sql.includes("FROM groups")&&sql.includes("WHERE is_default = 1")) return (this.groups.find(g=>g.is_default===1&&g.deleted_at===null) as T|undefined)??null; return null; }
 all<T>(sql:string, values:unknown[]=[]):T[]{ if(sql.includes("FROM telegram_messages")) return this.telegramMessages.filter((message)=>message.purpose===String(values[0])&&message.delete_status==="pending"&&message.attempts<3).slice(0, Number(values[1]??100)) as T[]; if(sql.includes("FROM linode_accounts")) return this.accounts.filter(a=>a.status==="active") as T[]; if(sql.includes("FROM groups")) return this.groups.filter(g=>g.deleted_at===null).map(g=>({...g,account_count:this.accounts.filter(a=>Number(a.group_id??1)===g.id&&a.status==="active").length})) as T[]; if(sql.includes("FROM power_schedules")) return this.schedules.filter(s=>s.deleted_at===null).sort((a,b)=>b.id-a.id) as T[]; if(sql.includes("FROM admin_presence_policies")) return this.policies.filter(p=>p.deleted_at===null).sort((a,b)=>b.id-a.id) as T[]; if(sql.includes("FROM security_events")) return [] as T[]; if(sql.includes("FROM jobs")) return ["login_monitor","login_timeout","checkin_monitor","schedule_power","message_cleanup","audit_log_cleanup","security_event_cleanup"].map(name=>({name,type:"system",enabled:1,last_run_at:null,next_run_at:null,last_status:null,summary:null})) as T[]; return []; }
 run(sql:string, values:unknown[]){ const now=new Date().toISOString(); if(sql.includes("INTO telegram_messages")){this.telegramMessages.push({id:this.nextTelegramMessageId++,chat_id:String(values[0]),message_id:String(values[1]),purpose:String(values[2]),delete_status:"pending",attempts:0,last_error_code:null,created_at:now,deleted_at:null,metadata_json:values[3] as string|null}); return {changes:1,last_row_id:this.nextTelegramMessageId-1}} if(sql.includes("UPDATE telegram_messages SET delete_status = 'deleted'")){const message=this.telegramMessages.find((item)=>item.id===Number(values[0])); if(message){message.delete_status="deleted"; message.deleted_at=now; message.attempts+=1;} return {changes:message?1:0}} if(sql.includes("UPDATE telegram_messages SET attempts")){const message=this.telegramMessages.find((item)=>item.id===Number(values[1])); if(message){message.attempts+=1; message.last_error_code=String(values[0]);} return {changes:message?1:0}} if(sql.includes("INTO settings")){this.settings.set(String(values[0]), String(values[1])); return {changes:1}} if(sql.includes("INTO schedule_runs")){this.scheduleRuns.push({values}); return {changes:1}} if(sql.includes("UPDATE power_schedules")&&sql.includes("last_run_at")){const s=this.schedules.find(x=>x.id===Number(values[2])); if(s){s.last_run_at=String(values[0]); s.next_run_at=values[1] as string|null;} return {changes:s?1:0}} if(sql.includes("INTO admin_presence_policy_runs")){this.presenceRuns.push({id:this.nextPresenceRunId++, values}); return {last_row_id:this.nextPresenceRunId-1,changes:1}} if(sql.includes("UPDATE admin_presence_policy_runs")){const run=this.presenceRuns.find((item)=>item.id===Number(values[4])); if(run) run.values=[run.values[0],run.values[1],run.values[2],run.values[3],values[0],values[1],values[2],values[3]]; return {changes:run?1:0}} if(sql.includes("INTO job_runs")){this.jobRuns.push({values}); return {changes:1}} if(sql.includes("DELETE FROM telegram_messages")){const before=this.telegramMessages.length; const cutoff=String(values[0]); this.telegramMessages=this.telegramMessages.filter((message)=>!(message.created_at<cutoff&&(message.delete_status==="deleted"||message.attempts>=3||message.purpose==="auto_delete"||message.purpose==="admin_presence_reminder"))); return {changes:before-this.telegramMessages.length}} if(sql.includes("DELETE FROM audit_logs")){return {changes:0}} if(sql.includes("DELETE FROM security_events")){return {changes:0}} if(sql.includes("DELETE FROM login_events")){return {changes:0}} if(sql.includes("DELETE FROM bot_sessions")){return {changes:0}} if(sql.includes("UPDATE jobs")){return {changes:1}} if(sql.includes("INTO audit_logs")){this.auditLogs.push({request_id:values[0] as string,actor:values[1] as string,source:values[2] as string,action:values[3] as string,target_type:values[4] as string,target_id:values[5] as string|null,risk_level:values[6] as string,result:values[7] as string,error_code:values[8] as string|null,metadata_json:values[9] as string|null}); return {changes:1}} return {changes:0,last_row_id:1}; }
}
async function addAccount(db:FakeD1Database){db.accounts.push({id:1,alias:"default",encrypted_token:await encryptLinodeToken("token-default","encryption-key"),token_fingerprint:"fp_1",token_status:"valid",status:"active",group_id:1,created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z",deleted_at:null,last_seen_login_id:null,last_login_check_at:null})}
async function addSecondAccount(db:FakeD1Database){db.accounts.push({id:2,alias:"spain",encrypted_token:await encryptLinodeToken("token-spain","encryption-key"),token_fingerprint:"fp_2",token_status:"valid",status:"active",group_id:2,created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z",deleted_at:null,last_seen_login_id:null,last_login_check_at:null})}
function instanceList(id=101){return {data:[{id,label:`vm-${id}`,status:"running",region:"jp-osa",type:"g6-standard-1"}]}}

describe("Phase 15 job runner",()=>{
 it("Cloudflare scheduled handler runs due schedule_power and checkin_monitor jobs, records runs, and never leaks tokens", async()=>{
  const db=new FakeD1Database(); await addAccount(db);
  db.schedules.push({id:1,name:"due shutdown",enabled:1,action:"shutdown",scope:"all",account_id:null,cron_expr:"*/5 * * * *",timezone:"Asia/Shanghai",last_run_at:null,next_run_at:"2026-01-01T00:00:00.000Z",created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z",deleted_at:null,metadata_json:null});
  db.presence={id:1,last_checkin_at:"2026-01-01T00:00:00.000Z",last_checkin_actor:"api:default",current_cycle_id:"cycle_1",created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z"};
  db.policies.push({id:1,name:"notify stale",enabled:1,scope:"all",rules_json:JSON.stringify({rules:[{rule_id:"notify_1m",after_minutes:1,action:"notify"}]}),created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z",deleted_at:null});
  const env={...baseEnv,TELEGRAM_BOT_TOKEN:"123456:realish-token",DB:db as unknown as D1Database};
  const calls:string[]=[]; const telegramBodies:string[]=[]; const fetchMock=vi.spyOn(globalThis,"fetch").mockImplementation(async(input,init)=>{calls.push(`${init?.method??"GET"} ${String(input)} ${new Headers(init?.headers).get("authorization")??""}`); if(String(input).includes("api.linode.com")&&String(input).endsWith("/linode/instances")) return new Response(JSON.stringify(instanceList()),{status:200}); if(String(input).includes("api.linode.com")&&String(input).endsWith("/account/logins")) return new Response(JSON.stringify({data:[{id:"login-1",username:"root",ip:"203.0.113.10",datetime:"2026-01-01T00:09:00.000Z",status:"successful"}]}),{status:200}); if(String(input).includes("api.linode.com")) return new Response(null,{status:200}); if(String(input).includes("api.telegram.org")){ telegramBodies.push(String(init?.body??"")); return new Response(JSON.stringify({ok:true}),{status:200}); } return new Response(null,{status:200});});
  try{
   const result = await worker.scheduled({ scheduledTime: Date.parse("2026-01-01T00:10:00.000Z"), cron: "*/5 * * * *", noRetry(){} } as ScheduledController, env as never, { waitUntil(promise:Promise<unknown>){ return promise; }, passThroughOnException(){} } as unknown as ExecutionContext);
   const raw=JSON.stringify({result, auditLogs: db.auditLogs, jobRuns: db.jobRuns, scheduleRuns: db.scheduleRuns, presenceRuns: db.presenceRuns});
   expect(db.scheduleRuns.length).toBe(1);
   expect(db.presenceRuns.length).toBe(1);
   expect(db.jobRuns.length).toBe(7);
   expect(db.schedules[0].last_run_at).toEqual(expect.any(String));
   expect(calls).toEqual(expect.arrayContaining(["GET https://api.linode.com/v4/account/logins Bearer token-default", "GET https://api.linode.com/v4/linode/instances Bearer token-default", "POST https://api.linode.com/v4/linode/instances/101/shutdown Bearer token-default"]));
	   expect(calls.some((call)=>call.startsWith("POST https://api.telegram.org/bot123456:realish-token/sendMessage"))).toBe(true);
   expect(telegramBodies.some((body)=>body.includes("#linode 登录通知")&&body.includes("📌 类型：#Login")&&body.includes("👤 用户：root")&&body.includes("🌐 IP：203.0.113.10")&&body.includes("✅ 是我登录")&&body.includes("🛑 一键关机")&&body.includes("🚀 一键开机")&&body.includes("🗑 超时删机保护"))).toBe(true);
   expect(telegramBodies.some((body)=>body.includes("#linode 定时批量关机")&&body.includes("执行时间：自定义 Cron")&&body.includes("成功：")&&body.includes("vm-101（#101）"))).toBe(true);
   expect(telegramBodies.join("\n")).not.toContain("账号安全登录通知");
   expect(telegramBodies.join("\n")).not.toContain("🚨 不是我");
   expect(db.auditLogs).toEqual(expect.arrayContaining([expect.objectContaining({action:"batch.shutdown",source:"cron",result:"success"}), expect.objectContaining({action:"admin_presence.policy.notify",target_type:"admin_presence_policy",risk_level:"medium",result:"success"})]));
   expect(db.presenceRuns[0]).toEqual(expect.objectContaining({values: expect.arrayContaining([1, "notify_1m", "cycle_1", "notify", "success"])}));
   expect(raw).not.toContain("token-default");
   expect(raw).not.toContain("encrypted_token");
  } finally { fetchMock.mockRestore(); }
 });
 it("runs admin presence final actions only within the configured account or group scope", async()=>{
  const db=new FakeD1Database(); await addAccount(db); await addSecondAccount(db);
  db.presence={id:1,last_checkin_at:"2026-01-01T00:00:00.000Z",last_checkin_actor:"api:default",current_cycle_id:"cycle_1",created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z"};
  db.policies.push({id:1,name:"delete group stale",enabled:1,scope:"group:2",rules_json:JSON.stringify({rules:[{rule_id:"delete_all_instances",after_minutes:1,action:"delete_all_instances"}]}),created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z",deleted_at:null});
  const env={...baseEnv,DB:db as unknown as D1Database};
  const calls:string[]=[]; const fetchMock=vi.spyOn(globalThis,"fetch").mockImplementation(async(input,init)=>{const auth=new Headers(init?.headers).get("authorization")??""; calls.push(`${init?.method??"GET"} ${String(input)} ${auth}`); if(String(input).endsWith("/linode/instances")&&auth.includes("token-spain")) return new Response(JSON.stringify(instanceList(202)),{status:200}); if(String(input).endsWith("/linode/instances")) return new Response(JSON.stringify(instanceList(101)),{status:200}); if(String(input).includes("api.linode.com")) return new Response(null,{status:200}); return new Response(JSON.stringify({ok:true}),{status:200});});
  try{
   await worker.scheduled({ scheduledTime: Date.parse("2026-01-01T00:10:00.000Z"), cron: "*/5 * * * *", noRetry(){} } as ScheduledController, env as never, { waitUntil(promise:Promise<unknown>){ return promise; }, passThroughOnException(){} } as unknown as ExecutionContext);
   expect(calls).toEqual(expect.arrayContaining(["GET https://api.linode.com/v4/linode/instances Bearer token-spain", "DELETE https://api.linode.com/v4/linode/instances/202 Bearer token-spain"]));
   expect(calls).not.toEqual(expect.arrayContaining(["DELETE https://api.linode.com/v4/linode/instances/101 Bearer token-default"]));
   expect(db.auditLogs).toEqual(expect.arrayContaining([expect.objectContaining({action:"batch.delete",source:"cron",target_id:"202",result:"success"}), expect.objectContaining({action:"admin_presence.policy.delete_all_instances",target_id:"1",risk_level:"critical",result:"success"})]));
   expect(db.presenceRuns.length).toBe(1);
  } finally { fetchMock.mockRestore(); }
 });

 it("continues all-account delete final action across every active key even when one key fails", async()=>{
  const db=new FakeD1Database(); await addAccount(db); await addSecondAccount(db);
  db.presence={id:1,last_checkin_at:"2026-01-01T00:00:00.000Z",last_checkin_actor:"api:default",current_cycle_id:"cycle_1",created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z"};
  db.policies.push({id:1,name:"delete all stale",enabled:1,scope:"all",rules_json:JSON.stringify({rules:[{rule_id:"delete_all_instances",after_minutes:1,action:"delete_all_instances"}]}),created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z",deleted_at:null});
  const env={...baseEnv,DB:db as unknown as D1Database};
  const calls:string[]=[]; const fetchMock=vi.spyOn(globalThis,"fetch").mockImplementation(async(input,init)=>{const auth=new Headers(init?.headers).get("authorization")??""; calls.push(`${init?.method??"GET"} ${String(input)} ${auth}`); if(String(input).endsWith("/linode/instances")&&auth.includes("token-default")) return new Response(JSON.stringify(instanceList(101)),{status:200}); if(String(input).endsWith("/linode/instances")&&auth.includes("token-spain")) return new Response(JSON.stringify({errors:[{reason:"bad token"}]}),{status:401}); if(String(input).includes("api.linode.com")) return new Response(null,{status:200}); return new Response(JSON.stringify({ok:true}),{status:200});});
  try{
   await worker.scheduled({ scheduledTime: Date.parse("2026-01-01T00:10:00.000Z"), cron: "*/5 * * * *", noRetry(){} } as ScheduledController, env as never, { waitUntil(promise:Promise<unknown>){ return promise; }, passThroughOnException(){} } as unknown as ExecutionContext);
   expect(calls).toEqual(expect.arrayContaining(["GET https://api.linode.com/v4/linode/instances Bearer token-default", "GET https://api.linode.com/v4/linode/instances Bearer token-spain", "DELETE https://api.linode.com/v4/linode/instances/101 Bearer token-default"]));
   expect(db.auditLogs).toEqual(expect.arrayContaining([expect.objectContaining({action:"batch.delete",target_id:"101",result:"success"}), expect.objectContaining({action:"batch.delete",target_id:"2",result:"failed",error_code:"TOKEN_INVALID"}), expect.objectContaining({action:"admin_presence.policy.delete_all_instances",target_id:"1",result:"partial_failed"})]));
  } finally { fetchMock.mockRestore(); }
 });

 it("skips locked jobs and claimed schedules to avoid duplicate cron execution", async()=>{
  const db=new FakeD1Database(); await addAccount(db);
  db.schedules.push({id:1,name:"due shutdown",enabled:1,action:"shutdown",scope:"all",account_id:null,cron_expr:"*/5 * * * *",timezone:"Asia/Shanghai",last_run_at:null,next_run_at:"2026-01-01T00:00:00.000Z",created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z",deleted_at:null,metadata_json:null});
  const env={...baseEnv,DB:db as unknown as D1Database};
  let firstClaim = true;
  const originalRun = db.run.bind(db);
  db.run = (sql:string, values:unknown[])=>{
    if(sql.includes("UPDATE jobs")&&sql.includes("locked_until")&&values[3]==="schedule_power") return {changes:0};
    if(sql.includes("UPDATE power_schedules")&&sql.includes("next_run_at = ?")) {
      if(firstClaim){ firstClaim=false; return originalRun(sql, values); }
      return {changes:0};
    }
    return originalRun(sql, values);
  };
  const fetchMock=vi.spyOn(globalThis,"fetch").mockImplementation(async(input,init)=>{
    if(String(input).includes("api.linode.com")&&String(input).endsWith("/linode/instances")) return new Response(JSON.stringify(instanceList()),{status:200});
    if(String(input).includes("api.linode.com")) return new Response(null,{status:200});
    return new Response(JSON.stringify({ok:true}),{status:200});
  });
  try{
   const result = await worker.scheduled({ scheduledTime: Date.parse("2026-01-01T00:10:00.000Z"), cron: "*/5 * * * *", noRetry(){} } as ScheduledController, env as never, { waitUntil(promise:Promise<unknown>){ return promise; }, passThroughOnException(){} } as unknown as ExecutionContext);
   expect(result).toBeUndefined();
   expect(db.scheduleRuns.length).toBe(0);
   expect(db.jobRuns.length).toBe(6);
  } finally { fetchMock.mockRestore(); }
 });

 it("uses bootstrapped Super Admin chat_id for cron Telegram notifications when env id is omitted", async()=>{
  const db=new FakeD1Database(); await addAccount(db);
  db.presence={id:1,last_checkin_at:"2026-01-01T00:00:00.000Z",last_checkin_actor:"api:default",current_cycle_id:"cycle_1",created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z"};
  db.policies.push({id:1,name:"notify stale",enabled:1,scope:"all",rules_json:JSON.stringify({rules:[{rule_id:"notify_1m",after_minutes:1,action:"notify"}]}),created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z",deleted_at:null});
  const env={...baseEnv,TELEGRAM_BOT_TOKEN:"123456:realish-token",SUPER_ADMIN_TELEGRAM_ID:undefined,DB:db as unknown as D1Database};
  const calls:Array<{url:string; body:string}>=[];
  const fetchMock=vi.spyOn(globalThis,"fetch").mockImplementation(async(input,init)=>{
    if(String(input).includes("api.linode.com")&&String(input).endsWith("/account/logins")) return new Response(JSON.stringify({data:[]}),{status:200});
    if(String(input).includes("api.telegram.org")){ calls.push({url:String(input),body:String(init?.body??"")}); return new Response(JSON.stringify({ok:true,result:{message_id:88}}),{status:200}); }
    return new Response(JSON.stringify({data:[]}),{status:200});
  });
  try{
   db.settings = new Map([["super_admin", JSON.stringify({telegram_user_id:"987654321", chat_id:"987654321"})]]);
   await worker.scheduled({ scheduledTime: Date.parse("2026-01-01T13:00:00.000Z"), cron: "*/5 * * * *", noRetry(){} } as ScheduledController, env as never, { waitUntil(promise:Promise<unknown>){ return promise; }, passThroughOnException(){} } as unknown as ExecutionContext);
   expect(calls.some((call)=>call.url.includes("/sendMessage") && call.body.includes('"chat_id":"987654321"'))).toBe(true);
   expect(db.telegramMessages).toEqual(expect.arrayContaining([
    expect.objectContaining({chat_id:"987654321", message_id:"88", purpose:"admin_presence_reminder"})
   ]));
   expect(db.telegramMessages.some((message)=>message.purpose==="auto_delete"&&message.message_id==="88")).toBe(false);
  } finally { fetchMock.mockRestore(); }
 });

 it("message_cleanup deletes due Telegram messages and skips messages outside the deletion window", async()=>{
  const db=new FakeD1Database();
  db.settings.set("app_settings", JSON.stringify({ telegram_auto_delete_minutes: 1 }));
  db.telegramMessages.push(
    { id: 1, chat_id: "123456789", message_id: "101", purpose: "auto_delete", delete_status: "pending", attempts: 0, last_error_code: null, created_at: "2026-01-01T00:08:30.000Z", deleted_at: null, metadata_json: null },
    { id: 2, chat_id: "123456789", message_id: "102", purpose: "auto_delete", delete_status: "pending", attempts: 0, last_error_code: null, created_at: "2026-01-01T00:09:45.000Z", deleted_at: null, metadata_json: null },
    { id: 3, chat_id: "123456789", message_id: "103", purpose: "auto_delete", delete_status: "pending", attempts: 0, last_error_code: null, created_at: "2025-12-29T00:00:00.000Z", deleted_at: null, metadata_json: null }
  );
  const originalAll = db.all.bind(db);
  db.all = <T>(sql:string, values:unknown[]=[]):T[] => {
    if(sql.includes("FROM jobs")) return ["login_monitor","login_timeout","checkin_monitor","schedule_power","message_cleanup","audit_log_cleanup","security_event_cleanup"].map(name=>({name,type:"system",enabled:1,last_run_at:null,next_run_at:name==="message_cleanup"?"2026-01-01T00:09:00.000Z":"2026-01-01T00:15:00.000Z",last_status:null,summary:null})) as T[];
    return originalAll<T>(sql, values);
  };
  const env={...baseEnv,TELEGRAM_BOT_TOKEN:"123456:realish-token",DB:db as unknown as D1Database};
  const calls:Array<{url:string; body:string}>=[];
  const fetchMock=vi.spyOn(globalThis,"fetch").mockImplementation(async(input,init)=>{
    calls.push({url:String(input),body:String(init?.body??"")});
    return new Response(JSON.stringify({ok:true,result:true}),{status:200});
  });
  try{
   await worker.scheduled({ scheduledTime: Date.parse("2026-01-01T00:10:00.000Z"), cron: "* * * * *", noRetry(){} } as ScheduledController, env as never, { waitUntil(promise:Promise<unknown>){ return promise; }, passThroughOnException(){} } as unknown as ExecutionContext);
   expect(calls).toHaveLength(1);
   expect(calls[0]).toMatchObject({ url: "https://api.telegram.org/bot123456:realish-token/deleteMessage" });
   expect(calls[0].body).toContain('"message_id":101');
   expect(db.telegramMessages.find((message)=>message.id===1)).toMatchObject({ delete_status: "deleted", attempts: 1 });
   expect(db.telegramMessages.find((message)=>message.id===2)).toMatchObject({ delete_status: "pending", attempts: 0 });
   expect(db.telegramMessages.find((message)=>message.id===3)).toBeUndefined();
   expect(db.jobRuns).toHaveLength(1);
   expect(JSON.parse(String(db.jobRuns[0].values[5]))).toMatchObject({ deleted_telegram_messages: 1, failed_telegram_messages: 1, auto_delete_minutes: 1, purged_telegram_message_records: 1 });
  } finally { fetchMock.mockRestore(); }
 });

});
