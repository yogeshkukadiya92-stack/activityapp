import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { addAudiencePeople, addResponse, authenticateUser, closeStorage, controlSession, createAudienceGroup, createTemplate, createWorkshop, createWorkspaceMember, deleteActivity, deleteTemplate, deleteWorkspaceMember, deleteWorkshop, getAudience, getAuthUser, getJoinCodeForSession, getReportExportRows, getReports, getSession, getTemplate, getWorkspace, getWorkshop, joinSession, listTemplates, listWorkshops, moderateResponse, revokeAuthSession, saveActivity, storageDriver, storageHealth, tickLiveSessions, updateOrganization, updateWorkspaceMember, updateWorkshop, useTemplate, writeAudit } from './store.mjs';
import { addAudiencePeople, addLeadContactLog, addResponse, assignLead, authenticateUser, closeStorage, controlSession, createAudienceGroup, createLead, createTemplate, createWorkshop, createWorkspaceMember, deleteActivity, deleteTemplate, deleteWorkspaceMember, deleteWorkshop, getAudience, getAuthUser, getLeadById, getLeadReports, getLeadWorkshopHistory, getLeads, getJoinCodeForSession, getReportExportRows, getReports, getSession, getTemplate, getWorkspace, getWorkshop, joinSession, listTemplates, listWorkshops, moderateResponse, revokeAuthSession, saveActivity, storageDriver, storageHealth, tickLiveSessions, trackLeadWorkshopEvent, updateLead, updateOrganization, updateWorkspaceMember, updateWorkshop, useTemplate, writeAudit } from './store.mjs';
import { acquireTickLease, allowDistributedRequest, broadcastCluster, closeRealtime, initRealtime, realtimeHealth } from './realtime.mjs';
import { runtimeInfo } from './config.mjs';

const port=Number(process.env.PORT||process.env.API_PORT||8787);
const serveFrontend=process.argv.includes('--serve');
const production=process.env.NODE_ENV==='production';
const clients=new Map();
const allowedOrigins=new Set(String(process.env.PUBLIC_ORIGIN||'http://localhost:5173,http://localhost:8787').split(',').map(value=>value.trim()).filter(Boolean));

const corsOrigin=req=>{const origin=req.headers.origin;if(!origin)return production?'null':'*';return allowedOrigins.has(origin)?origin:'null'};
const securityHeaders={
  'x-content-type-options':'nosniff','referrer-policy':'same-origin','x-frame-options':'DENY',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy':'same-origin',
  ...(production?{'strict-transport-security':'max-age=31536000; includeSubDomains'}:{}),
};
const json=(req,res,status,body)=>{res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':corsOrigin(req),'vary':'Origin','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',...securityHeaders});res.end(JSON.stringify(body))};
const clientIp=req=>process.env.TRUST_PROXY==='true'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim():String(req.socket.remoteAddress||'unknown');
const bearer=req=>String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1]||'';
const requirePresenter=async(req,res)=>{const user=await getAuthUser(bearer(req));if(!user){json(req,res,401,{error:'Presenter authentication required'});return null}if(!['admin','presenter'].includes(user.role)){json(req,res,403,{error:'Insufficient permission'});return null}return user};
const readBody=async req=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1_000_000)return null;chunks.push(chunk)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return null}};
const localBroadcast=(code,payload)=>{const raw=JSON.stringify(payload);for(const [socket,meta] of clients)if(meta.code===code&&socket.readyState===WebSocket.OPEN)socket.send(raw)};
const broadcast=async(code,event='session')=>{const state=await getSession(code);await broadcastCluster(code,{event,state})};
const csvCell=value=>`"${String(value??'').replaceAll('"','""')}"`;

await initRealtime(localBroadcast);

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(req.method==='OPTIONS')return json(req,res,204,{});
    if(url.pathname==='/api/health')return json(req,res,200,{ok:true,service:'cfl-live-api',...runtimeInfo});
    if(url.pathname==='/api/ready'){
      const [databaseResult,realtimeResult]=await Promise.allSettled([storageHealth(),realtimeHealth()]);
      const database=databaseResult.status==='fulfilled'?databaseResult.value:{ok:false,error:'unavailable'};
      const realtime=realtimeResult.status==='fulfilled'?realtimeResult.value:{ok:false,error:'unavailable'};
      const ready=databaseResult.status==='fulfilled'&&realtimeResult.status==='fulfilled'&&(!production||database.driver==='postgresql'&&realtime.driver==='redis'&&realtime.ok===true);
      return json(req,res,ready?200:503,{ok:ready,database,realtime,...runtimeInfo});
    }
    if(url.pathname==='/api/auth/login'&&req.method==='POST'){
      if(!await allowDistributedRequest(`login:${clientIp(req)}`,10,15*60*1000))return json(req,res,429,{error:'Too many login attempts. Try again later.'});
      const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid or oversized JSON'});
      const result=await authenticateUser(body.email,body.password);return result?json(req,res,200,result):json(req,res,401,{error:'Invalid email or password'});
    }
    if(url.pathname==='/api/auth/me'&&req.method==='GET'){const user=await getAuthUser(bearer(req));return user?json(req,res,200,{user}):json(req,res,401,{error:'Not authenticated'})}
    if(url.pathname==='/api/auth/logout'&&req.method==='POST'){await revokeAuthSession(bearer(req));return json(req,res,200,{ok:true})}
    if(url.pathname==='/api/organization'){
      const user=await requirePresenter(req,res);if(!user)return;
      if(req.method==='GET'){const workspace=await getWorkspace(user.id);return workspace?json(req,res,200,{workspace}):json(req,res,404,{error:'Workspace not found'})}
      if(req.method==='PATCH'){const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid JSON'});const workspace=await updateOrganization(user.id,body);if(workspace?.error){const messages={forbidden:'Workspace admin permission required',invalid_name:'Organization name must contain at least two characters',invalid_sender_email:'Default sender email must be valid'};return json(req,res,workspace.error==='forbidden'?403:422,{error:messages[workspace.error]||'Organization settings are invalid'})}return json(req,res,200,{workspace})}
    }
    if(url.pathname==='/api/organization/members'&&req.method==='POST'){
      const user=await requirePresenter(req,res);if(!user)return;const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid JSON'});const workspace=await createWorkspaceMember(user.id,body);if(workspace?.error){const messages={forbidden:'Workspace admin permission required',invalid_member:'A valid name and email are required',weak_password:'A temporary password of at least 12 characters is required',already_member:'This user is already a workspace member'};return json(req,res,workspace.error==='forbidden'?403:422,{error:messages[workspace.error]||'Member could not be created'})}return json(req,res,201,{workspace});
    }
    const workspaceMemberMatch=url.pathname.match(/^\/api\/organization\/members\/([a-z0-9-]+)$/i);
    if(workspaceMemberMatch&&req.method==='PATCH'){
      const user=await requirePresenter(req,res);if(!user)return;const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid JSON'});const workspace=await updateWorkspaceMember(user.id,workspaceMemberMatch[1],body);if(workspace?.error){const messages={forbidden:'Workspace admin permission required',not_found:'Member not found',owner_required:'Only an owner can manage owners',self_protected:'You cannot disable or demote your own owner account',last_owner:'The workspace must keep at least one active owner'};return json(req,res,workspace.error==='forbidden'||workspace.error==='owner_required'?403:422,{error:messages[workspace.error]||'Member could not be updated'})}return json(req,res,200,{workspace});
    }
    if(workspaceMemberMatch&&req.method==='DELETE'){
      const user=await requirePresenter(req,res);if(!user)return;const workspace=await deleteWorkspaceMember(user.id,workspaceMemberMatch[1]);if(workspace?.error){const messages={forbidden:'Workspace admin permission required',not_found:'Member not found',self_protected:'You cannot remove your own account',owner_protected:'Transfer or demote ownership before removing this member'};return json(req,res,workspace.error==='forbidden'?403:422,{error:messages[workspace.error]||'Member could not be removed'})}return json(req,res,200,{workspace});
    }
    if(url.pathname==='/api/dashboard'&&req.method==='GET'){
      const user=await requirePresenter(req,res);if(!user)return;
      const [workshops,report,audience,templates]=await Promise.all([listWorkshops(),getReports(null,30),getAudience('','all','all'),listTemplates('','all')]);
      const recent=await Promise.all(workshops.slice(0,4).map(async workshop=>{const detail=await getReports(workshop.id,30);return{...workshop,participants:detail.selectedWorkshop?.participants??workshop.participantCount??0,responses:detail.selectedWorkshop?.responses??0}}));
      const nextWorkshop=workshops.find(item=>item.status==='live')||workshops.find(item=>item.status==='ready'||item.status==='paused')||workshops[0]||null;
      const nextSession=nextWorkshop?await getSession(nextWorkshop.joinCode):null;
      return json(req,res,200,{dashboard:{summary:{workshops:workshops.length,participants:report.summary.participants,responses:report.summary.responses,engagement:audience.summary.averageEngagement},trend:report.trend,recent,nextWorkshop:nextWorkshop?{...nextWorkshop,participantCount:nextSession?.participantCount??nextWorkshop.participantCount??0,answerCount:nextSession?.answerCount??0}:null,audienceGrowth:audience.summary.activePeople,templateCount:templates.length}});
    }
    if(url.pathname==='/api/reports'&&req.method==='GET'){
      const user=await requirePresenter(req,res);if(!user)return;
      const report=await getReports(url.searchParams.get('workshopId'),url.searchParams.get('days'));return json(req,res,200,{report});
    }
    if(url.pathname==='/api/reports/leads'&&req.method==='GET'){
      const user=await requirePresenter(req,res);if(!user)return;
      const reports=await getLeadReports();return json(req,res,200,{reports});
    }
    if(url.pathname==='/api/reports/export'&&req.method==='GET'){
      const user=await requirePresenter(req,res);if(!user)return;
      const rows=await getReportExportRows(url.searchParams.get('workshopId'),url.searchParams.get('days'));
      const fields=['workshop','joinCode','participant','activity','type','answer','status','createdAt'];
      const csv=[fields.map(csvCell).join(','),...rows.map(row=>fields.map(field=>csvCell(row[field])).join(','))].join('\n');
      await writeAudit(user.id,'report.export','report',url.searchParams.get('workshopId')||'all',{days:url.searchParams.get('days')||30,rows:rows.length});
      res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="cfl-live-report-${new Date().toISOString().slice(0,10)}.csv"`,'access-control-allow-origin':corsOrigin(req),'vary':'Origin','x-content-type-options':'nosniff','cache-control':'no-store'});return res.end(csv);
    }
    if(url.pathname==='/api/audience'){
      const user=await requirePresenter(req,res);if(!user)return;
      if(req.method==='GET'){const audience=await getAudience(url.searchParams.get('q'),url.searchParams.get('status'),url.searchParams.get('groupId'));return json(req,res,200,{audience})}
      if(req.method==='POST'){const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid or oversized JSON'});const people=await addAudiencePeople(body);if(!people.length)return json(req,res,422,{error:'At least one valid email address is required'});await writeAudit(user.id,'audience.invite','audience','bulk',{count:people.length,groupId:body.groupId||null});return json(req,res,201,{people})}
    }
    if(url.pathname==='/api/audience/groups'&&req.method==='POST'){
      const user=await requirePresenter(req,res);if(!user)return;const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid JSON'});const group=await createAudienceGroup(body);if(!group)return json(req,res,422,{error:'A unique group name is required'});await writeAudit(user.id,'audience.group.create','audience_group',group.id,{name:group.name});return json(req,res,201,{group});
    }
    if(url.pathname==='/api/leads'){
      const user=await requirePresenter(req,res);if(!user)return;
      if(req.method==='GET'){
        const leads=await getLeads(url.searchParams.get('q'),url.searchParams.get('status'),url.searchParams.get('source'),url.searchParams.get('assignee'),url.searchParams.get('workshopId'));
        return json(req,res,200,{leads});
      }
      if(req.method==='POST'){
        const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid or oversized JSON'});
        const lead=await createLead(body);if(lead?.error){const messages={missing_identity:'Name, email, or phone is required',invalid_email:'Please provide a valid email',invalid_phone:'Please provide a valid phone number',duplicate_email:'This email already exists',duplicate_phone:'This phone number already exists',invalid_assignee:'Assigned teammate does not exist'};return json(req,res,422,{error:messages[lead.error]||'Lead could not be saved'})}
        await writeAudit(user.id,'lead.create','lead',lead.id,{status:lead.status,source:lead.source,assignee:lead.assignedTo||null});
        return json(req,res,201,{lead});
      }
    }
    const leadMatch=url.pathname.match(/^\/api\/leads\/([a-f0-9-]+)\/(assign|contact-log|workshop-history|track)$/i);
    if(leadMatch){
      const user=await requirePresenter(req,res);if(!user)return;
      const leadId=leadMatch[1],action=leadMatch[2].toLowerCase();
      if(action==='assign'&&req.method==='POST'){
        const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid JSON'});
        const lead=await assignLead(leadId,body.assignedTo||null,user.id);
        if(lead?.error){
          const status=lead.error==='not_found'?404:422;
          const messages={not_found:'Lead not found',invalid_assignee:'Assigned teammate does not exist'};
          return json(req,res,status,{error:messages[lead.error]||'Lead assignment failed'});
        }
        await writeAudit(user.id,'lead.assign','lead',lead.id,{assignee:body.assignedTo||null});
        return json(req,res,200,{lead});
      }
      if(action==='contact-log'&&req.method==='POST'){
        const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid JSON'});
        const log=await addLeadContactLog(leadId,body,user.id);
        if(log?.error){const messages={not_found:'Lead not found',missing_note:'Add a note before saving contact log'};return json(req,res,422,{error:messages[log.error]||'Contact log could not be saved'})}
        await writeAudit(user.id,'lead.contact','lead',leadId,{method:body.method||'other'});
        return json(req,res,200,{log});
      }
      if(action==='workshop-history'&&req.method==='GET'){
        const history=await getLeadWorkshopHistory(leadId);
        if(history?.error)return json(req,res,404,{error:'Lead not found'});
        return json(req,res,200,history);
      }
      if(action==='track'&&req.method==='POST'){
        const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid JSON'});
        const history=await trackLeadWorkshopEvent(leadId,body.workshopId,body.event);
        if(history?.error){const messages={not_found:'Lead not found',invalid_workshop:'Workshop not found',invalid_status:'Invalid workshop event'};return json(req,res,422,{error:messages[history.error]||'Workshop tracking failed'})}
        return json(req,res,200,history);
      }
    }
    const leadIdMatch=url.pathname.match(/^\/api\/leads\/([a-f0-9-]+)$/i);
    if(leadIdMatch){
      const user=await requirePresenter(req,res);if(!user)return;
      const leadId=leadIdMatch[1];
      if(req.method==='PATCH'){
        const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid JSON'});
        const lead=await updateLead(leadId,body);
        if(lead?.error){const messages={not_found:'Lead not found',invalid_email:'Please provide a valid email',invalid_phone:'Please provide a valid phone',invalid_assignee:'Assignee does not exist'};return json(req,res,422,{error:messages[lead.error]||'Lead update failed'})}
        await writeAudit(user.id,'lead.update','lead',lead.id,{status:lead.status,source:lead.source,assignee:lead.assignedTo||null});
        return json(req,res,200,{lead});
      }
      if(req.method==='GET'){const lead=await getLeadById(leadId);if(!lead)return json(req,res,404,{error:'Lead not found'});return json(req,res,200,{lead});}
    }
    if(url.pathname==='/api/templates'){
      const user=await requirePresenter(req,res);if(!user)return;
      if(req.method==='GET'){const templates=await listTemplates(url.searchParams.get('q'),url.searchParams.get('category'));return json(req,res,200,{templates})}
      if(req.method==='POST'){const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid or oversized JSON'});const template=await createTemplate(body);if(!template)return json(req,res,422,{error:'Title, description and at least one activity are required'});await writeAudit(user.id,'template.create','template',template.id,{title:template.title,activityCount:template.activities.length});return json(req,res,201,{template})}
    }
    const templateMatch=url.pathname.match(/^\/api\/templates\/([a-z0-9-]+)(?:\/(use))?$/i);
    if(templateMatch){const user=await requirePresenter(req,res);if(!user)return;const templateId=templateMatch[1],action=templateMatch[2];if(req.method==='GET'&&!action){const template=await getTemplate(templateId);return template?json(req,res,200,{template}):json(req,res,404,{error:'Template not found'})}if(req.method==='POST'&&action==='use'){const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid JSON'});const workshop=await useTemplate(templateId,body);if(!workshop)return json(req,res,404,{error:'Template not found'});await writeAudit(user.id,'template.use','template',templateId,{workshopId:workshop.id});return json(req,res,201,{workshop})}if(req.method==='DELETE'&&!action){const removed=await deleteTemplate(templateId);if(!removed)return json(req,res,404,{error:'Custom template not found'});await writeAudit(user.id,'template.delete','template',templateId,{});return json(req,res,200,{ok:true})}}
    if(url.pathname==='/api/workshops'){
      const user=await requirePresenter(req,res);if(!user)return;
      if(req.method==='GET')return json(req,res,200,{workshops:await listWorkshops()});
      if(req.method==='POST'){
        const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid or oversized JSON'});
        const workshop=await createWorkshop(body);if(!workshop)return json(req,res,422,{error:'Workshop title is required'});
        await writeAudit(user.id,'workshop.create','workshop',workshop.id,{title:workshop.title});return json(req,res,201,{workshop});
      }
    }
    const activityAdminMatch=url.pathname.match(/^\/api\/workshops\/([a-z0-9-]+)\/activities(?:\/(\d+))?$/i);
    if(activityAdminMatch){
      const user=await requirePresenter(req,res);if(!user)return;
      const workshopId=activityAdminMatch[1],activityId=activityAdminMatch[2]?Number(activityAdminMatch[2]):null;
      if(req.method==='POST'&&!activityId||req.method==='PATCH'&&activityId){
        const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid or oversized JSON'});
        const workshop=await saveActivity(workshopId,{...body,...(activityId?{id:activityId}:{})});if(!workshop)return json(req,res,422,{error:'Title and question are required'});
        await writeAudit(user.id,activityId?'activity.update':'activity.create','workshop',workshopId,{activityId});await broadcast(workshop.joinCode,'workshop_updated');return json(req,res,200,{workshop});
      }
      if(req.method==='DELETE'&&activityId){const removed=await deleteActivity(workshopId,activityId);if(!removed)return json(req,res,404,{error:'Activity not found'});const workshop=await getWorkshop(workshopId);await writeAudit(user.id,'activity.delete','workshop',workshopId,{activityId});if(workshop)await broadcast(workshop.joinCode,'workshop_updated');return json(req,res,200,{ok:true,workshop})}
    }
    const workshopAdminMatch=url.pathname.match(/^\/api\/workshops\/([a-z0-9-]+)$/i);
    if(workshopAdminMatch){
      const user=await requirePresenter(req,res);if(!user)return;const workshopId=workshopAdminMatch[1];
      if(req.method==='GET'){const workshop=await getWorkshop(workshopId);return workshop?json(req,res,200,{workshop}):json(req,res,404,{error:'Workshop not found'})}
      if(req.method==='PATCH'){const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid JSON'});const workshop=await updateWorkshop(workshopId,body);if(!workshop)return json(req,res,422,{error:'Valid workshop title is required'});await writeAudit(user.id,'workshop.update','workshop',workshopId,body);await broadcast(workshop.joinCode,'workshop_updated');return json(req,res,200,{workshop})}
      if(req.method==='DELETE'){const removed=await deleteWorkshop(workshopId);if(!removed)return json(req,res,404,{error:'Workshop not found'});await writeAudit(user.id,'workshop.delete','workshop',workshopId,{});return json(req,res,200,{ok:true})}
    }
    const moderationMatch=url.pathname.match(/^\/api\/responses\/([a-f0-9-]+)\/moderate$/i);
    if(moderationMatch&&req.method==='POST'){
      const user=await requirePresenter(req,res);if(!user)return;
      const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid JSON'});
      const result=await moderateResponse(moderationMatch[1],body.status,user.id);if(!result)return json(req,res,404,{error:'Response not found'});
      const code=await getJoinCodeForSession(result.session_id);if(code)await broadcast(code,'response_moderated');
      return json(req,res,200,{ok:true,state:code?await getSession(code):null});
    }
    const match=url.pathname.match(/^\/api\/sessions\/([A-Za-z0-9]+)(?:\/(join|control|responses))?$/);
    if(match){
      const code=match[1].toUpperCase(),action=match[2];
      if(req.method==='GET'&&!action){const state=await getSession(code);return state?json(req,res,200,state):json(req,res,404,{error:'Session not found'})}
      const body=await readBody(req);if(!body)return json(req,res,400,{error:'Invalid or oversized JSON'});
      if(req.method==='POST'&&action==='join'){
        if(!await allowDistributedRequest(`join:${clientIp(req)}`,12,60*1000))return json(req,res,429,{error:'Too many join attempts. Please wait a minute.'});
        if(!String(body.name||'').trim())return json(req,res,422,{error:'Name is required'});
        const participant=await joinSession(code,body.name);if(!participant)return json(req,res,404,{error:'Session not found'});
        await broadcast(code,'participant_joined');return json(req,res,201,{participant,state:await getSession(code)});
      }
      if(req.method==='POST'&&action==='control'){
        const user=await requirePresenter(req,res);if(!user)return;
        const state=await controlSession(code,body);if(!state)return json(req,res,404,{error:'Session not found'});
        await writeAudit(user.id,'session.control','session',state.id,body);await broadcast(code,'session_controlled');return json(req,res,200,state);
      }
      if(req.method==='POST'&&action==='responses'){
        if(!await allowDistributedRequest(`response:${clientIp(req)}:${String(body.participantId||'')}`,30,60*1000))return json(req,res,429,{error:'Too many responses. Please wait a moment.'});
        const response=await addResponse(code,body);if(!response)return json(req,res,422,{error:'Invalid participant or answer'});
        await broadcast(code,'response_added');return json(req,res,201,{response,state:await getSession(code)});
      }
    }
    if(serveFrontend){
      const distRoot=resolve('dist');let filePath=resolve(distRoot,url.pathname==='/'?'index.html':url.pathname.slice(1));
      if(!filePath.startsWith(`${distRoot}${sep}`)&&filePath!==distRoot)return json(req,res,403,{error:'Forbidden'});
      try{if(!(await stat(filePath)).isFile())throw new Error()}catch{filePath=resolve(distRoot,'index.html')}
      try{const data=await readFile(filePath);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};res.writeHead(200,{'content-type':types[extname(filePath)]||'application/octet-stream',...securityHeaders,'content-security-policy':"default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",...(production&&extname(filePath)!=='.html'?{'cache-control':'public,max-age=31536000,immutable'}:{'cache-control':'no-cache'})});return res.end(data)}catch{return json(req,res,404,{error:'Not found'})}
    }
    return json(req,res,404,{error:'Not found'});
  }catch(error){console.error('Request failed:',error);if(!res.headersSent)json(req,res,500,{error:'Internal server error'});else res.end()}
});

const wss=new WebSocketServer({server,path:'/ws'});
wss.on('connection',async(socket,request)=>{try{const origin=request.headers.origin;if(production&&origin&&!allowedOrigins.has(origin)){socket.close(1008,'Origin not allowed');return}const url=new URL(request.url,`http://${request.headers.host}`),code=String(url.searchParams.get('code')||'').toUpperCase(),state=await getSession(code);if(!state){socket.close(1008,'Unknown session');return}clients.set(socket,{code});socket.send(JSON.stringify({event:'connected',state}));socket.on('close',()=>clients.delete(socket))}catch{socket.close(1011,'Connection failed')}});

setInterval(async()=>{try{if(!await acquireTickLease())return;await tickLiveSessions();const codes=new Set([...clients.values()].map(meta=>meta.code));for(const code of codes)await broadcast(code,'tick')}catch(error){console.error('Timer tick failed:',error.message)}},1000).unref();
let shuttingDown=false;
const shutdown=async signal=>{
  if(shuttingDown)return;shuttingDown=true;
  console.log(`CFL Live shutting down (${signal})`);
  for(const socket of clients.keys())socket.close(1001,'Server restarting');
  const httpClosed=new Promise(resolve=>server.close(resolve));
  wss.close();
  await Promise.race([Promise.allSettled([httpClosed,closeRealtime(),closeStorage()]),new Promise(resolve=>setTimeout(resolve,10_000))]);
  process.exit(0);
};
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
server.listen(port,'0.0.0.0',()=>console.log(`CFL Live ready on port ${port} (${storageDriver})`));
