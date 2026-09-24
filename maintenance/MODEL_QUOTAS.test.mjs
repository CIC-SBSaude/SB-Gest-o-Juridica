import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveModelLimits } from '../server/services/aiModelLimits.ts';
import { providerDayStart, providerDayKey, providerNextReset } from '../server/services/aiQuotaClock.ts';
import { readProviderUsage } from '../server/services/aiProviderUsage.ts';
import { observedDailyRequestLimit } from '../server/services/aiProviderQuotaEvidence.ts';
import { classifyProviderLimit } from '../server/services/aiRouterService.ts';

test('quota_exceeded without daily evidence does not block the whole day', () => {
 assert.equal(classifyProviderLimit({status:429,code:'quota_exceeded',message:'requests per minute exceeded'}),'RATE_LIMIT');
 assert.equal(classifyProviderLimit({status:429,code:'quota_exceeded',message:'quota exceeded'}),'UNKNOWN_429');
 assert.equal(classifyProviderLimit({status:429,code:'quota_exceeded',message:'GenerateRequestsPerDayPerProjectPerModel exceeded'}),'DAILY_QUOTA');
});

test('Lite has independent quota; zero disables and unknown aliases fail closed', () => {
 assert.equal(resolveModelLimits('gemini-3-flash-preview').providerRpd,20);
 assert.equal(resolveModelLimits('gemini-3.5-flash-lite',{provider_rpd:20}).providerRpd,500);
 assert.equal(resolveModelLimits('gemini-3.8-flash').providerRpd,20);
 assert.equal(resolveModelLimits('gemini-pro-latest').providerRpd,0);
 assert.equal(resolveModelLimits('gemini-3.5-flash-lite',{model_limits:{'gemini-3.5-flash-lite':{provider_rpd:0}}}).providerRpd,0);
});

test('provider daily request limit is read from structured quota evidence only', () => {
 const stored = JSON.stringify({message:JSON.stringify({error:{code:429,details:[
  {'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[
   {quotaMetric:'generativelanguage.googleapis.com/generate_content_free_tier_requests',quotaId:'GenerateRequestsPerDayPerProjectPerModel-FreeTier',quotaValue:'20'},
   {quotaMetric:'generativelanguage.googleapis.com/generate_content_free_tier_input_token_count',quotaId:'GenerateContentInputTokensPerModelPerMinute-FreeTier',quotaValue:'0'},
  ]},
 ]}})});
 assert.equal(observedDailyRequestLimit(stored),20);
 assert.equal(observedDailyRequestLimit('bad json'),null);
 assert.equal(observedDailyRequestLimit(JSON.stringify({message:JSON.stringify({error:{details:[
  {'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[
   {quotaMetric:'generativelanguage.googleapis.com/generate_content_free_tier_requests',quotaId:'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',quotaValue:'5'},
  ]},
 ]}})})),null);
});
test('quota reset follows Pacific midnight including DST transitions', () => {
 for (const [date,start] of [
 ['2026-09-13T06:59:59Z','2026-09-12T07:00:00.000Z'],
 ['2026-09-13T07:00:00Z','2026-09-13T07:00:00.000Z'],
 ['2026-03-08T12:00:00Z','2026-03-08T08:00:00.000Z'],
 ['2026-11-01T12:00:00Z','2026-11-01T07:00:00.000Z']]) {
 assert.equal(providerDayStart(new Date(date)),start);
 }
 assert.equal(providerDayKey(new Date('2026-09-13T03:39:00Z')),'2026-09-12');
 assert.equal(providerNextReset(new Date('2026-09-13T12:00:00Z')),'2026-09-14T07:00:00.000Z');
 assert.equal(providerNextReset(new Date('2026-11-01T12:00:00Z')),'2026-11-02T08:00:00.000Z');
});
test('usage includes prior alias and paginates beyond API row limits', async () => {
 let pages=0;
 const db={from(table) {
 const q={select(){return q},in(_key,models){assert.ok(models.includes('gemini-flash-lite-latest'));return q},
 gte(_key,start){assert.equal(start,'2026-09-13T07:00:00.000Z');return q},order(){return q},
 range(offset){pages++;return Promise.resolve({data:Array.from({length:offset===0?500:1},()=>({requests_count:1,input_tokens:2,output_tokens:3}))})}};
 if(table==='ai_usage_daily')q.then=(resolve)=>resolve({data:[]});
 return q;
 }};
 const result=await readProviderUsage(db,'gemini-3.5-flash-lite','2026-09-13T07:00:00.000Z');
 assert.equal(pages,2);assert.equal(result.requests,501);assert.equal(result.exhausted,false);
});

import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
test('actual budget function uses selected model and provider-day usage', async () => {
 const code=stripTypeScriptTypes(readFileSync(new URL('../server/services/aiUsageService.ts',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replaceAll('export ','');
 let selected;
 const run=new Function('getAiRuntimeConfig','providerDayStart','providerDayKey','providerNextReset','readProviderUsage',code+';return getAiBudgetState;')(
 async(_db,model)=>{selected=model;return {model,effectiveRpd:475,effectiveRpm:14,effectiveTpm:237500}},
 ()=> '2026-09-13T07:00:00.000Z',
 ()=> '2026-09-13',
 ()=> '2026-09-14T07:00:00.000Z',
 async()=>({requests:19,inputTokens:40,outputTokens:5,exhausted:false,quotaExhaustedAt:null}));
 const db={from(){return {select(){return this},eq(){return this},maybeSingle(){return this},then(resolve){resolve({data:null,count:0})}}}};
 const result=await run(db,{model:'gemini-3.5-flash-lite'});
 assert.equal(selected,'gemini-3.5-flash-lite');assert.equal(result.allowed,true);assert.equal(result.requestsToday,19);
});
