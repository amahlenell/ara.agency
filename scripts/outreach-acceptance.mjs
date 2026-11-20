import assert from 'node:assert/strict';
export async function outreachAcceptance({request,json,cookie,db,prospect,auditId,origin}){
 const create={prospect_id:prospect.id,audit_id:auditId,finding_ids:['title'],channel:'email'};
 assert.equal((await request('/studio/api/outreach','POST',create)).status,401);
 let result=await json(await request('/studio/api/outreach','POST',create,cookie),201);let row=result.outreach;const base='/studio/api/outreach/'+row.id;
 assert.equal(row.content.recipient,'');assert.equal(row.status,'draft');assert.ok(row.content.body.includes('Page title'));
 const content={...row.content,recipient:'fixture-recipient@example.com',subject:'Reviewed fixture outreach'};
 result=await json(await request(base,'PATCH',{revision:row.revision,content},cookie),200);row=result.outreach;
 assert.equal((await request(base,'PATCH',{revision:1,content},cookie)).status,409);
 for(const route of ['/studio/outreach','/studio/outreach/new','/studio/outreach/new?prospect='+prospect.id,'/studio/outreach/'+row.id,'/studio/pipeline','/studio/pipeline?due=true&view=list']){const response=await request(route,'GET',undefined,cookie);assert.equal(response.status,200);assert.match(response.headers.get('x-robots-tag'),/noindex/);const html=await response.text();assert.ok(!html.includes('Internal Server Error'),route);}
 const action=async(name,extra={},status=200)=>json(await request(base+'/actions','POST',{action:name,revision:row.revision,...extra},cookie),status);
 result=await action('submit');row=result.outreach;await action('approve',{},400);result=await action('approve',{confirmed:true});row=result.outreach;
 const copy=await action('copy');assert.equal(copy.outreach.status,'approved');assert.equal(copy.outreach.sent_recorded_at,null);
 await action('record_sent',{},400);const date=new Date(Date.now()+86400000).toISOString();result=await action('record_sent',{confirmed:true,prospect_version:result.prospect.updated_at,follow_up_at:date});row=result.outreach;assert.equal(row.status,'sent');assert.ok(row.sent_recorded_at);
 const sentTime=row.sent_recorded_at;const retry=await action('record_sent',{confirmed:true,prospect_version:'2000-01-01T00:00:00Z'});assert.equal(retry.outreach.sent_recorded_at,sentTime);
 assert.equal((await request(base,'PATCH',{revision:row.revision,content},cookie)).status,409);
 const follow=await json(await request('/studio/api/outreach','POST',{...create,reply_to_id:row.id},cookie),201);assert.equal(follow.outreach.reply_to_id,row.id);
 let version=(await db.query("select to_char(updated_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') value from studio_prospects where id=$1",[prospect.id])).rows[0].value;
 const patch={expected_updated_at:version,priority:'high',follow_up_at:new Date(Date.now()-60000).toISOString()};await json(await request('/studio/api/prospects/'+prospect.id+'/pipeline','PATCH',patch,cookie),200);assert.equal((await request('/studio/api/prospects/'+prospect.id+'/pipeline','PATCH',patch,cookie)).status,409);
 const due=await (await request('/studio/pipeline?due=true&view=list','GET',undefined,cookie)).text();assert.ok(due.includes('Fixture Salon'));
 const prefPath='/studio/api/prospects/'+prospect.id+'/outreach-preference';let preference=(await json(await request(prefPath,'POST',{blocked:true,revision:0,reason:'Fictional pause request',confirmed:false},cookie),200)).preference;
 assert.equal(preference.blocked,true);assert.equal((await request('/studio/api/outreach','POST',create,cookie)).status,409);await action('copy',{},409);
 assert.equal((await request(prefPath,'POST',{blocked:false,revision:preference.revision,reason:'Fictional resume',confirmed:false},cookie)).status,403);
 preference=(await json(await request(prefPath,'POST',{blocked:false,revision:preference.revision,reason:'Fictional resume',confirmed:true},cookie),200)).preference;assert.equal(preference.blocked,false);
 const blocked=await fetch(origin+base+'/actions',{method:'POST',headers:{origin:'https://other.example',cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'copy',revision:row.revision})});assert.equal(blocked.status,403);
 const reopened=await (await request('/studio/outreach/'+row.id,'GET',undefined,cookie)).text();assert.ok(reopened.includes('Reviewed fixture outreach'));assert.ok(reopened.includes('Manual contact record'));
 console.log('Outreach acceptance passed: draft persistence and reopening, review, manual copy/send records, idempotent retry, follow-ups, six screens, partial pipeline writes, stale edits, pause/resume and CSRF. No message was sent.');
}
