import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(root, 'data');
mkdirSync(dataDir, { recursive: true });
const production=process.env.NODE_ENV==='production';
if(production&&process.env.ALLOW_SQLITE_PRODUCTION!=='true')throw new Error('SQLite is disabled in production. Set DATABASE_URL for PostgreSQL.');

export const db = new DatabaseSync(resolve(dataDir, 'cfl-live.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS workshops (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    join_code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY,
    workshop_id TEXT NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    question TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS live_sessions (
    id TEXT PRIMARY KEY,
    workshop_id TEXT NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ready',
    current_activity_id INTEGER NOT NULL DEFAULT 3,
    show_results INTEGER NOT NULL DEFAULT 1,
    seconds_remaining INTEGER NOT NULL DEFAULT 180,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS responses (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    answer TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','presenter')),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'starter',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS organization_memberships (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('owner','admin','presenter')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(organization_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS audience_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT 'green',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS audience_people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('active','inactive','invited')),
    workshop_count INTEGER NOT NULL DEFAULT 0,
    response_count INTEGER NOT NULL DEFAULT 0,
    engagement INTEGER NOT NULL DEFAULT 0,
    last_active_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS audience_memberships (
    person_id TEXT NOT NULL REFERENCES audience_people(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES audience_groups(id) ON DELETE CASCADE,
    PRIMARY KEY(person_id,group_id)
  );
  CREATE TABLE IF NOT EXISTS workshop_templates (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    estimated_minutes INTEGER NOT NULL DEFAULT 10,
    usage_count INTEGER NOT NULL DEFAULT 0,
    is_custom INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS template_activities (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES workshop_templates(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    question TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_responses_session_activity ON responses(session_id, activity_id);
  CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id);
  CREATE INDEX IF NOT EXISTS idx_audience_people_status ON audience_people(status,last_active_at);
  CREATE INDEX IF NOT EXISTS idx_audience_memberships_group ON audience_memberships(group_id);
  CREATE INDEX IF NOT EXISTS idx_templates_category ON workshop_templates(category,is_custom);
  CREATE INDEX IF NOT EXISTS idx_template_activities_template ON template_activities(template_id,position);
  CREATE INDEX IF NOT EXISTS idx_organization_memberships_user ON organization_memberships(user_id,status);
`);

const responseColumns = new Set(db.prepare('PRAGMA table_info(responses)').all().map(column=>column.name));
if (!responseColumns.has('status')) db.exec("ALTER TABLE responses ADD COLUMN status TEXT NOT NULL DEFAULT 'visible'");
if (!responseColumns.has('moderated_by')) db.exec('ALTER TABLE responses ADD COLUMN moderated_by TEXT');
if (!responseColumns.has('moderated_at')) db.exec('ALTER TABLE responses ADD COLUMN moderated_at TEXT');
const activityColumns=new Set(db.prepare('PRAGMA table_info(activities)').all().map(column=>column.name));
if(!activityColumns.has('options'))db.exec("ALTER TABLE activities ADD COLUMN options TEXT NOT NULL DEFAULT '[]'");
if(!activityColumns.has('settings'))db.exec("ALTER TABLE activities ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'");
const templateActivityColumns=new Set(db.prepare('PRAGMA table_info(template_activities)').all().map(column=>column.name));
if(!templateActivityColumns.has('options'))db.exec("ALTER TABLE template_activities ADD COLUMN options TEXT NOT NULL DEFAULT '[]'");
if(!templateActivityColumns.has('settings'))db.exec("ALTER TABLE template_activities ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'");
const organizationColumns=new Set(db.prepare('PRAGMA table_info(organizations)').all().map(column=>column.name));
if(!organizationColumns.has('website'))db.exec("ALTER TABLE organizations ADD COLUMN website TEXT NOT NULL DEFAULT ''");
if(!organizationColumns.has('sender_name'))db.exec("ALTER TABLE organizations ADD COLUMN sender_name TEXT NOT NULL DEFAULT ''");
if(!organizationColumns.has('sender_email'))db.exec("ALTER TABLE organizations ADD COLUMN sender_email TEXT NOT NULL DEFAULT ''");
db.prepare("UPDATE activities SET options=?,settings=? WHERE lower(title)='daily habits' AND options='[]'").run(JSON.stringify(['Sleep 7–8 hours','Daily movement','Balanced nutrition','Mindfulness']),JSON.stringify({allowMultiple:true,showResults:true,anonymous:false}));

const parseJson=(value,fallback)=>{try{return JSON.parse(value)}catch{return fallback}};
const hydrateActivity=row=>row?({...row,options:Array.isArray(row.options)?row.options:parseJson(row.options,[]),settings:row.settings&&typeof row.settings==='object'?row.settings:parseJson(row.settings,{})}):row;
const cleanMediaUrl=value=>{const url=String(value||'').trim().slice(0,500);return /^(https:\/\/|\/(?!\/))/.test(url)?url:''};
const activityPayload=input=>({options:(Array.isArray(input.options)?input.options:[]).map(value=>String(value).trim().slice(0,120)).filter(Boolean).slice(0,12),settings:{allowMultiple:input.settings?.allowMultiple===undefined?String(input.type)==='Multiple Answers':Boolean(input.settings.allowMultiple),showResults:input.settings?.showResults!==false,anonymous:Boolean(input.settings?.anonymous),correctOption:Number.isInteger(Number(input.settings?.correctOption))?Math.max(0,Math.min(11,Number(input.settings.correctOption))):null,min:Math.max(0,Number(input.settings?.min)||0),max:Math.max(1,Math.min(100,Number(input.settings?.max)||10)),leftLabel:String(input.settings?.leftLabel||'Not at all').trim().slice(0,40),rightLabel:String(input.settings?.rightLabel||'Absolutely').trim().slice(0,40),imageUrl:cleanMediaUrl(input.settings?.imageUrl),optionImages:(Array.isArray(input.settings?.optionImages)?input.settings.optionImages:[]).map(cleanMediaUrl).slice(0,12),followUps:(Array.isArray(input.settings?.followUps)?input.settings.followUps:[]).map(value=>String(value||'').trim().slice(0,180)).slice(0,12)}});

const hashPassword = (password, salt=randomBytes(16).toString('hex')) => `${salt}:${scryptSync(password,salt,64).toString('hex')}`;
const verifyPassword = (password, stored) => {
  const [salt,hex]=stored.split(':');
  if(!salt||!hex) return false;
  const expected=Buffer.from(hex,'hex'), actual=scryptSync(password,salt,64);
  return expected.length===actual.length && timingSafeEqual(expected,actual);
};
const tokenHash = token => createHash('sha256').update(token).digest('hex');

const activitySeed = [
  [1, 1, 'Icebreaker', 'Q&A', 'What would make today valuable for you?'],
  [2, 2, 'Energy Check', 'Poll', 'How is your energy right now?'],
  [3, 3, 'Healthy living', 'Word Cloud', 'What does healthy living mean to you?'],
  [4, 4, 'Top Priorities', 'Ranking', 'What should we focus on first?'],
  [5, 5, 'Knowledge Check', 'Quiz', 'Which habit creates the biggest impact?'],
];

if(!production||process.env.BOOTSTRAP_WORKSHOP==='true'){
  db.prepare('INSERT OR IGNORE INTO workshops (id,title,join_code) VALUES (?,?,?)').run('healthy-forever','Healthy Forever','27RJ27');
  for(const activity of activitySeed)db.prepare('INSERT OR IGNORE INTO activities (id,workshop_id,position,title,type,question) VALUES (?,\'healthy-forever\',?,?,?,?)').run(...activity);
  db.prepare('INSERT OR IGNORE INTO live_sessions (id,workshop_id) VALUES (?,?)').run('session-healthy-forever','healthy-forever');
  const groups=[['wellness-cohort','Wellness Cohort','green'],['leadership-circle','Leadership Circle','violet'],['morning-momentum','Morning Momentum','blue'],['guests','Guests','teal']];
  for(const group of groups)db.prepare('INSERT OR IGNORE INTO audience_groups(id,name,color) VALUES(?,?,?)').run(...group);
  const people=[
    ['person-jessica','Jessica Smith','jessica.smith@example.com','active',8,42,82,'wellness-cohort'],
    ['person-michael','Michael Thompson','michael.t@example.com','active',6,28,75,'leadership-circle'],
    ['person-amanda','Amanda Lee','amanda.lee@example.com','active',5,18,68,'morning-momentum'],
    ['person-robert','Robert Brown','robert.b@example.com','active',4,12,56,'wellness-cohort'],
    ['person-sophia','Sophia Chen','sophia.chen@example.com','inactive',2,4,32,'guests'],
    ['person-david','David Wilson','david.w@example.com','active',7,26,78,'leadership-circle'],
  ];
  for(const [id,name,email,status,workshops,responses,engagement,groupId] of people){
    db.prepare("INSERT OR IGNORE INTO audience_people(id,name,email,status,workshop_count,response_count,engagement,last_active_at) VALUES(?,?,?,?,?,?,?,datetime('now','-'||?||' days'))").run(id,name,email,status,workshops,responses,engagement,status==='active'?Math.max(0,Math.round((82-engagement)/8)):14);
    db.prepare('INSERT OR IGNORE INTO audience_memberships(person_id,group_id) VALUES(?,?)').run(id,groupId);
  }
  const templateSeeds=[
    ['template-wellness','Wellness check-in','A thoughtful check-in to understand energy, habits, and priorities.','Wellness',12,2400,[['Healthy living','Word Cloud','What does healthy living mean to you?'],['Energy check','Live Poll','How is your energy right now?'],['Daily habits','Multiple Answers','Which habits support you most?'],['Top priorities','Ranking','What should you focus on first?'],['Commitment','Q&A','What will you commit to this week?']]],
    ['template-team','Team pulse','Quick pulse to gauge team morale, alignment, and challenges.','Team building',8,1800,[['One-word check-in','Word Cloud','How are you arriving today?'],['Energy check','Live Poll','How is your energy right now?'],['Team priority','Ranking','What should we focus on first?'],['Open floor','Q&A','What does the team need to hear?']]],
    ['template-learning','Learning review','Check understanding and reinforce key takeaways from a session.','Learning',15,1600,[['Opening reflection','Q&A','What stood out most?'],['Confidence check','Live Poll','How confident do you feel?'],['Key ideas','Word Cloud','Which idea will you remember?'],['Priorities','Ranking','What should we apply first?'],['Knowledge check','Quiz','Which answer is correct?'],['Next step','Q&A','What will you do next?']]],
    ['template-event','Event energizer','Fun and engaging activities to energize your event attendees.','Events',10,1200,[['Arrival mood','Word Cloud','What energy are you bringing?'],['Quick choice','Live Poll','Which session are you excited about?'],['Audience challenge','Quiz','Ready for a quick challenge?'],['Next connection','Q&A','Who would you like to meet?'],['Event priority','Ranking','What should happen next?']]],
    ['template-leadership','Leadership reflection','Guided reflection to support leadership growth and self-awareness.','Team building',14,980,[['Leadership quality','Word Cloud','Which quality matters most?'],['Current confidence','Live Poll','How confident are you today?'],['Growth priorities','Ranking','Where will you grow first?'],['Reflection','Q&A','What did leadership teach you?'],['Commitment','Q&A','What will you practice next?']]],
    ['template-habits','Healthy habits','Explore habits and build personal action plans for well-being.','Wellness',11,860,[['Habit check','Multiple Answers','Which healthy habits do you practice?'],['Consistency','Live Poll','How consistent are you?'],['Habit impact','Ranking','Which habit has the biggest impact?'],['Barrier','Word Cloud','What gets in the way?'],['Next action','Q&A','What habit will you start?']]],
    ['template-community','Community connection','Build trust and meaningful connections across a group.','Events',9,740,[['Common ground','Word Cloud','What brings us together?'],['Connection pulse','Live Poll','How connected do you feel?'],['Shared interests','Multiple Answers','What would you explore together?'],['Community voice','Q&A','What would strengthen this community?']]],
    ['template-goals','Goal setting','Turn priorities into clear, accountable next steps.','Learning',13,690,[['Future focus','Word Cloud','What matters most next?'],['Priority order','Ranking','Which goal comes first?'],['Confidence','Live Poll','How confident are you?'],['Support needed','Q&A','What support will help?'],['Commitment','Q&A','What is your first action?']]],
  ];
  for(const [id,title,description,category,minutes,usage,items] of templateSeeds){db.prepare('INSERT OR IGNORE INTO workshop_templates(id,title,description,category,estimated_minutes,usage_count) VALUES(?,?,?,?,?,?)').run(id,title,description,category,minutes,usage);for(const [index,item] of items.entries())db.prepare('INSERT OR IGNORE INTO template_activities(id,template_id,position,title,type,question) VALUES(?,?,?,?,?,?)').run(`${id}-${index+1}`,id,index+1,...item)}
}
const adminEmail=process.env.ADMIN_EMAIL||(!production?'admin@cfl.live':'');
const adminPassword=process.env.ADMIN_PASSWORD||(!production?'CFLive@2026':'');
if(adminEmail&&adminPassword)db.prepare('INSERT OR IGNORE INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run('user-admin',adminEmail.toLowerCase(),'Yogesh Patel','admin',hashPassword(adminPassword));
const defaultOrganizationId='org-cfl';
const defaultOrganizationName=String(process.env.ORGANIZATION_NAME||'Coach For Life').trim().slice(0,80)||'Coach For Life';
const defaultOrganizationSlug=String(process.env.ORGANIZATION_SLUG||'coach-for-life').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'coach-for-life';
db.prepare('INSERT OR IGNORE INTO organizations(id,name,slug) VALUES(?,?,?)').run(defaultOrganizationId,defaultOrganizationName,defaultOrganizationSlug);
db.prepare("INSERT OR IGNORE INTO organization_memberships(organization_id,user_id,role,status) SELECT ?,id,CASE WHEN id='user-admin' THEN 'owner' WHEN role='admin' THEN 'admin' ELSE 'presenter' END,'active' FROM users").run(defaultOrganizationId);

export function getSession(joinCode = '27RJ27') {
  const row = db.prepare(`
    SELECT s.*, w.title, w.join_code
    FROM live_sessions s JOIN workshops w ON w.id=s.workshop_id
    WHERE w.join_code=?
  `).get(joinCode.toUpperCase());
  if (!row) return null;
  const activities = db.prepare('SELECT id,position,title,type,question,options,settings FROM activities WHERE workshop_id=? ORDER BY position').all(row.workshop_id).map(hydrateActivity);
  const participantCount = db.prepare('SELECT COUNT(*) count FROM participants WHERE session_id=?').get(row.id).count;
  const answerCount = db.prepare("SELECT COUNT(*) count FROM responses WHERE session_id=? AND activity_id=? AND status='visible'").get(row.id,row.current_activity_id).count;
  const responses = db.prepare(`SELECT r.id,r.answer,r.status,r.created_at FROM responses r WHERE r.session_id=? AND r.activity_id=? AND r.status='visible' ORDER BY r.created_at DESC LIMIT 200`).all(row.id,row.current_activity_id);
  return {
    id: row.id, title: row.title, joinCode: row.join_code, status: row.status,
    currentActivityId: row.current_activity_id, showResults: Boolean(row.show_results),
    secondsRemaining: row.seconds_remaining, participantCount, answerCount, activities, responses,
  };
}

const makeJoinCode = () => {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let attempt=0;attempt<20;attempt++){
    let code='';
    for(let index=0;index<6;index++)code+=alphabet[Math.floor(Math.random()*alphabet.length)];
    if(!db.prepare('SELECT 1 FROM workshops WHERE join_code=?').get(code))return code;
  }
  return randomBytes(4).toString('hex').slice(0,6).toUpperCase();
};

export function listWorkshops(){
  return db.prepare(`
    SELECT w.id,w.title,w.join_code joinCode,w.created_at createdAt,s.status,s.updated_at updatedAt,
      COUNT(DISTINCT a.id) activityCount,COUNT(DISTINCT p.id) participantCount,COUNT(DISTINCT r.id) responseCount
    FROM workshops w
    JOIN live_sessions s ON s.workshop_id=w.id
    LEFT JOIN activities a ON a.workshop_id=w.id
    LEFT JOIN participants p ON p.session_id=s.id
    LEFT JOIN responses r ON r.session_id=s.id
    GROUP BY w.id,s.id ORDER BY s.updated_at DESC
  `).all();
}

export function getWorkshop(id){
  const workshop=db.prepare(`SELECT w.id,w.title,w.join_code joinCode,w.created_at createdAt,s.id sessionId,s.status,s.current_activity_id currentActivityId,s.updated_at updatedAt FROM workshops w JOIN live_sessions s ON s.workshop_id=w.id WHERE w.id=?`).get(id);
  if(!workshop)return null;
  workshop.activities=db.prepare('SELECT id,position,title,type,question,options,settings FROM activities WHERE workshop_id=? ORDER BY position').all(id).map(hydrateActivity);
  return workshop;
}

export function createWorkshop(input={}){
  const title=String(input.title||'').trim().slice(0,80);
  if(!title)return null;
  const id=randomUUID(),sessionId=randomUUID(),joinCode=makeJoinCode();
  const items=Array.isArray(input.activities)?input.activities.slice(0,30):[];
  db.exec('BEGIN');
  try{
    db.prepare('INSERT INTO workshops(id,title,join_code) VALUES(?,?,?)').run(id,title,joinCode);
    let firstActivityId=null;
    for(const [index,item] of items.entries()){
      const activityId=Number(db.prepare('SELECT COALESCE(MAX(id),0)+1 id FROM activities').get().id);
      if(firstActivityId===null)firstActivityId=activityId;
      const payload=activityPayload(item);db.prepare('INSERT INTO activities(id,workshop_id,position,title,type,question,options,settings) VALUES(?,?,?,?,?,?,?,?)').run(activityId,id,index+1,String(item.title||`Activity ${index+1}`).trim().slice(0,80),String(item.type||'Poll').slice(0,40),String(item.question||'Share your response').trim().slice(0,280),JSON.stringify(payload.options),JSON.stringify(payload.settings));
    }
    db.prepare('INSERT INTO live_sessions(id,workshop_id,current_activity_id) VALUES(?,?,?)').run(sessionId,id,firstActivityId||0);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error}
  return getWorkshop(id);
}

export function updateWorkshop(id,input={}){
  const existing=getWorkshop(id);if(!existing)return null;
  const title=String(input.title??existing.title).trim().slice(0,80);if(!title)return null;
  db.prepare('UPDATE workshops SET title=? WHERE id=?').run(title,id);
  return getWorkshop(id);
}

export function deleteWorkshop(id){
  const result=db.prepare('DELETE FROM workshops WHERE id=?').run(id);
  return result.changes>0;
}

export function saveActivity(workshopId,input={}){
  const workshop=getWorkshop(workshopId);if(!workshop)return null;
  const title=String(input.title||'').trim().slice(0,80),type=String(input.type||'Poll').trim().slice(0,40),question=String(input.question||'').trim().slice(0,280);
  if(!title||!question)return null;
  const payload=activityPayload(input);let id=Number(input.id);
  if(Number.isInteger(id)&&db.prepare('SELECT 1 FROM activities WHERE id=? AND workshop_id=?').get(id,workshopId)){
    db.prepare('UPDATE activities SET title=?,type=?,question=?,options=?,settings=? WHERE id=? AND workshop_id=?').run(title,type,question,JSON.stringify(payload.options),JSON.stringify(payload.settings),id,workshopId);
  }else{
    id=Number(db.prepare('SELECT COALESCE(MAX(id),0)+1 id FROM activities').get().id);
    const position=Number(db.prepare('SELECT COALESCE(MAX(position),0)+1 position FROM activities WHERE workshop_id=?').get(workshopId).position);
    db.prepare('INSERT INTO activities(id,workshop_id,position,title,type,question,options,settings) VALUES(?,?,?,?,?,?,?,?)').run(id,workshopId,position,title,type,question,JSON.stringify(payload.options),JSON.stringify(payload.settings));
    if(workshop.currentActivityId===0)db.prepare('UPDATE live_sessions SET current_activity_id=? WHERE workshop_id=?').run(id,workshopId);
  }
  return getWorkshop(workshopId);
}

export function deleteActivity(workshopId,activityId){
  db.exec('BEGIN');
  try{
    const existing=db.prepare('SELECT position FROM activities WHERE id=? AND workshop_id=?').get(activityId,workshopId);if(!existing){db.exec('ROLLBACK');return false}
    db.prepare('DELETE FROM activities WHERE id=? AND workshop_id=?').run(activityId,workshopId);
    db.prepare('UPDATE activities SET position=position-1 WHERE workshop_id=? AND position>?').run(workshopId,existing.position);
    const next=db.prepare('SELECT id FROM activities WHERE workshop_id=? ORDER BY position LIMIT 1').get(workshopId);
    db.prepare('UPDATE live_sessions SET current_activity_id=? WHERE workshop_id=? AND current_activity_id=?').run(next?.id||0,workshopId,activityId);
    db.exec('COMMIT');return true;
  }catch(error){db.exec('ROLLBACK');throw error}
}

export function getReports(workshopId=null,days=30){
  const filter=workshopId&&workshopId!=='all'?workshopId:null,windowDays=Math.max(1,Math.min(365,Number(days)||30));
  const params=[filter,filter,windowDays];
  const workshops=listWorkshops();
  const summary=db.prepare(`SELECT COUNT(DISTINCT p.id) participants,COUNT(DISTINCT r.id) responses,COUNT(DISTINCT a.id) activities,COUNT(DISTINCT w.id) workshops FROM workshops w JOIN live_sessions s ON s.workshop_id=w.id LEFT JOIN activities a ON a.workshop_id=w.id LEFT JOIN participants p ON p.session_id=s.id AND p.joined_at>=datetime('now','-'||?3||' days') LEFT JOIN responses r ON r.session_id=s.id AND r.created_at>=datetime('now','-'||?3||' days') WHERE (?1 IS NULL OR w.id=?2)`).get(...params);
  const participantTrend=db.prepare(`SELECT date(p.joined_at) day,COUNT(*) count FROM participants p JOIN live_sessions s ON s.id=p.session_id JOIN workshops w ON w.id=s.workshop_id WHERE (?1 IS NULL OR w.id=?2) AND p.joined_at>=datetime('now','-'||?3||' days') GROUP BY date(p.joined_at) ORDER BY day`).all(...params);
  const responseTrend=db.prepare(`SELECT date(r.created_at) day,COUNT(*) count FROM responses r JOIN live_sessions s ON s.id=r.session_id JOIN workshops w ON w.id=s.workshop_id WHERE (?1 IS NULL OR w.id=?2) AND r.created_at>=datetime('now','-'||?3||' days') GROUP BY date(r.created_at) ORDER BY day`).all(...params);
  const activityMix=db.prepare(`SELECT a.type,COUNT(DISTINCT a.id) count FROM activities a JOIN workshops w ON w.id=a.workshop_id WHERE (?1 IS NULL OR w.id=?2) GROUP BY a.type ORDER BY count DESC`).all(filter,filter);
  const performance=db.prepare(`SELECT a.id,a.title,a.type,COUNT(DISTINCT r.id) responses,COUNT(DISTINCT p.id) participants,COALESCE(AVG((julianday(r.created_at)-julianday(p.joined_at))*86400),0) avgSeconds FROM activities a JOIN workshops w ON w.id=a.workshop_id JOIN live_sessions s ON s.workshop_id=w.id LEFT JOIN participants p ON p.session_id=s.id AND p.joined_at>=datetime('now','-'||?3||' days') LEFT JOIN responses r ON r.activity_id=a.id AND r.participant_id=p.id AND r.created_at>=datetime('now','-'||?3||' days') WHERE (?1 IS NULL OR w.id=?2) GROUP BY a.id ORDER BY responses DESC,a.position LIMIT 20`).all(...params).map(row=>{const rate=row.participants?Math.round(row.responses/row.participants*100):0;return{...row,responseRate:Math.min(100,rate),avgSeconds:Math.max(0,Math.round(row.avgSeconds)),status:rate>=70?'Strong':rate>=50?'Review':'Needs attention'}});
  const topResponses=db.prepare(`SELECT lower(trim(r.answer)) answer,COUNT(*) count FROM responses r JOIN live_sessions s ON s.id=r.session_id JOIN workshops w ON w.id=s.workshop_id WHERE (?1 IS NULL OR w.id=?2) AND r.status='visible' AND r.created_at>=datetime('now','-'||?3||' days') GROUP BY lower(trim(r.answer)) ORDER BY count DESC,answer LIMIT 5`).all(...params);
  const selected=filter?db.prepare(`SELECT w.id,w.title,w.join_code joinCode,s.status,s.updated_at lastSession,COUNT(DISTINCT p.id) participants,COUNT(DISTINCT r.id) responses FROM workshops w JOIN live_sessions s ON s.workshop_id=w.id LEFT JOIN participants p ON p.session_id=s.id LEFT JOIN responses r ON r.session_id=s.id WHERE w.id=? GROUP BY w.id,s.id`).get(filter):null;
  const avgActivities=summary.workshops?Number((summary.activities/summary.workshops).toFixed(1)):0;
  const capacity=Math.max(1,summary.participants*Math.max(1,avgActivities));
  return{workshops,filters:{workshopId:filter||'all',days:windowDays},summary:{participants:summary.participants,responses:summary.responses,responseRate:summary.participants?Math.min(100,Math.round(summary.responses/capacity*100)):0,avgActivities},trend:{participants:participantTrend,responses:responseTrend},activityMix,performance,topResponses,selectedWorkshop:selected};
}

export function getReportExportRows(workshopId=null,days=30){
  const filter=workshopId&&workshopId!=='all'?workshopId:null,windowDays=Math.max(1,Math.min(365,Number(days)||30));
  return db.prepare(`SELECT w.title workshop,w.join_code joinCode,p.name participant,a.title activity,a.type,r.answer,r.status,r.created_at createdAt FROM responses r JOIN participants p ON p.id=r.participant_id JOIN activities a ON a.id=r.activity_id JOIN live_sessions s ON s.id=r.session_id JOIN workshops w ON w.id=s.workshop_id WHERE (?1 IS NULL OR w.id=?2) AND r.created_at>=datetime('now','-'||?3||' days') ORDER BY r.created_at DESC`).all(filter,filter,windowDays);
}

export function getAudience(query='',status='all',groupId='all'){
  const search=`%${String(query||'').trim().slice(0,80).toLowerCase()}%`,state=['active','inactive','invited'].includes(status)?status:null,group=groupId&&groupId!=='all'?groupId:null;
  const people=db.prepare(`SELECT p.id,p.name,p.email,p.status,p.workshop_count workshopCount,p.response_count responseCount,p.engagement,p.last_active_at lastActiveAt,g.id groupId,g.name groupName,g.color groupColor FROM audience_people p LEFT JOIN audience_memberships m ON m.person_id=p.id LEFT JOIN audience_groups g ON g.id=m.group_id WHERE (lower(p.name) LIKE ?1 OR lower(p.email) LIKE ?1) AND (?2 IS NULL OR p.status=?2) AND (?3 IS NULL OR g.id=?3) ORDER BY COALESCE(p.last_active_at,p.created_at) DESC,p.name`).all(search,state,group);
  const groups=db.prepare(`SELECT g.id,g.name,g.color,COUNT(DISTINCT m.person_id) peopleCount,COALESCE(SUM(p.workshop_count),0) workshopCount FROM audience_groups g LEFT JOIN audience_memberships m ON m.group_id=g.id LEFT JOIN audience_people p ON p.id=m.person_id GROUP BY g.id ORDER BY g.created_at,g.name`).all();
  const summary=db.prepare(`SELECT COUNT(*) totalPeople,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) activePeople,COALESCE(ROUND(AVG(engagement)),0) averageEngagement FROM audience_people`).get();
  return{people,groups,summary:{...summary,groups:groups.length}};
}

export function createAudienceGroup(input={}){
  const name=String(input.name||'').trim().slice(0,60);if(!name)return null;
  const id=randomUUID(),color=['green','violet','blue','teal','orange'].includes(input.color)?input.color:'green';
  try{db.prepare('INSERT INTO audience_groups(id,name,color) VALUES(?,?,?)').run(id,name,color)}catch(error){if(String(error.message).includes('UNIQUE'))return null;throw error}
  return db.prepare('SELECT id,name,color,0 peopleCount,0 workshopCount FROM audience_groups WHERE id=?').get(id);
}

export function addAudiencePeople(input={}){
  const emails=(Array.isArray(input.emails)?input.emails:String(input.emails||'').split(/[\n,;]/)).map(value=>String(value).trim().toLowerCase()).filter(value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)).slice(0,250);
  const groupId=input.groupId&&db.prepare('SELECT 1 FROM audience_groups WHERE id=?').get(input.groupId)?input.groupId:null,created=[];
  db.exec('BEGIN');try{for(const email of [...new Set(emails)]){let person=db.prepare('SELECT id,name,email,status FROM audience_people WHERE email=?').get(email);if(!person){const id=randomUUID(),name=String(input.names?.[email]||email.split('@')[0].replace(/[._-]+/g,' ')).replace(/\b\w/g,char=>char.toUpperCase()).slice(0,60);db.prepare('INSERT INTO audience_people(id,name,email,status,last_active_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)').run(id,name,email,'invited');person={id,name,email,status:'invited'}}if(groupId){db.prepare('DELETE FROM audience_memberships WHERE person_id=?').run(person.id);db.prepare('INSERT INTO audience_memberships(person_id,group_id) VALUES(?,?)').run(person.id,groupId)}created.push(person)}db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
  return created;
}

export function listTemplates(query='',category='all'){
  const search=`%${String(query||'').trim().slice(0,80).toLowerCase()}%`,filter=category&&category!=='all'?String(category):null;
  return db.prepare(`SELECT t.id,t.title,t.description,t.category,t.estimated_minutes estimatedMinutes,t.usage_count usageCount,t.is_custom isCustom,COUNT(a.id) activityCount FROM workshop_templates t LEFT JOIN template_activities a ON a.template_id=t.id WHERE (lower(t.title) LIKE ?1 OR lower(t.description) LIKE ?1) AND (?2 IS NULL OR (?2='My templates' AND t.is_custom=1) OR t.category=?2) GROUP BY t.id ORDER BY t.usage_count DESC,t.created_at DESC`).all(search,filter).map(row=>({...row,isCustom:Boolean(row.isCustom)}));
}

export function getTemplate(id){
  const template=db.prepare(`SELECT id,title,description,category,estimated_minutes estimatedMinutes,usage_count usageCount,is_custom isCustom,created_at createdAt FROM workshop_templates WHERE id=?`).get(id);if(!template)return null;
  template.isCustom=Boolean(template.isCustom);template.activities=db.prepare('SELECT id,position,title,type,question,options,settings FROM template_activities WHERE template_id=? ORDER BY position').all(id).map(hydrateActivity);return template;
}

export function createTemplate(input={}){
  const title=String(input.title||'').trim().slice(0,80),description=String(input.description||'').trim().slice(0,220),category=['Wellness','Team building','Learning','Events'].includes(input.category)?input.category:'My templates',items=Array.isArray(input.activities)?input.activities.slice(0,30):[];if(!title||!description||!items.length)return null;
  const id=randomUUID(),minutes=Math.max(1,Math.min(180,Number(input.estimatedMinutes)||items.length*2));db.exec('BEGIN');try{db.prepare('INSERT INTO workshop_templates(id,title,description,category,estimated_minutes,is_custom) VALUES(?,?,?,?,?,1)').run(id,title,description,category,minutes);for(const [index,item] of items.entries()){const activityTitle=String(item.title||`Activity ${index+1}`).trim().slice(0,80),type=String(item.type||'Q&A').trim().slice(0,40),question=String(item.question||'Share your response').trim().slice(0,280),payload=activityPayload(item);db.prepare('INSERT INTO template_activities(id,template_id,position,title,type,question,options,settings) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),id,index+1,activityTitle,type,question,JSON.stringify(payload.options),JSON.stringify(payload.settings))}db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}return getTemplate(id);
}

export function useTemplate(id,input={}){const template=getTemplate(id);if(!template)return null;const workshop=createWorkshop({title:String(input.title||template.title).trim().slice(0,80),activities:template.activities});db.prepare('UPDATE workshop_templates SET usage_count=usage_count+1 WHERE id=?').run(id);return workshop;}
export function deleteTemplate(id){return db.prepare('DELETE FROM workshop_templates WHERE id=? AND is_custom=1').run(id).changes>0;}

export function joinSession(joinCode, name) {
  const session = getSession(joinCode);
  if (!session) return null;
  const id = randomUUID();
  db.prepare('INSERT INTO participants (id,session_id,name) VALUES (?,?,?)').run(id,session.id,name.trim().slice(0,32));
  return { id, name: name.trim().slice(0,32), sessionId: session.id };
}

export function controlSession(joinCode, patch) {
  const session = getSession(joinCode);
  if (!session) return null;
  const status = ['ready','live','paused','ended'].includes(patch.status) ? patch.status : session.status;
  const requestedActivity=Number(patch.currentActivityId);
  const activityId = Number.isInteger(requestedActivity) && db.prepare('SELECT 1 FROM activities WHERE id=? AND workshop_id=(SELECT workshop_id FROM live_sessions WHERE id=?)').get(requestedActivity,session.id) ? requestedActivity : session.currentActivityId;
  const seconds = Number.isInteger(patch.secondsRemaining) ? Math.max(0,Math.min(7200,patch.secondsRemaining)) : session.secondsRemaining;
  const show = typeof patch.showResults === 'boolean' ? Number(patch.showResults) : Number(session.showResults);
  db.prepare('UPDATE live_sessions SET status=?,current_activity_id=?,show_results=?,seconds_remaining=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(status,activityId,show,seconds,session.id);
  return getSession(joinCode);
}

export function addResponse(joinCode, input) {
  const session = getSession(joinCode);
  if (!session) return null;
  const participant = db.prepare('SELECT id FROM participants WHERE id=? AND session_id=?').get(input.participantId,session.id);
  if (!participant) return null;
  const activityId = Number(input.activityId || session.currentActivityId);
  const activity = db.prepare('SELECT id FROM activities WHERE id=? AND workshop_id=(SELECT workshop_id FROM live_sessions WHERE id=?)').get(activityId,session.id);
  const answer = String(input.answer || '').trim().slice(0,500);
  if (!activity || !answer) return null;
  const response = { id: randomUUID(), sessionId: session.id, activityId, participantId: participant.id, answer };
  db.prepare('INSERT INTO responses (id,session_id,activity_id,participant_id,answer) VALUES (?,?,?,?,?)')
    .run(response.id,response.sessionId,response.activityId,response.participantId,response.answer);
  db.prepare('UPDATE participants SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?').run(participant.id);
  return response;
}

const workspaceMembership=userId=>db.prepare(`SELECT m.organization_id organizationId,m.role workspaceRole,m.status,o.name organizationName,o.slug organizationSlug,o.plan FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=? AND m.status='active' ORDER BY m.created_at LIMIT 1`).get(userId);
const canManageWorkspace=userId=>{const membership=workspaceMembership(userId);return membership&&['owner','admin'].includes(membership.workspaceRole)?membership:null};
const workspaceMemberRows=organizationId=>db.prepare(`SELECT u.id,u.name,u.email,m.role,m.status,m.created_at createdAt FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,u.name`).all(organizationId);

export function getWorkspace(userId){
  const membership=workspaceMembership(userId);if(!membership)return null;
  const organization=db.prepare('SELECT id,name,slug,plan,website,sender_name senderName,sender_email senderEmail,created_at createdAt FROM organizations WHERE id=?').get(membership.organizationId);
  return{organization,membership:{role:membership.workspaceRole,status:membership.status},members:workspaceMemberRows(membership.organizationId),summary:{members:db.prepare("SELECT COUNT(*) count FROM organization_memberships WHERE organization_id=? AND status='active'").get(membership.organizationId).count,workshops:db.prepare('SELECT COUNT(*) count FROM workshops').get().count,audience:db.prepare('SELECT COUNT(*) count FROM audience_people').get().count}};
}

export function updateOrganization(userId,input={}){
  const actor=canManageWorkspace(userId);if(!actor)return{error:'forbidden'};
  const name=String(input.name||'').trim().slice(0,80);if(name.length<2)return{error:'invalid_name'};
  const website=String(input.website||'').trim().slice(0,160),senderName=String(input.senderName||name).trim().slice(0,80),senderEmail=String(input.senderEmail||'').trim().toLowerCase().slice(0,120);if(senderEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail))return{error:'invalid_sender_email'};
  db.prepare('UPDATE organizations SET name=?,website=?,sender_name=?,sender_email=? WHERE id=?').run(name,website,senderName,senderEmail,actor.organizationId);writeAudit(userId,'organization.update','organization',actor.organizationId,{name,website,senderName,senderEmail});return getWorkspace(userId);
}

export function createWorkspaceMember(userId,input={}){
  const actor=canManageWorkspace(userId);if(!actor)return{error:'forbidden'};
  const email=String(input.email||'').trim().toLowerCase(),name=String(input.name||'').trim().slice(0,60),password=String(input.password||''),role=['admin','presenter'].includes(input.role)?input.role:'presenter';
  if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return{error:'invalid_member'};
  let user=db.prepare('SELECT id,email,name FROM users WHERE email=?').get(email);
  if(!user&&password.length<12)return{error:'weak_password'};
  db.exec('BEGIN');try{
    if(!user){const id=randomUUID();db.prepare('INSERT INTO users(id,email,name,role,password_hash) VALUES(?,?,?,?,?)').run(id,email,name,role==='admin'?'admin':'presenter',hashPassword(password));user={id,email,name}}
    const exists=db.prepare('SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=?').get(actor.organizationId,user.id);if(exists){db.exec('ROLLBACK');return{error:'already_member'}}
    db.prepare("INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES(?,?,?,'active')").run(actor.organizationId,user.id,role);db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error}
  writeAudit(userId,'organization.member.create','user',user.id,{organizationId:actor.organizationId,role});return getWorkspace(userId);
}

export function updateWorkspaceMember(userId,memberId,input={}){
  const actor=canManageWorkspace(userId);if(!actor)return{error:'forbidden'};
  const member=db.prepare('SELECT role,status FROM organization_memberships WHERE organization_id=? AND user_id=?').get(actor.organizationId,memberId);if(!member)return{error:'not_found'};
  if(member.role==='owner'&&actor.workspaceRole!=='owner')return{error:'owner_required'};
  const role=['owner','admin','presenter'].includes(input.role)?input.role:member.role,status=['active','disabled'].includes(input.status)?input.status:member.status;
  if(role==='owner'&&actor.workspaceRole!=='owner')return{error:'owner_required'};
  if(memberId===userId&&(status==='disabled'||role!=='owner'&&member.role==='owner'))return{error:'self_protected'};
  if(member.role==='owner'&&(role!=='owner'||status!=='active')){const owners=db.prepare("SELECT COUNT(*) count FROM organization_memberships WHERE organization_id=? AND role='owner' AND status='active'").get(actor.organizationId).count;if(owners<=1)return{error:'last_owner'}}
  db.prepare('UPDATE organization_memberships SET role=?,status=? WHERE organization_id=? AND user_id=?').run(role,status,actor.organizationId,memberId);
  db.prepare('UPDATE users SET role=? WHERE id=?').run(role==='presenter'?'presenter':'admin',memberId);if(status==='disabled')db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(memberId);
  writeAudit(userId,'organization.member.update','user',memberId,{organizationId:actor.organizationId,role,status});return getWorkspace(userId);
}

export function deleteWorkspaceMember(userId,memberId){
  const actor=canManageWorkspace(userId);if(!actor)return{error:'forbidden'};if(memberId===userId)return{error:'self_protected'};
  const member=db.prepare('SELECT role FROM organization_memberships WHERE organization_id=? AND user_id=?').get(actor.organizationId,memberId);if(!member)return{error:'not_found'};if(member.role==='owner')return{error:'owner_protected'};
  db.exec('BEGIN');try{db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(memberId);db.prepare('DELETE FROM organization_memberships WHERE organization_id=? AND user_id=?').run(actor.organizationId,memberId);if(!db.prepare('SELECT 1 FROM organization_memberships WHERE user_id=? LIMIT 1').get(memberId))db.prepare('DELETE FROM users WHERE id=?').run(memberId);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
  writeAudit(userId,'organization.member.delete','user',memberId,{organizationId:actor.organizationId});return getWorkspace(userId);
}

export function authenticateUser(email,password) {
  const user=db.prepare('SELECT * FROM users WHERE email=?').get(String(email||'').toLowerCase().trim());
  if(!user || !verifyPassword(String(password||''),user.password_hash) || !workspaceMembership(user.id)) return null;
  const token=randomBytes(32).toString('base64url'), id=randomUUID();
  const expiresAt=new Date(Date.now()+7*24*60*60*1000).toISOString();
  db.prepare('INSERT INTO auth_sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)').run(id,user.id,tokenHash(token),expiresAt);
  writeAudit(user.id,'auth.login','user',user.id,{});
  const workspace=workspaceMembership(user.id);return {token,expiresAt,user:{id:user.id,email:user.email,name:user.name,role:user.role,workspaceRole:workspace.workspaceRole,organization:{id:workspace.organizationId,name:workspace.organizationName,slug:workspace.organizationSlug,plan:workspace.plan}}};
}

export function getAuthUser(token) {
  if(!token) return null;
  const row=db.prepare(`SELECT u.id,u.email,u.name,u.role,s.id session_id,s.expires_at,m.role workspace_role,o.id organization_id,o.name organization_name,o.slug organization_slug,o.plan FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN organization_memberships m ON m.user_id=u.id AND m.status='active' JOIN organizations o ON o.id=m.organization_id WHERE s.token_hash=? ORDER BY m.created_at LIMIT 1`).get(tokenHash(token));
  if(!row || new Date(row.expires_at).getTime()<=Date.now()) return null;
  return {id:row.id,email:row.email,name:row.name,role:row.role,workspaceRole:row.workspace_role,organization:{id:row.organization_id,name:row.organization_name,slug:row.organization_slug,plan:row.plan},sessionId:row.session_id};
}

export function revokeAuthSession(token) {
  if(token) db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(tokenHash(token));
}

export function moderateResponse(responseId,status,userId) {
  if(!['visible','hidden'].includes(status)) return null;
  const existing=db.prepare('SELECT session_id FROM responses WHERE id=?').get(responseId);
  if(!existing) return null;
  db.prepare('UPDATE responses SET status=?,moderated_by=?,moderated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,userId,responseId);
  writeAudit(userId,'response.moderate','response',responseId,{status});
  return existing;
}

export function writeAudit(userId,action,targetType,targetId,metadata={}) {
  db.prepare('INSERT INTO audit_logs (id,user_id,action,target_type,target_id,metadata) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(),userId||null,action,targetType||null,targetId||null,JSON.stringify(metadata));
}

export function getJoinCodeForSession(sessionId) {
  return db.prepare('SELECT w.join_code FROM live_sessions s JOIN workshops w ON w.id=s.workshop_id WHERE s.id=?').get(sessionId)?.join_code || null;
}

export function tickLiveSessions() {
  db.prepare("UPDATE live_sessions SET seconds_remaining=MAX(0,seconds_remaining-1),updated_at=CURRENT_TIMESTAMP WHERE status='live' AND seconds_remaining>0").run();
  db.prepare("UPDATE live_sessions SET status='paused' WHERE status='live' AND seconds_remaining=0").run();
}
