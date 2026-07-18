const base=process.env.TEST_API_BASE || 'http://localhost:8787';
const password=process.env.TEST_ADMIN_PASSWORD || 'CFLive@2026';
const request=async(path,options={})=>{
  const response=await fetch(`${base}${path}`,{...options,headers:{'content-type':'application/json',...(options.headers||{})},body:options.body?JSON.stringify(options.body):undefined});
  const body=await response.json().catch(()=>({}));
  return {status:response.status,body};
};
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

const denied=await request('/api/sessions/27RJ27/control',{method:'POST',body:{status:'paused'}});
assert(denied.status===401,'Control endpoint must reject anonymous requests');

const wrong=await request('/api/auth/login',{method:'POST',body:{email:'admin@cfl.live',password:'wrong-password'}});
assert(wrong.status===401,'Invalid password must be rejected');

const login=await request('/api/auth/login',{method:'POST',body:{email:'admin@cfl.live',password}});
assert(login.status===200 && login.body.token,'Admin login failed');
const auth={authorization:`Bearer ${login.body.token}`};

const me=await request('/api/auth/me',{headers:auth});
assert(me.status===200 && me.body.user.role==='admin' && me.body.user.workspaceRole==='owner','Authenticated workspace role check failed');

const deniedWorkspace=await request('/api/organization');
assert(deniedWorkspace.status===401,'Workspace management must reject anonymous requests');
const workspace=await request('/api/organization',{headers:auth});
assert(workspace.status===200 && workspace.body.workspace.organization.id && workspace.body.workspace.members.some(member=>member.id===me.body.user.id&&member.role==='owner'),'Workspace aggregation failed');
const protectedOwner=await request(`/api/organization/members/${me.body.user.id}`,{method:'PATCH',headers:auth,body:{status:'disabled'}});
assert(protectedOwner.status===422,'Owner must not be able to disable their own account');
const memberEmail=`presenter.${Date.now()}@example.com`,memberPassword='CFLive-QA-2026!';
const createdMember=await request('/api/organization/members',{method:'POST',headers:auth,body:{name:'Security Presenter',email:memberEmail,role:'presenter',password:memberPassword}});
assert(createdMember.status===201,'Workspace member creation failed');
const member=createdMember.body.workspace.members.find(item=>item.email===memberEmail);
assert(member?.role==='presenter'&&member.status==='active','Workspace membership was not persisted');
const memberLogin=await request('/api/auth/login',{method:'POST',body:{email:memberEmail,password:memberPassword}});
assert(memberLogin.status===200&&memberLogin.body.user.workspaceRole==='presenter','Presenter login failed');
const memberAuth={authorization:`Bearer ${memberLogin.body.token}`};
const memberCreateDenied=await request('/api/organization/members',{method:'POST',headers:memberAuth,body:{name:'Denied',email:`denied.${Date.now()}@example.com`,role:'presenter',password:memberPassword}});
assert(memberCreateDenied.status===403,'Presenter must not create workspace members');
const disabledMember=await request(`/api/organization/members/${member.id}`,{method:'PATCH',headers:auth,body:{status:'disabled'}});
assert(disabledMember.status===200&&disabledMember.body.workspace.members.find(item=>item.id===member.id)?.status==='disabled','Workspace member disable failed');
const disabledLogin=await request('/api/auth/login',{method:'POST',body:{email:memberEmail,password:memberPassword}});
assert(disabledLogin.status===401,'Disabled workspace member must not be able to sign in');
const removedMember=await request(`/api/organization/members/${member.id}`,{method:'DELETE',headers:auth});
assert(removedMember.status===200&&!removedMember.body.workspace.members.some(item=>item.id===member.id),'Workspace member cleanup failed');

const deniedWorkshops=await request('/api/workshops');
assert(deniedWorkshops.status===401,'Workshop management must reject anonymous requests');
const deniedReports=await request('/api/reports');
assert(deniedReports.status===401,'Reports must reject anonymous requests');
const deniedAudience=await request('/api/audience');
assert(deniedAudience.status===401,'Audience management must reject anonymous requests');
const deniedTemplates=await request('/api/templates');
assert(deniedTemplates.status===401,'Template library must reject anonymous requests');
const deniedDashboard=await request('/api/dashboard');
assert(deniedDashboard.status===401,'Home dashboard must reject anonymous requests');
const dashboard=await request('/api/dashboard',{headers:auth});
assert(dashboard.status===200 && Array.isArray(dashboard.body.dashboard.recent) && dashboard.body.dashboard.summary.workshops>=1,'Home dashboard aggregation failed');
const report=await request('/api/reports?workshopId=all&days=30',{headers:auth});
assert(report.status===200 && Array.isArray(report.body.report.performance),'Report aggregation failed');
const exportResponse=await fetch(`${base}/api/reports/export?workshopId=all&days=30`,{headers:auth});
const exportCsv=await exportResponse.text();
assert(exportResponse.status===200 && exportCsv.startsWith('"workshop","joinCode"'),'CSV report export failed');
const audience=await request('/api/audience',{headers:auth});
assert(audience.status===200 && Array.isArray(audience.body.audience.people) && Array.isArray(audience.body.audience.groups),'Audience directory failed');
const unique=Date.now();
const createdGroup=await request('/api/audience/groups',{method:'POST',headers:auth,body:{name:`Security QA ${unique}`}});
assert(createdGroup.status===201 && createdGroup.body.group.id,'Audience group creation failed');
const invited=await request('/api/audience',{method:'POST',headers:auth,body:{emails:[`security.qa.${unique}@example.com`],groupId:createdGroup.body.group.id}});
assert(invited.status===201 && invited.body.people.length===1,'Audience invitation failed');
const templateList=await request('/api/templates?category=all',{headers:auth});
assert(templateList.status===200 && templateList.body.templates.length>=8,'Template library failed');
const templateDetail=await request('/api/templates/template-wellness',{headers:auth});
assert(templateDetail.status===200 && templateDetail.body.template.activities.length===5,'Template detail failed');
const customTemplate=await request('/api/templates',{method:'POST',headers:auth,body:{title:`Security template ${unique}`,description:'Template API security verification.',category:'Learning',estimatedMinutes:4,activities:[{title:'Security check',type:'Q&A',question:'Is this template protected?'}]}});
assert(customTemplate.status===201 && customTemplate.body.template.activities.length===1,'Custom template creation failed');
const templateWorkshop=await request('/api/templates/template-wellness/use',{method:'POST',headers:auth,body:{title:`Template workshop ${unique}`}});
assert(templateWorkshop.status===201 && templateWorkshop.body.workshop.activities.length===5,'Template-to-workshop creation failed');
const removedTemplateWorkshop=await request(`/api/workshops/${templateWorkshop.body.workshop.id}`,{method:'DELETE',headers:auth});
assert(removedTemplateWorkshop.status===200,'Template workshop cleanup failed');
const removedCustomTemplate=await request(`/api/templates/${customTemplate.body.template.id}`,{method:'DELETE',headers:auth});
assert(removedCustomTemplate.status===200,'Custom template cleanup failed');
const createdWorkshop=await request('/api/workshops',{method:'POST',headers:auth,body:{title:'API smoke workshop',activities:[{title:'Opening pulse',type:'Word Cloud',question:'How are you feeling?'}]}});
assert(createdWorkshop.status===201 && createdWorkshop.body.workshop.activities.length===1,'Workshop creation failed');
const smokeWorkshop=createdWorkshop.body.workshop;
const createdActivity=await request(`/api/workshops/${smokeWorkshop.id}/activities`,{method:'POST',headers:auth,body:{title:'Priority vote',type:'Ranking',question:'What matters most?',options:['Health','Learning','Community'],settings:{showResults:true,anonymous:true}}});
assert(createdActivity.status===200 && createdActivity.body.workshop.activities.length===2 && createdActivity.body.workshop.activities[1].options.length===3 && createdActivity.body.workshop.activities[1].settings.anonymous===true,'Configured activity creation failed');
const activityId=createdActivity.body.workshop.activities[1].id;
const isolatedParticipant=await request(`/api/sessions/${smokeWorkshop.joinCode}/join`,{method:'POST',body:{name:'Isolation QA'}});
assert(isolatedParticipant.status===201,'Isolation participant join failed');
const crossWorkshopResponse=await request(`/api/sessions/${smokeWorkshop.joinCode}/responses`,{method:'POST',body:{participantId:isolatedParticipant.body.participant.id,activityId:3,answer:'Must be rejected'}});
assert(crossWorkshopResponse.status===422,'Responses must not target an activity from another workshop');
const updatedActivity=await request(`/api/workshops/${smokeWorkshop.id}/activities/${activityId}`,{method:'PATCH',headers:auth,body:{title:'Priority ranking',type:'Ranking',question:'What matters most today?',options:['Health','Learning','Community','Rest'],settings:{showResults:false,anonymous:true}}});
assert(updatedActivity.status===200 && updatedActivity.body.workshop.activities[1].title==='Priority ranking' && updatedActivity.body.workshop.activities[1].options[3]==='Rest' && updatedActivity.body.workshop.activities[1].settings.showResults===false,'Configured activity update failed');
const removedActivity=await request(`/api/workshops/${smokeWorkshop.id}/activities/${activityId}`,{method:'DELETE',headers:auth});
assert(removedActivity.status===200 && removedActivity.body.workshop.activities.length===1,'Activity deletion failed');
const removedWorkshop=await request(`/api/workshops/${smokeWorkshop.id}`,{method:'DELETE',headers:auth});
assert(removedWorkshop.status===200,'Workshop deletion failed');

const advancedActivities=[
  {title:'Visual vote',type:'Image Choice Poll',question:'Which image fits best?',options:['Sunrise','Mountain'],settings:{optionImages:['https://images.example.com/sunrise.jpg','javascript:alert(1)']}},
  {title:'Confidence',type:'Opinion Scale',question:'How confident are you?',settings:{min:1,max:7,leftLabel:'Unsure',rightLabel:'Confident'}},
  {title:'Ideas',type:'Idea Board',question:'What should we try next?'},
  {title:'Sequence',type:'Arrange the Steps',question:'Put these steps in order.',options:['Plan','Practice','Reflect']},
  {title:'Find it',type:'Hotspot Challenge',question:'Where is the target?',settings:{imageUrl:'https://images.example.com/map.jpg'}},
  {title:'Forecast',type:'Prediction Game',question:'What happens next?',options:['Grow','Hold','Drop'],settings:{correctOption:1}},
  {title:'Promise',type:'Commitment Wall',question:'What will you commit to?'},
  {title:'Group total',type:'Number Count',question:'How many minutes did you exercise?',settings:{min:0,max:1000000}},
  {title:'Branching pulse',type:'Conditional Poll',question:'Would you recommend this workshop?',options:['Yes','No'],settings:{followUps:['What helped you most?','What should we improve?']}},
];
const advancedWorkshop=await request('/api/workshops',{method:'POST',headers:auth,body:{title:`Advanced activities ${unique}`,activities:advancedActivities}});
assert(advancedWorkshop.status===201&&advancedWorkshop.body.workshop.activities.length===9,'Advanced activity creation failed');
const advancedSaved=advancedWorkshop.body.workshop.activities;
assert(advancedSaved.map(item=>item.type).join('|')===advancedActivities.map(item=>item.type).join('|'),'Advanced activity types were not persisted');
assert(advancedSaved[0].settings.optionImages[0].startsWith('https://')&&advancedSaved[0].settings.optionImages[1]===''&&advancedSaved[1].settings.max===7&&advancedSaved[1].settings.rightLabel==='Confident'&&advancedSaved[4].settings.imageUrl.startsWith('https://')&&advancedSaved[5].settings.correctOption===1&&advancedSaved[7].settings.min===0&&advancedSaved[7].settings.max===1000000&&advancedSaved[8].settings.followUps[0]==='What helped you most?'&&advancedSaved[8].settings.followUps[1]==='What should we improve?','Advanced activity settings validation failed');
const numberControlled=await request(`/api/sessions/${advancedWorkshop.body.workshop.joinCode}/control`,{method:'POST',headers:auth,body:{currentActivityId:advancedSaved[7].id}});
assert(numberControlled.status===200,'Number total activity selection failed');
const numberParticipant=await request(`/api/sessions/${advancedWorkshop.body.workshop.joinCode}/join`,{method:'POST',body:{name:'Number QA'}});
const numberResponse=await request(`/api/sessions/${advancedWorkshop.body.workshop.joinCode}/responses`,{method:'POST',body:{participantId:numberParticipant.body.participant.id,activityId:advancedSaved[7].id,answer:'125.5'}});
assert(numberResponse.status===201&&numberResponse.body.response.answer==='125.5','Number total response persistence failed');
const invalidNumberResponse=await request(`/api/sessions/${advancedWorkshop.body.workshop.joinCode}/responses`,{method:'POST',body:{participantId:numberParticipant.body.participant.id,activityId:advancedSaved[7].id,answer:'not-a-number'}});
assert(invalidNumberResponse.status===422,'Number total accepted a non-numeric response');
const conditionalControlled=await request(`/api/sessions/${advancedWorkshop.body.workshop.joinCode}/control`,{method:'POST',headers:auth,body:{currentActivityId:advancedSaved[8].id}});
assert(conditionalControlled.status===200,'Conditional activity selection failed');
const conditionalParticipant=await request(`/api/sessions/${advancedWorkshop.body.workshop.joinCode}/join`,{method:'POST',body:{name:'Branch QA'}});
const conditionalAnswer=JSON.stringify({choice:'Yes',followUp:'The practical examples helped me most.'});
const conditionalResponse=await request(`/api/sessions/${advancedWorkshop.body.workshop.joinCode}/responses`,{method:'POST',body:{participantId:conditionalParticipant.body.participant.id,activityId:advancedSaved[8].id,answer:conditionalAnswer}});
assert(conditionalResponse.status===201&&conditionalResponse.body.response.answer===conditionalAnswer,'Conditional poll response persistence failed');
const removedAdvancedWorkshop=await request(`/api/workshops/${advancedWorkshop.body.workshop.id}`,{method:'DELETE',headers:auth});
assert(removedAdvancedWorkshop.status===200,'Advanced activity cleanup failed');

const controlled=await request('/api/sessions/27RJ27/control',{method:'POST',headers:auth,body:{status:'paused'}});
assert(controlled.status===200,'Authenticated presenter control failed');

const joined=await request('/api/sessions/27RJ27/join',{method:'POST',body:{name:'Security QA'}});
assert(joined.status===201,'Participant join failed');
const answered=await request('/api/sessions/27RJ27/responses',{method:'POST',body:{participantId:joined.body.participant.id,activityId:3,answer:'Moderation smoke test'}});
assert(answered.status===201,'Participant response failed');
const responseId=answered.body.response.id;

const moderated=await request(`/api/responses/${responseId}/moderate`,{method:'POST',headers:auth,body:{status:'hidden'}});
assert(moderated.status===200,'Moderation failed');
const current=await request('/api/sessions/27RJ27');
assert(!current.body.responses.some(item=>item.id===responseId),'Hidden response remained public');

console.log('Security smoke test passed: auth, workspace owner safeguards, member create/login/disable/delete RBAC, home dashboard, reports/CSV export, audience/groups/invites, templates/custom/use, advanced, number-total and conditional activity persistence, branching responses, workshop response isolation, protected control, response moderation.');
