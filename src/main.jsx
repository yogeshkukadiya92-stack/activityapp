import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import './styles.css';
import { API_BASE, api, getAuthToken, setAuthToken, useLiveSession } from './api';

const activities = [
  { id: 1, title: 'Icebreaker', type: 'Q&A', icon: 'chat', color: 'violet' },
  { id: 2, title: 'Energy Check', type: 'Poll', icon: 'chart', color: 'blue' },
  { id: 3, title: 'Healthy living', type: 'Word Cloud', icon: 'cloud', color: 'lime' },
  { id: 4, title: 'Top Priorities', type: 'Ranking', icon: 'trophy', color: 'orange' },
  { id: 5, title: 'Knowledge Check', type: 'Quiz', icon: 'check', color: 'teal' },
];
const activityTypes=['Live Poll','Conditional Poll','Multiple Answers','Image Choice Poll','Opinion Scale','Number Count','Word Cloud','Idea Board','Ranking','Arrange the Steps','Hotspot Challenge','Prediction Game','Commitment Wall','Q&A','Quiz'];
const optionTypes=new Set(['Live Poll','Conditional Poll','Multiple Answers','Image Choice Poll','Ranking','Arrange the Steps','Prediction Game','Quiz','Poll']);
const defaultOptionsFor=activity=>{
  if(activity?.options?.length)return activity.options;
  const title=String(activity?.title||'').toLowerCase();
  if(title.includes('daily habit'))return ['Sleep 7–8 hours','Daily movement','Balanced nutrition','Mindfulness'];
  if(activity?.type==='Quiz')return ['Small daily actions','One perfect week','Motivation alone','Skipping rest'];
  if(activity?.type==='Ranking')return ['Energy','Movement','Nutrition','Recovery'];
  if(activity?.type==='Image Choice Poll')return ['Option A','Option B','Option C'];
  if(activity?.type==='Arrange the Steps')return ['Discover','Plan','Practice','Reflect'];
  if(activity?.type==='Prediction Game')return ['Option A','Option B','Option C'];
  return ['High energy','Calm and focused','Need a reset'];
};
const typeMeta=type=>({
  'Word Cloud':['cloud','lime'],'Ranking':['trophy','orange'],'Q&A':['chat','violet'],'Quiz':['check','teal'],
  'Live Poll':['chart','blue'],'Conditional Poll':['chart','blue'],'Multiple Answers':['list','violet'],'Number Count':['chart','teal'],'Poll':['chart','blue'],
  'Image Choice Poll':['eye','teal'],'Opinion Scale':['sliders','violet'],'Idea Board':['spark','lime'],'Arrange the Steps':['list','orange'],
  'Hotspot Challenge':['target','blue'],'Prediction Game':['trophy','violet'],'Commitment Wall':['heart','lime'],
}[type]||['chat','violet']);
const parseConditionalAnswer=value=>{try{const parsed=JSON.parse(String(value||''));return parsed&&typeof parsed==='object'?{choice:String(parsed.choice||''),followUp:String(parsed.followUp||'')}:{choice:String(value||''),followUp:''}}catch{return{choice:String(value||''),followUp:''}}};
const conditionalAnswer=(choice,followUp='')=>JSON.stringify({choice,followUp});
const responseValues=responses=>responses.flatMap(item=>{try{const parsed=JSON.parse(item.answer);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&parsed.choice)return [String(parsed.choice)];return Array.isArray(parsed)?parsed:[item.answer]}catch{return String(item.answer||'').split('\u001f')}});
const safeImage=value=>/^(https:\/\/|\/(?!\/))/.test(String(value||''))?String(value):'';
const moveItem=(items,from,to)=>{if(to<0||to>=items.length)return items;const next=[...items],[item]=next.splice(from,1);next.splice(to,0,item);return next};
const initialAnswerFor=activity=>{if(activity?.type==='Arrange the Steps')return defaultOptionsFor(activity).join('\u001f');if(activity?.type==='Opinion Scale'){const min=Number(activity.settings?.min??1),max=Number(activity.settings?.max??10);return String(Math.round((min+max)/2))}return ''};
const templates=[
  {id:'team',title:'Team pulse',description:'4 activities',color:'lime',activities:[{title:'One-word check-in',type:'Word Cloud',question:'How are you arriving today?'},{title:'Energy check',type:'Live Poll',question:'How is your energy right now?'},{title:'Top priority',type:'Ranking',question:'What should we focus on first?'},{title:'Open floor',type:'Q&A',question:'What does the team need to hear?'}]},
  {id:'wellness',title:'Wellness check-in',description:'5 activities',color:'violet',activities:[{title:'Healthy living',type:'Word Cloud',question:'What does healthy living mean to you?'},{title:'Energy check',type:'Live Poll',question:'How is your energy right now?'},{title:'Daily habits',type:'Multiple Answers',question:'Which habits support you most?'},{title:'Top priorities',type:'Ranking',question:'What should you focus on first?'},{title:'Commitment',type:'Q&A',question:'What will you commit to this week?'}]},
  {id:'learning',title:'Learning review',description:'6 activities',color:'blue',activities:[{title:'Opening reflection',type:'Q&A',question:'What stood out most?'},{title:'Confidence check',type:'Live Poll',question:'How confident do you feel?'},{title:'Key ideas',type:'Word Cloud',question:'Which idea will you remember?'},{title:'Priorities',type:'Ranking',question:'What should we apply first?'},{title:'Knowledge check',type:'Quiz',question:'Which answer is correct?'},{title:'Next step',type:'Q&A',question:'What will you do next?'}]},
];

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    file: <><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.2 2.4c-.9.4-.9 1.2-.9 1.6M12 17h.01"/></>,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H9l-5 3v-5a7 7 0 0 1-2-5V8a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/></>,
    cloud: <path d="M6 18h11a4 4 0 0 0 .6-8A6 6 0 0 0 6 8.5 4.8 4.8 0 0 0 6 18Z"/>,
    trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0zM10 17h4M12 13v4M8 7H4a4 4 0 0 0 4 4M16 7h4a4 4 0 0 1-4 4M8 21h8"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
    play: <path fill="currentColor" stroke="none" d="m8 5 11 7-11 7z"/>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
    filter: <path d="M4 5h16l-6 7v6l-4 2v-8z"/>,
    sliders: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="white"/><circle cx="15" cy="12" r="2" fill="white"/><circle cx="7" cy="18" r="2" fill="white"/></>,
    fullscreen: <><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    qr: <><rect x="3" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><path d="M15 15h2v2h-2zM19 15h2v6h-6v-2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    edit: <><path d="m4 20 4-.8L19 8.2 15.8 5 4.8 16z"/><path d="m14.5 6.3 3.2 3.2"/></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 20h14"/></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>,
    book: <><path d="M4 5a3 3 0 0 1 3-3h5v18H7a3 3 0 0 0-3 2z"/><path d="M20 5a3 3 0 0 0-3-3h-5v18h5a3 3 0 0 1 3 2z"/></>,
    spark: <><path d="m12 3 1.4 4.1L18 9l-4.6 1.9L12 15l-1.4-4.1L6 9l4.6-1.9z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4z"/>,
    external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></>,
  };
  return <svg {...common}>{paths[name] || paths.help}</svg>;
}

function Logo({ compact = false }) {
  return <div className={`logo ${compact ? 'compact' : ''}`} aria-label="CFL Live"><span>CFL</span><b>Live</b><i aria-hidden="true"><em/><em/><em/></i></div>;
}

function SideNav({ onOpenParticipant, active='home', onNavigate=()=>{} }) {
  const items = [['home','Home'],['calendar','Workshops'],['file','Templates'],['chart','Reports'],['users','Team'],['sliders','Workspace']];
  return <aside className="side-nav">
    <Logo />
    <nav aria-label="Primary navigation">{items.map(([icon,label]) => {const current=active===label.toLowerCase();return <button type="button" aria-current={current?'page':undefined} className={current ? 'active' : ''} onClick={()=>onNavigate(label.toLowerCase())} key={label}><Icon name={icon}/><span>{label}</span></button>})}</nav>
    <div className="side-bottom">
      <div className="side-assurance"><Icon name="check"/><span>Secure workspace</span></div>
      <button type="button" onClick={onOpenParticipant}><Icon name="qr"/><span>Join preview</span></button>
    </div>
  </aside>;
}

function ActivityRail({ selected, setSelected, items=activities, onEdit }) {
  return <section className="activity-rail panel">
    <div className="panel-title"><h2>Activities</h2><button className="icon-button" aria-label="Add activity" onClick={onEdit}><Icon name="plus"/></button></div>
    <div className="activity-list">
      {items.map((item,index) => {const [icon,color]=typeMeta(item.type);return <button key={item.id} className={`activity-row ${selected===item.id ? 'selected' : ''}`} onClick={()=>setSelected(item.id)}>
        <span className="activity-number">{index+1}</span>
        <span className={`activity-icon ${item.color||color}`}><Icon name={item.icon||icon}/></span>
        <span className="activity-copy"><strong>{item.title}</strong><small>{item.type}</small></span>
        <span className="kebab">•••</span>
      </button>})}
    </div>
    <button className="add-activity" onClick={onEdit}><Icon name="plus" size={18}/> Add activity</button>
  </section>;
}

function WordCloud({ live, responses=[] }) {
  const submitted = responses.slice(0,8).map((item,index)=>[
    item.answer, Math.max(16,28-index*2), 16+(index*11)%74, 27+(index*17)%62, ['teal','violet','blue','lime'][index%4]
  ]);
  const visibleWords = submitted;
  return <div className={`word-cloud ${live ? 'is-live' : ''}`}>
    {!visibleWords.length&&<p className="result-empty">Responses will appear here in real time.</p>}
    {visibleWords.map(([word,size,x,y,color],i) => <span key={`${word}-${i}`} className={color} style={{fontSize:`${size}px`, left:`${x}%`, top:`${y}%`, transform:`translate(-50%,-50%) rotate(${i%5===0?-2:i%7===0?2:0}deg)`, animationDelay:`${i*.04}s`}}>{word}</span>)}
  </div>;
}

function PollPreview({activity,responses=[]}) {
  const options=defaultOptionsFor(activity),answers=responseValues(responses),counts=options.map(option=>answers.filter(answer=>answer===option).length),max=Math.max(1,...counts),correct=Number(activity.settings?.correctOption);
  return <div className="poll-preview">{options.map((option,index)=><div key={option} className={activity.type==='Prediction Game'&&correct===index?'correct':''}><span>{option}{activity.type==='Prediction Game'&&correct===index?<em>Correct prediction</em>:null}</span><b style={{width:`${counts[index]?Math.max(5,counts[index]/max*100):0}%`}}>{counts[index]}</b></div>)}</div>;
}

function ConditionalResults({activity,responses=[]}){
  const answers=responses.map(item=>({...parseConditionalAnswer(item.answer),id:item.id})),options=defaultOptionsFor(activity),branches=options.map((option,index)=>({option,index,question:String(activity.settings?.followUps?.[index]||'').trim(),type:activity.settings?.followUpTypes?.[index]==='number'?'number':'short',answers:answers.filter(item=>item.choice===option&&item.followUp.trim())})).filter(branch=>branch.question);
  return <div className="conditional-results"><PollPreview activity={activity} responses={responses}/>{branches.length?<section className="conditional-branch-results">{branches.map(branch=>{const values=branch.answers.map(item=>Number(item.followUp)).filter(Number.isFinite),total=values.reduce((sum,value)=>sum+value,0);return <article key={branch.option}><header><span>{branch.option}</span><small>{branch.type==='number'?'NUMBER TOTAL':'SHORT ANSWERS'}</small></header><strong>{branch.question}</strong>{branch.type==='number'?<div className="conditional-number-total"><b>{formatNumber(total)}</b><small>{values.length} numeric responses</small></div>:<div className="conditional-short-answers">{branch.answers.slice(0,4).map(item=><blockquote key={item.id}>{item.followUp}</blockquote>)}{!branch.answers.length&&<p>Responses will appear here.</p>}</div>}</article>})}</section>:<p>Follow-up responses will appear after participants choose a branch.</p>}</div>;
}

function ImageChoiceResults({activity,responses=[]}){
  const options=defaultOptionsFor(activity),images=activity.settings?.optionImages||[],answers=responseValues(responses),counts=options.map(option=>answers.filter(value=>value===option).length),total=Math.max(1,answers.length);
  return <div className="image-choice-results">{options.map((option,index)=><article key={option}>{safeImage(images[index])?<img src={safeImage(images[index])} alt=""/>:<span className={`image-placeholder tone-${index%4}`}><Icon name="eye" size={28}/></span>}<div><strong>{option}</strong><small>{counts[index]} votes · {Math.round(counts[index]/total*100)}%</small></div></article>)}</div>;
}

function OpinionScaleResults({activity,responses=[]}){
  const min=Number(activity.settings?.min??1),max=Math.max(min+1,Number(activity.settings?.max??10)),values=responses.map(item=>Number(item.answer)).filter(Number.isFinite),average=values.length?values.reduce((sum,value)=>sum+value,0)/values.length:(min+max)/2,position=Math.max(0,Math.min(100,(average-min)/(max-min)*100));
  return <div className="scale-results"><strong>{values.length?average.toFixed(1):'—'}</strong><span>Average from {values.length} responses</span><div><i style={{left:`${position}%`}}/><b>{min}</b><b>{max}</b></div><footer><small>{activity.settings?.leftLabel||'Not at all'}</small><small>{activity.settings?.rightLabel||'Absolutely'}</small></footer></div>;
}

const formatNumber=value=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(value);

function NumberTotalResults({responses=[]}){
  const values=responses.map(item=>Number(item.answer)).filter(Number.isFinite),total=values.reduce((sum,value)=>sum+value,0),average=values.length?total/values.length:0;
  return <div className="number-results"><small>GRAND TOTAL</small><strong>{formatNumber(total)}</strong><div><span><b>{values.length}</b> responses</span><span><b>{formatNumber(average)}</b> average</span></div></div>;
}

function BoardResults({responses=[],commitment=false}){
  return <div className={`board-results ${commitment?'commitment':''}`}>{responses.slice(0,12).map((item,index)=><blockquote key={item.id} className={`note-${index%4}`}>{commitment&&<Icon name="heart" size={17}/>}<span>{item.answer}</span></blockquote>)}{!responses.length&&<p>Ideas will appear here in real time.</p>}</div>;
}

function ArrangeResults({activity,responses=[]}){
  const sequences=responses.map(item=>String(item.answer||'').split('\u001f').filter(Boolean)),counts=new Map();for(const sequence of sequences){const key=sequence.join('\u001f');if(key)counts.set(key,(counts.get(key)||0)+1)}const winner=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0],steps=winner?winner[0].split('\u001f'):defaultOptionsFor(activity);
  return <div className="arrange-results"><header><strong>Most popular order</strong><span>{winner?.[1]||0} of {sequences.length} submissions</span></header><ol>{steps.map((step,index)=><li key={`${step}-${index}`}><b>{index+1}</b><span>{step}</span></li>)}</ol></div>;
}

function HotspotResults({activity,responses=[]}){
  const points=responses.map(item=>String(item.answer||'').split(',').map(Number)).filter(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=100&&y>=0&&y<=100),image=safeImage(activity.settings?.imageUrl);
  return <div className="hotspot-results" style={image?{backgroundImage:`url("${image.replaceAll('"','%22')}")`}:undefined}>{!image&&<div><Icon name="target" size={54}/><span>Add a challenge image in Activity Studio</span></div>}{points.map(([x,y],index)=><i key={index} style={{left:`${x}%`,top:`${y}%`}}/>)}<b>{points.length} hotspots</b></div>;
}

function ActivityResults({activity,responses=[]}){
  if(!activity)return null;
  if(activity.type==='Word Cloud')return <WordCloud live responses={responses}/>;
  if(activity.type==='Conditional Poll')return <ConditionalResults activity={activity} responses={responses}/>;
  if(activity.type==='Image Choice Poll')return <ImageChoiceResults activity={activity} responses={responses}/>;
  if(activity.type==='Opinion Scale')return <OpinionScaleResults activity={activity} responses={responses}/>;
  if(activity.type==='Idea Board')return <BoardResults responses={responses}/>;
  if(activity.type==='Commitment Wall')return <BoardResults responses={responses} commitment/>;
  if(activity.type==='Arrange the Steps')return <ArrangeResults activity={activity} responses={responses}/>;
  if(activity.type==='Hotspot Challenge')return <HotspotResults activity={activity} responses={responses}/>;
  if(optionTypes.has(activity.type))return <PollPreview activity={activity} responses={responses}/>;
  if(activity.type==='Number Count')return <NumberTotalResults responses={responses}/>;
  return <div className="qa-results">{responses.slice(0,6).map(item=><blockquote key={item.id}>{item.answer}</blockquote>)}{!responses.length&&<p>Responses will appear here.</p>}</div>;
}

const toggleFullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{}}

function PreviewCanvas({ selected, live, responses=[], items=activities }) {
  const activity = items.find(a=>a.id===selected)||items[0];
  if(!activity)return <main className="preview panel empty-workshop"><div className="empty-activity"><span className="activity-icon big lime"><Icon name="plus" size={34}/></span><h3>Add your first activity</h3><p>Open the workshop editor to build the audience experience.</p></div></main>;
  return <main className="preview panel">
    <div className="preview-meta"><span><i/> {live ? 'LIVE PREVIEW' : 'PREVIEW'}</span><button className="icon-button" aria-label="Toggle fullscreen" onClick={toggleFullscreen}><Icon name="fullscreen"/></button></div>
    <div className="question-wrap">
      <p className="question-type">{activity.type}</p>
      <h1>{activity.question}</h1>
    </div>
    <ActivityResults activity={activity} responses={responses}/>
    <div className="preview-foot"><span><i className={live?'on':''}/> {live?'Live updates on':'Waiting to start'}</span><span>Answers appear instantly</span></div>
  </main>;
}

function MiniQr({joinCode}) {
  const [source,setSource]=useState('');
  const joinUrl=`${location.origin}/?join=${encodeURIComponent(joinCode)}`;
  useEffect(()=>{let active=true;QRCode.toDataURL(joinUrl,{width:240,margin:1,errorCorrectionLevel:'M'}).then(value=>active&&setSource(value)).catch(()=>active&&setSource(''));return()=>{active=false}},[joinUrl]);
  return source?<img className="mini-qr" src={source} alt={`Scan to join workshop ${joinCode}`}/>:<div className="mini-qr qr-loading" aria-label="Preparing QR code"/>;
}

function LivePanel({ live, setLive, participants, answers, seconds, setSeconds, showResults, setShowResults, onHideLatest, canHide, joinCode='27RJ27' }) {
  const format = `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  const joinHost=location.host;
  return <aside className="live-panel panel">
    <h2>Live session</h2>
    <label>Join code</label>
    <button className="join-code" onClick={()=>navigator.clipboard?.writeText(joinCode)}>{joinCode} <small>copy</small></button>
    <div className="live-stats"><div><Icon name="users"/><strong>{participants}</strong><span>participants</span></div><div><Icon name="chat"/><strong>{answers}</strong><span>answers</span></div></div>
    <div className="qr-block"><MiniQr joinCode={joinCode}/><p>Join at<strong>{joinHost}</strong><span>or scan QR code</span></p></div>
    <button className={`primary-btn ${live?'stop':''}`} onClick={()=>setLive(!live)}><Icon name="play"/>{live?'Pause activity':'Start activity'}</button>
    <button className={`outline-btn ${showResults?'active':''}`} onClick={()=>setShowResults(!showResults)}><Icon name="eye"/>{showResults?'Results visible':'Show results'}</button>
    <div className="control-section">
      <label>Activity timer</label><div className="timer"><strong>{format}</strong><button onClick={()=>setSeconds(Math.max(0,seconds-30))}>−</button><button onClick={()=>setSeconds(seconds+30)}>+</button></div>
    </div>
    <div className="control-section moderation"><label>Moderation</label><div><span className="moderation-status"><Icon name="sliders"/><small>Manual review</small></span><span className="moderation-status"><Icon name="filter"/><small>Visible only</small></span><button disabled={!canHide} onClick={onHideLatest}><Icon name="help"/><span>Hide latest<br/>answer</span></button></div></div>
  </aside>;
}

function BottomBar({ selected, setSelected, onProjector, items=activities, onBack }) {
  const index=Math.max(0,items.findIndex(item=>item.id===selected)), activity=items[index];
  return <footer className="bottom-bar">
    <button className="quiet" onClick={onBack}>All workshops</button>
    <button className="nav-btn reverse" disabled={index===0||!activity} onClick={()=>setSelected(items[index-1].id)}><Icon name="arrow"/> Previous</button>
    <div><strong>{activity?index+1:0} / {items.length}</strong><span>{activity?.type||'No activities'}</span></div>
    <button className="nav-btn" disabled={index>=items.length-1||!activity} onClick={()=>setSelected(items[index+1].id)}>Next <Icon name="arrow"/></button>
    <button className="quiet" onClick={onProjector}>Projector view</button>
    <button className="quiet" onClick={toggleFullscreen}><Icon name="fullscreen"/> Fullscreen</button>
  </footer>;
}

function PresenterApp({ onJoin, onProjector, user, onLogout, joinCode='27RJ27', onBack, onEdit, onNavigate }) {
  const {session,connection,control}=useLiveSession(joinCode);
  const [selected,setSelectedLocal]=useState(null);
  const [shareState,setShareState]=useState('Share join link');
  useEffect(()=>{if(session?.currentActivityId)setSelectedLocal(session.currentActivityId)},[session?.currentActivityId]);
  const sessionActivities=session?.activities||[];
  const live=session?.status==='live', answers=session?.answerCount ?? 0, participants=session?.participantCount ?? 0;
  const seconds=session?.secondsRemaining ?? 180, showResults=session?.showResults ?? true;
  const setSelected=(value)=>{const next=typeof value==='function'?value(selected):value;setSelectedLocal(next);control({currentActivityId:next})};
  const setSeconds=(value)=>control({secondsRemaining:typeof value==='function'?value(seconds):value});
  const latestResponse=session?.responses?.[0];
  const hideLatest=async()=>{if(latestResponse)await api(`/api/responses/${latestResponse.id}/moderate`,{method:'POST',body:{status:'hidden'},auth:true})};
  const shareJoin=async()=>{const url=`${location.origin}/?join=${encodeURIComponent(session?.joinCode||joinCode)}`;try{if(navigator.share)await navigator.share({title:session?.title||'CFL Live workshop',text:'Join this live workshop',url});else{await navigator.clipboard.writeText(url);setShareState('Join link copied');setTimeout(()=>setShareState('Share join link'),1800)}}catch{}}
  return <div className="app-shell">
    <SideNav active="workshops" onOpenParticipant={onJoin} onNavigate={onNavigate}/>
    <header className="topbar"><div className="workshop-mark"><Icon name="file"/><h1>{session?.title || 'Live workshop'}</h1></div><div className="top-actions"><span className={`connected ${connection==='reconnecting'||connection==='offline'?connection:''}`}><i/>{connection==='reconnecting'||connection==='offline'?'Reconnecting':'Connected'}</span><button className="share" aria-label={shareState} title={shareState} onClick={shareJoin}><Icon name="users"/></button><button className="avatar" onClick={onLogout} title={`Sign out ${user?.name || ''}`}>{user?.name?.split(' ').map(part=>part[0]).join('').slice(0,2) || 'YP'}</button></div></header>
    <div className="workspace"><ActivityRail selected={selected} setSelected={setSelected} items={sessionActivities} onEdit={onEdit}/><PreviewCanvas selected={selected} live={live} responses={session?.responses} items={sessionActivities}/><LivePanel live={live} setLive={(next)=>control({status:next?'live':'paused'})} participants={participants} answers={answers} seconds={seconds} setSeconds={setSeconds} showResults={showResults} setShowResults={(next)=>control({showResults:next})} onHideLatest={hideLatest} canHide={Boolean(latestResponse)} joinCode={session?.joinCode||joinCode}/></div>
    <BottomBar selected={selected} setSelected={setSelected} onProjector={onProjector} items={sessionActivities} onBack={onBack}/>
  </div>;
}

function EditorParticipantPreview({activity,options,settings}){
  if(!activity)return null;
  if(activity.type==='Conditional Poll'){const branchIndex=(settings.followUps||[]).findIndex(value=>String(value||'').trim()),branch=branchIndex>=0?branchIndex:0,followUpType=settings.followUpTypes?.[branch]==='number'?'number':'short';return <div className="studio-conditional-preview"><div className="studio-phone-options">{options.map((option,index)=><label key={index} className={index===branch?'selected':''}><input type="radio" name="studio-preview-option" checked={index===branch} readOnly/>{option}</label>)}</div>{settings.followUps?.[branch]&&<section><small>If “{options[branch]}” · {followUpType==='number'?'Number total':'Short answer'}</small><strong>{settings.followUps[branch]}</strong>{followUpType==='number'?<input type="number" disabled placeholder="Enter a number"/>:<textarea disabled placeholder="Participant follow-up answer"/>}</section>}</div>}
  if(activity.type==='Image Choice Poll')return <div className="studio-image-options">{options.map((option,index)=><label key={option}>{safeImage(settings.optionImages?.[index])?<img src={safeImage(settings.optionImages[index])} alt=""/>:<span><Icon name="eye"/></span>}<input type="radio" name="studio-image-option"/>{option}</label>)}</div>;
  if(activity.type==='Opinion Scale')return <div className="studio-scale"><strong>{Math.round((Number(settings.min)+Number(settings.max))/2)}</strong><input type="range" min={settings.min} max={settings.max} defaultValue={(Number(settings.min)+Number(settings.max))/2}/><div><span>{settings.leftLabel}</span><span>{settings.rightLabel}</span></div></div>;
  if(activity.type==='Arrange the Steps')return <ol className="studio-arrange">{options.map((option,index)=><li key={option}><b>{index+1}</b>{option}<span>↕</span></li>)}</ol>;
  if(activity.type==='Hotspot Challenge')return <div className="studio-hotspot" style={safeImage(settings.imageUrl)?{backgroundImage:`url("${safeImage(settings.imageUrl).replaceAll('"','%22')}")`}:undefined}><Icon name="target"/><span>Tap the image to place your answer</span></div>;
  if(optionTypes.has(activity.type))return <div className="studio-phone-options">{options.map((option,index)=><label key={index}><input type={settings.allowMultiple?'checkbox':'radio'} name="studio-preview-option"/>{option}</label>)}</div>;
  if(activity.type==='Number Count')return <div className="studio-number-preview"><input className="studio-phone-number" type="number" min={settings.min} max={settings.max} placeholder="Enter a number"/><small>Every response is added to the live total.</small></div>;
  return <textarea className="studio-phone-answer" placeholder={activity.type==='Commitment Wall'?'Write your commitment…':activity.type==='Idea Board'?'Share your idea…':'Type your answer…'}/>;
}

function ActivityEditor({workshopId,onClose,onChanged,user,onLogout,onJoin,onNavigate,onPresent}){
  const [workshop,setWorkshop]=useState(null),[selected,setSelected]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(true),[previewDevice,setPreviewDevice]=useState('Mobile');
  const load=()=>api(`/api/workshops/${workshopId}`,{auth:true}).then(result=>{setWorkshop(result.workshop);const preferred=result.workshop.activities.findIndex(item=>item.type==='Multiple Answers');setSelected(preferred>=0?preferred:0)}).catch(err=>setError(err.message));
  useEffect(()=>{load()},[workshopId]);
  const update=(patch)=>{setSaved(false);setWorkshop(value=>({...value,activities:value.activities.map((item,index)=>index===selected?{...item,...patch}:item)}))};
  const current=workshop?.activities?.[selected],options=current?defaultOptionsFor(current):[],settings={allowMultiple:current?.type==='Multiple Answers',showResults:true,anonymous:false,min:current?.type==='Number Count'?0:1,max:current?.type==='Number Count'?1000000:10,leftLabel:'Not at all',rightLabel:'Absolutely',imageUrl:'',optionImages:[],followUps:[],followUpTypes:[],correctOption:0,...(current?.settings||{})};
  const setOption=(index,value)=>update({options:options.map((item,itemIndex)=>itemIndex===index?value:item)});
  const setSetting=(key,value)=>update({settings:{...settings,[key]:value}});
  const removeOption=index=>update({options:options.filter((_,itemIndex)=>itemIndex!==index),settings:{...settings,optionImages:(settings.optionImages||[]).filter((_,itemIndex)=>itemIndex!==index),followUps:(settings.followUps||[]).filter((_,itemIndex)=>itemIndex!==index),followUpTypes:(settings.followUpTypes||[]).filter((_,itemIndex)=>itemIndex!==index)}});
  const save=async()=>{if(!current)return;setBusy(true);setError('');try{const item={...current,options,settings},path=item.isNew?`/api/workshops/${workshopId}/activities`:`/api/workshops/${workshopId}/activities/${item.id}`,result=await api(path,{method:item.isNew?'POST':'PATCH',auth:true,body:item});setWorkshop(result.workshop);setSelected(Math.min(selected,result.workshop.activities.length-1));setSaved(true);onChanged()}catch(err){setError(err.message)}finally{setBusy(false)}};
  const remove=async()=>{if(!current)return;if(current.isNew){setWorkshop(value=>({...value,activities:value.activities.filter((_,index)=>index!==selected)}));setSelected(Math.max(0,selected-1));return}setBusy(true);try{const result=await api(`/api/workshops/${workshopId}/activities/${current.id}`,{method:'DELETE',auth:true});setWorkshop(result.workshop);setSelected(Math.max(0,Math.min(selected,result.workshop.activities.length-1)));setSaved(true);onChanged()}catch(err){setError(err.message)}finally{setBusy(false)}};
  const add=()=>{const item={id:`new-${Date.now()}`,isNew:true,title:'New activity',type:'Live Poll',question:'Ask your audience a question',options:['Option 1','Option 2'],settings:{showResults:true}};setWorkshop(value=>({...value,activities:[...value.activities,item]}));setSelected(workshop.activities.length);setSaved(false)};
  if(!workshop)return <div className="studio-loading"><Logo compact/><span>Loading Activity Studio…</span></div>;
  const [previewIcon,previewColor]=typeMeta(current?.type);
  return <div className="studio-shell"><SideNav active="workshops" onOpenParticipant={onJoin} onNavigate={onNavigate}/><main className="studio-main">
    <header className="studio-top"><button className="studio-back" onClick={onClose}><Icon name="arrow"/> All workshops</button><h1>{workshop.title}</h1><div><span>{saved?'All changes saved':'Unsaved changes'}</span><button className="studio-preview" onClick={()=>document.querySelector('.studio-participant')?.scrollIntoView({behavior:'smooth',block:'center'})}><Icon name="eye"/> Preview</button><button className="studio-present" onClick={()=>onPresent(workshop.joinCode,workshop.id)}><Icon name="play"/> Present</button><button className="avatar" onClick={onLogout}>{initials(user?.name)||'YP'}</button></div></header>
    <div className="studio-workspace"><aside className="studio-rail"><header><h2>Activities</h2><span>{workshop.activities.length}</span></header><div>{workshop.activities.map((item,index)=>{const [icon,color]=typeMeta(item.type);return <button key={item.id} className={selected===index?'selected':''} onClick={()=>setSelected(index)}><b>{index+1}</b><i className={`activity-icon ${color}`}><Icon name={icon}/></i><span><strong>{item.title}</strong><small>{item.type}</small></span></button>})}</div><button className="studio-add" onClick={add}><Icon name="plus"/> Add activity</button></aside>
      <section className="studio-editor"><header><input aria-label="Activity title" value={current?.title||''} onChange={event=>update({title:event.target.value})}/><label><Icon name={previewIcon}/><select aria-label="Activity type" value={current?.type||'Live Poll'} onChange={event=>{const type=event.target.value,nextSettings={...settings,allowMultiple:type==='Multiple Answers'};if(type==='Number Count'){nextSettings.min=0;nextSettings.max=1000000}if(type==='Opinion Scale'){nextSettings.min=1;nextSettings.max=10}update({type,options:optionTypes.has(type)?defaultOptionsFor({type,title:current.title}):[],settings:nextSettings})}}>{activityTypes.map(type=><option key={type}>{type}</option>)}</select></label></header><div className="studio-scroll"><label className="studio-label">QUESTION</label><textarea className="studio-question" maxLength="280" value={current?.question||''} onChange={event=>update({question:event.target.value})}/><small className="studio-count">{current?.question?.length||0}/280</small>
        {optionTypes.has(current?.type)&&<section className="studio-options"><h3>{current.type==='Arrange the Steps'?'STEPS IN THE CORRECT ORDER':'ANSWER OPTIONS'}</h3>{options.map((option,index)=><div key={index}><span>⠿</span><input aria-label={`Option ${index+1}`} value={option} onChange={event=>setOption(index,event.target.value)}/><button aria-label={`Delete option ${index+1}`} onClick={()=>removeOption(index)}>×</button></div>)}<button className="studio-add-option" onClick={()=>update({options:[...options,current.type==='Arrange the Steps'?`Step ${options.length+1}`:`Option ${options.length+1}`],settings:{...settings,followUps:[...(settings.followUps||[]),''],followUpTypes:[...(settings.followUpTypes||[]),'short']}})}><Icon name="plus"/> Add {current.type==='Arrange the Steps'?'step':'option'}</button></section>}
        {current?.type==='Conditional Poll'&&<section className="studio-conditionals"><h3>BRANCH FOLLOW-UPS</h3><p>Add a question to either, both, or none of the answer branches.</p>{options.map((option,index)=><article key={index}><span>If answer is <b>{option}</b></span><div><select aria-label={`Follow-up response type for ${option}`} value={settings.followUpTypes?.[index]==='number'?'number':'short'} onChange={event=>{const followUpTypes=[...(settings.followUpTypes||[])];followUpTypes[index]=event.target.value;setSetting('followUpTypes',followUpTypes)}}><option value="short">Short answer</option><option value="number">Number total</option></select><textarea maxLength="180" value={settings.followUps?.[index]||''} onChange={event=>{const followUps=[...(settings.followUps||[])];followUps[index]=event.target.value;setSetting('followUps',followUps)}} placeholder="Optional follow-up question…"/><small>{settings.followUps?.[index]?.length||0}/180</small></div></article>)}</section>}
        {current?.type==='Image Choice Poll'&&<section className="studio-media"><h3>OPTION IMAGES</h3><p>Paste a secure HTTPS image URL for each choice.</p>{options.map((option,index)=><label key={index}><span>{option}</span><input type="url" value={settings.optionImages?.[index]||''} onChange={event=>{const images=[...(settings.optionImages||[])];images[index]=event.target.value;setSetting('optionImages',images)}} placeholder="https://example.com/image.jpg"/></label>)}</section>}
        {current?.type==='Opinion Scale'&&<section className="studio-number studio-scale-settings"><h3>OPINION SCALE</h3><label>Minimum<input type="number" value={settings.min} onChange={event=>setSetting('min',Number(event.target.value))}/></label><label>Maximum<input type="number" value={settings.max} onChange={event=>setSetting('max',Number(event.target.value))}/></label><label>Left label<input value={settings.leftLabel} onChange={event=>setSetting('leftLabel',event.target.value)}/></label><label>Right label<input value={settings.rightLabel} onChange={event=>setSetting('rightLabel',event.target.value)}/></label></section>}
        {current?.type==='Hotspot Challenge'&&<section className="studio-media"><h3>CHALLENGE IMAGE</h3><p>Participants will tap a location on this image.</p><label><span>Image URL</span><input type="url" value={settings.imageUrl} onChange={event=>setSetting('imageUrl',event.target.value)} placeholder="https://example.com/challenge.jpg"/></label></section>}
        {current?.type==='Prediction Game'&&<section className="studio-media"><h3>CORRECT PREDICTION</h3><label><span>Correct answer</span><select value={settings.correctOption} onChange={event=>setSetting('correctOption',Number(event.target.value))}>{options.map((option,index)=><option key={option} value={index}>{option}</option>)}</select></label></section>}
        {current?.type==='Number Count'&&<section className="studio-number"><h3>NUMBER TOTAL SETTINGS</h3><p>Participants enter one number. The projector adds every response into a live grand total.</p><label>Minimum allowed<input type="number" value={settings.min} onChange={event=>setSetting('min',Number(event.target.value))}/></label><label>Maximum allowed<input type="number" value={settings.max} onChange={event=>setSetting('max',Number(event.target.value))}/></label></section>}
        <section className="studio-settings"><h3>ACTIVITY SETTINGS</h3>{[...(current?.type==='Multiple Answers'?[['allowMultiple','Allow multiple selections']]:[]),['showResults','Show results automatically'],['anonymous','Responses are anonymous']].map(([key,label])=><div key={key}><span>{label}</span><button role="switch" aria-checked={Boolean(settings[key])} className={settings[key]?'on':''} onClick={()=>setSetting(key,!settings[key])}><i/></button></div>)}</section></div><footer><button className="studio-delete" onClick={remove} disabled={busy}>Delete activity</button><button className="studio-save" onClick={save} disabled={busy||!current?.title?.trim()||!current?.question?.trim()}>{busy?'Saving…':'Save changes'}</button></footer>{error&&<p className="editor-error">{error}</p>}</section>
      <aside className={`studio-participant ${previewDevice.toLowerCase()}`}><header><h2>Participant preview</h2><select aria-label="Preview device" value={previewDevice} onChange={event=>setPreviewDevice(event.target.value)}><option>Mobile</option><option>Desktop</option></select></header><div className="studio-phone"><div className="studio-phone-title"><i className={`activity-icon ${previewColor}`}><Icon name={previewIcon}/></i><span><strong>{current?.title}</strong><small>{current?.type}</small></span></div><h3>{current?.question}</h3><EditorParticipantPreview activity={current} options={options} settings={settings}/><p>{current?.type==='Hotspot Challenge'?'Tap one spot':current?.type==='Arrange the Steps'?'Reorder the steps':settings.allowMultiple?'Choose all that apply':'Share your response'}</p><button disabled>Preview only</button></div><footer><Icon name="help"/> Changes appear instantly in presenter and participant views.</footer></aside>
    </div>
  </main></div>;
}

function WorkshopManager({user,onLogout,onOpen,onJoin,editWorkshopId,onEditHandled,onNavigate}){
  const [workshops,setWorkshops]=useState([]),[quickTemplates,setQuickTemplates]=useState([]),[query,setQuery]=useState(''),[scope,setScope]=useState('all'),[selected,setSelected]=useState(null),[createOpen,setCreateOpen]=useState(false),[title,setTitle]=useState(''),[templateId,setTemplateId]=useState('blank'),[editing,setEditing]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=()=>Promise.all([api('/api/workshops',{auth:true}),api('/api/templates?category=all',{auth:true})]).then(([result,templateResult])=>{setWorkshops(result.workshops);setQuickTemplates(templateResult.templates.slice(0,3));setSelected(value=>value||result.workshops[0]?.id||null)}).catch(err=>setError(err.message));
  useEffect(()=>{load()},[]);
  useEffect(()=>{if(editWorkshopId){setEditing(editWorkshopId);onEditHandled?.()}},[editWorkshopId]);
  const filtered=workshops.filter(item=>item.title.toLowerCase().includes(query.toLowerCase())&&(scope==='all'||item.status===scope));
  const chosen=workshops.find(item=>item.id===selected);
  const totalParticipants=workshops.reduce((sum,item)=>sum+Number(item.participantCount||0),0),totalResponses=workshops.reduce((sum,item)=>sum+Number(item.responseCount||0),0),responseRate=totalParticipants?Math.min(100,Math.round(totalResponses/totalParticipants*100)):0;
  const create=async()=>{if(!title.trim())return;setBusy(true);setError('');try{const result=templateId==='blank'?await api('/api/workshops',{method:'POST',auth:true,body:{title,activities:[]}}):await api(`/api/templates/${templateId}/use`,{method:'POST',auth:true,body:{title}});await load();setSelected(result.workshop.id);setTitle('');setTemplateId('blank');setCreateOpen(false);setEditing(result.workshop.id)}catch(err){setError(err.message)}finally{setBusy(false)}};
  const useTemplate=template=>{setTemplateId(template.id);setTitle(template.title);setCreateOpen(true)};
  return <div className="manager-shell"><SideNav active="workshops" onOpenParticipant={onJoin} onNavigate={onNavigate}/><main className="manager-main">
    <header className="manager-top"><h1>Workshops</h1><div><label className="manager-search"><Icon name="search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search workshops"/></label><button className="manager-create" onClick={()=>setCreateOpen(true)}><Icon name="plus"/> New workshop</button><button className="avatar" onClick={onLogout}>{user?.name?.split(' ').map(value=>value[0]).join('').slice(0,2)||'YP'}</button></div></header>
    <div className={`manager-content ${createOpen?'drawer-open':''}`}><section className="manager-center">
      <div className="summary-strip"><div><Icon name="calendar"/><strong>{workshops.length}</strong><span>workshops</span></div><div><Icon name="play"/><strong>{workshops.filter(item=>item.status==='live').length}</strong><span>live sessions</span></div><div><Icon name="users"/><strong>{totalParticipants}</strong><span>participants</span></div><div><Icon name="chart"/><strong>{responseRate}%</strong><span>response rate</span></div></div>
      <section className="workshop-list-panel"><div className="workshop-list-title"><h2>Your workshops</h2><div>{[['all','All'],['live','Live'],['ready','Ready']].map(([value,label])=><button key={value} className={scope===value?'active':''} onClick={()=>setScope(value)}>{label}</button>)}</div></div><div className="workshop-columns"><span>Workshop title</span><span>Activities</span><span>Status</span><span>Participants</span><span>Last updated</span><span>Join code</span><span/></div>
        <div className="workshop-rows">{filtered.map((item,index)=><article key={item.id} className={`workshop-row ${selected===item.id?'selected':''}`} onClick={()=>setSelected(item.id)}><div className="workshop-row-main"><div className="workshop-name"><span className={`workshop-glyph ${['lime','blue','violet'][index%3]}`}><Icon name={index%3===0?'cloud':index%3===1?'clock':'users'}/></span><strong>{item.title}</strong></div><span>{item.activityCount}</span><span className={`status ${item.status}`}><i/>{item.status[0].toUpperCase()+item.status.slice(1)}</span><span>{item.participantCount}</span><span>{new Date(item.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span><b>{item.joinCode}</b><span/></div>{selected===item.id&&<div className="workshop-inline"><div><small>{item.status==='live'?'LIVE':'READY'}</small><p><strong>{item.status==='live'?'Session is live':'Workshop is ready'}</strong><span>Your audience can join using code {item.joinCode}</span></p></div><div><button className="dark" onClick={event=>{event.stopPropagation();onOpen(item.joinCode,item.id)}}><Icon name="play"/> Open presenter</button><button onClick={event=>{event.stopPropagation();setEditing(item.id)}}><Icon name="edit"/> Edit workshop</button><button onClick={event=>{event.stopPropagation();navigator.clipboard?.writeText(`${location.origin}/?join=${item.joinCode}`)}}><Icon name="copy"/> Copy join link</button></div></div>}</article>)}</div>
        {!filtered.length&&<div className="manager-empty">No workshops match your search.</div>}<button className="new-workshop-row" onClick={()=>setCreateOpen(true)}><Icon name="plus"/> New workshop</button>
      </section></section>
      <aside className="template-rail"><h2>Quick templates</h2>{quickTemplates.map((template,index)=><article key={template.id}><span className={`template-icon ${['lime','violet','blue'][index%3]}`}><Icon name={['cloud','check','book'][index%3]}/></span><div><strong>{template.title}</strong><small>{template.activityCount} activities · {template.estimatedMinutes} min</small></div><div className="template-types"><span><Icon name="chat" size={16}/></span><span><Icon name="chart" size={16}/></span><span><Icon name="cloud" size={16}/></span></div><button onClick={()=>useTemplate(template)}>Use template</button></article>)}<button className="browse-templates" onClick={()=>onNavigate('templates')}>Browse all templates <Icon name="arrow"/></button></aside>
      {createOpen&&<aside className="create-drawer"><header><h2>Create workshop</h2><button onClick={()=>setCreateOpen(false)}>×</button></header><label>Workshop title<input autoFocus value={title} onChange={event=>setTitle(event.target.value)} placeholder="Enter workshop title"/></label><p>Start from</p><button className={`source-choice ${templateId==='blank'?'active':''}`} onClick={()=>setTemplateId('blank')}><span><Icon name="plus"/></span><div><strong>Blank workshop</strong><small>Start with an empty workshop and add your own activities.</small></div><i/></button>{quickTemplates.slice(0,2).map((template,index)=><button key={template.id} className={`source-choice ${templateId===template.id?'active':''}`} onClick={()=>setTemplateId(template.id)}><span className={index?'violet':''}><Icon name={index?'check':'cloud'}/></span><div><strong>{template.title}</strong><small>{template.activityCount} ready-to-use activities.</small></div><i/></button>)}{error&&<p className="editor-error">{error}</p>}<div className="drawer-actions"><button className="manager-create" disabled={busy||!title.trim()} onClick={create}>{busy?'Creating…':'Create workshop'}</button><button onClick={()=>setCreateOpen(false)}>Cancel</button></div></aside>}
  </div></main>{editing&&<ActivityEditor workshopId={editing} onClose={()=>setEditing(null)} onChanged={load} user={user} onLogout={onLogout} onJoin={onJoin} onNavigate={onNavigate} onPresent={(code,id)=>onOpen(code,id)}/>}</div>;
}

const buildTrendSeries=(rows=[],days=30)=>{
  const bucketCount=6,end=new Date(),start=new Date(end);start.setDate(end.getDate()-Number(days)+1);
  const buckets=Array.from({length:bucketCount},(_,index)=>({value:0,date:new Date(start.getTime()+(end-start)*index/(bucketCount-1))}));
  for(const row of rows){const date=new Date(`${row.day}T12:00:00`),ratio=Math.max(0,Math.min(.999,(date-start)/Math.max(1,end-start))),index=Math.floor(ratio*bucketCount);buckets[index].value+=Number(row.count)||0}
  let cumulative=0;return buckets.map(bucket=>({...bucket,value:cumulative+=bucket.value,label:bucket.date.toLocaleDateString(undefined,{month:'short',day:'numeric'})}));
};

function TrendChart({rows,days,label}){
  const series=buildTrendSeries(rows,days),max=Math.max(10,...series.map(item=>item.value)),left=48,top=22,width=620,height=190;
  const points=series.map((item,index)=>({x:left+index*(width/(series.length-1)),y:top+height-(item.value/max)*height,...item}));
  const line=points.map((point,index)=>`${index?'L':'M'} ${point.x} ${point.y}`).join(' '),area=`${line} L ${points[points.length-1].x} ${top+height} L ${points[0].x} ${top+height} Z`;
  return <svg className="trend-chart" viewBox="0 0 700 260" role="img" aria-label={`${label} over time`}>
    <defs><linearGradient id="reportArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f76ef" stopOpacity=".18"/><stop offset="1" stopColor="#2f76ef" stopOpacity=".02"/></linearGradient></defs>
    {[0,.25,.5,.75,1].map((step,index)=><g key={step}><line x1={left} x2={left+width} y1={top+height-height*step} y2={top+height-height*step}/><text x="6" y={top+height-height*step+4}>{Math.round(max*step)}</text></g>)}
    <path className="chart-area" d={area}/><path className="chart-line" d={line}/>{points.map((point,index)=><g key={index}><circle cx={point.x} cy={point.y} r="5"/><text className="chart-date" x={point.x} y={top+height+28} textAnchor="middle">{point.label}</text></g>)}
  </svg>;
}

const compactNumber=value=>new Intl.NumberFormat('en',{notation:Number(value)>=1000?'compact':'standard',maximumFractionDigits:1}).format(Number(value)||0);
const homeStatus=value=>value==='live'?'Live':value==='paused'?'Paused':value==='ended'?'Completed':'Ready';

function HomeBars({trend}){
  const participants=new Map((trend?.participants||[]).map(item=>[item.day,Number(item.count)])),responses=new Map((trend?.responses||[]).map(item=>[item.day,Number(item.count)])),today=new Date(),visibleDays=Array.from({length:18},(_,index)=>{const date=new Date(today);date.setDate(today.getDate()-(17-index));return date.toLocaleDateString('en-CA')}),max=Math.max(1,...visibleDays.flatMap(day=>[participants.get(day)||0,responses.get(day)||0]));
  return <div className="home-chart" aria-label="Participation over the last 30 days"><div className="home-chart-legend"><span><i className="green"/>Participants</span><span><i className="blue"/>Responses</span></div><div className="home-chart-bars">{visibleDays.map((day,index)=><div key={day} className="home-bar-day" title={new Date(`${day}T00:00:00`).toLocaleDateString()}><i className="green" style={{height:`${Math.max(participants.get(day)?8:2,(participants.get(day)||0)/max*100)}%`}}/><i className="blue" style={{height:`${Math.max(responses.get(day)?8:2,(responses.get(day)||0)/max*100)}%`}}/><small>{index%5===0?new Date(`${day}T00:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'}):''}</small></div>)}</div></div>;
}

function HomeApp({user,onLogout,onJoin,onNavigate,onOpenWorkshop,onInvite}){
  const [dashboard,setDashboard]=useState(null),[error,setError]=useState(''),[copied,setCopied]=useState(false);
  useEffect(()=>{api('/api/dashboard',{auth:true}).then(result=>{setDashboard(result.dashboard);setError('')}).catch(err=>setError(err.message))},[]);
  const summary=dashboard?.summary||{workshops:0,participants:0,responses:0,engagement:0},next=dashboard?.nextWorkshop,recent=dashboard?.recent||[];
  const copyJoin=async()=>{if(!next)return;const link=`${location.origin}/?join=${next.joinCode}`;await navigator.clipboard?.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),1600)};
  const kpis=[['calendar','blue','Workshops',summary.workshops,'All workshop spaces'],['users','green','Participants',compactNumber(summary.participants),'Last 30 days'],['chart','violet','Responses',compactNumber(summary.responses),'Last 30 days'],['target','orange','Avg. engagement',`${summary.engagement}%`,'Across your audience']];
  return <div className="home-shell"><SideNav active="home" onOpenParticipant={onJoin} onNavigate={onNavigate}/><main className="home-main">
    <header className="home-top"><div><h1>Good morning, {user?.name?.split(' ')[0]||'Yogesh'}</h1><p>Here’s what’s happening across your workshops.</p></div><div><button className="home-secondary" onClick={onJoin}><Icon name="qr"/> Join preview</button><button className="home-primary" onClick={()=>onNavigate('workshops')}><Icon name="plus"/> Create workshop</button><button className="avatar" onClick={onLogout}>{initials(user?.name)||'YP'}</button></div></header>
    <section className="home-kpis">{kpis.map(([icon,color,label,value,context])=><article key={label}><i className={`home-kpi-icon ${color}`}><Icon name={icon}/></i><span>{label}</span><strong>{value}</strong><small>{context}</small></article>)}</section>
    <div className="home-middle"><section className="home-next"><h2>Next workshop</h2>{next?<><div className="home-next-title"><i><Icon name="heart" size={34}/></i><div><h3>{next.title}</h3><span className={`home-live ${next.status}`}><i/>{next.status==='live'?'LIVE NOW':homeStatus(next.status).toUpperCase()}</span></div></div><div className="home-next-stats"><span><small>Join code</small><b>{next.joinCode}</b></span><span><small>Participants</small><b><Icon name="users" size={16}/>{next.participantCount}</b></span><span><small>Answers</small><b><Icon name="chat" size={16}/>{next.answerCount}</b></span></div><div className="home-next-actions"><button className="primary" onClick={()=>onOpenWorkshop(next.joinCode,next.id)}>Open presenter <Icon name="external" size={16}/></button><button onClick={copyJoin}><Icon name="link" size={16}/>{copied?'Link copied':'Copy join link'}</button></div></>:<div className="home-empty">Create your first workshop to get started.</div>}</section>
      <section className="home-participation"><header><h2>Participation</h2><select aria-label="Participation range"><option>Last 30 days</option></select></header><div className="home-participation-body"><aside><span>Total participants<strong>{compactNumber(summary.participants)}</strong></span><span>Total responses<strong>{compactNumber(summary.responses)}</strong></span></aside><HomeBars trend={dashboard?.trend}/></div></section></div>
    <div className="home-bottom"><section className="home-recent"><h2>Recent workshops</h2><div className="home-table"><header><span>Workshop</span><span>Status</span><span>Participants</span><span>Responses</span><span>Last activity</span><span>Action</span></header>{recent.map((item,index)=>{const [icon,color]=[['heart','green'],['users','blue'],['spark','orange'],['book','violet']][index%4];return <article key={item.id}><span><i className={`home-row-icon ${color}`}><Icon name={icon}/></i><strong>{item.title}</strong></span><span><b className={`home-status ${item.status}`}>{homeStatus(item.status)}</b></span><span><Icon name="users" size={15}/>{item.participants}</span><span><Icon name="chat" size={15}/>{item.responses}</span><span>{new Date(item.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span><button onClick={()=>onOpenWorkshop(item.joinCode,item.id)}>Open <Icon name="external" size={14}/></button></article>})}{!recent.length&&<div className="home-empty">No workshops yet.</div>}</div></section>
      <aside className="home-quick"><section><h2>Quick actions</h2><button onClick={()=>onNavigate('templates')}><i className="blue"><Icon name="file"/></i><span>Browse templates</span><Icon name="arrow"/></button><button onClick={onInvite}><i className="green"><Icon name="users"/></i><span>Invite audience</span><Icon name="arrow"/></button><button onClick={()=>onNavigate('reports')}><i className="violet"><Icon name="chart"/></i><span>View reports</span><Icon name="arrow"/></button></section><section className="home-growth"><span>Audience growth</span><strong>{dashboard?.audienceGrowth||0}</strong><small>Active this month</small></section></aside></div>{error&&<p className="report-error">{error}</p>}
  </main></div>;
}

function ReportsApp({user,onLogout,onJoin,onNavigate,onOpenWorkshop}){
  const [report,setReport]=useState(null),[workshopId,setWorkshopId]=useState('all'),[days,setDays]=useState('30'),[metric,setMetric]=useState('participants'),[error,setError]=useState('');
  const load=()=>api(`/api/reports?workshopId=${encodeURIComponent(workshopId)}&days=${days}`,{auth:true}).then(result=>{setReport(result.report);setError('')}).catch(err=>setError(err.message));
  useEffect(()=>{load()},[workshopId,days]);
  const download=async()=>{try{const response=await fetch(`${API_BASE}/api/reports/export?workshopId=${encodeURIComponent(workshopId)}&days=${days}`,{headers:{authorization:`Bearer ${getAuthToken()}`}});if(!response.ok)throw new Error('Export failed');const blob=await response.blob(),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`cfl-live-report-${new Date().toISOString().slice(0,10)}.csv`;anchor.click();URL.revokeObjectURL(url)}catch(err){setError(err.message)}};
  const summary=report?.summary||{participants:0,responses:0,responseRate:0,avgActivities:0},mix=report?.activityMix||[],mixTotal=Math.max(1,mix.reduce((sum,item)=>sum+Number(item.count),0)),displayMix=mix.length>4?[...mix.slice(0,3),{type:'Other',count:mix.slice(3).reduce((sum,item)=>sum+Number(item.count),0)}]:mix,mixColors=['#5bc400','#2d76ef','#8051df','#12aab0'],footer=report?.selectedWorkshop||report?.workshops?.[0];
  const donutStops=displayMix.reduce((result,item,index)=>{const previous=result.total,amount=Number(item.count)/mixTotal*100;result.parts.push(`${mixColors[index]} ${previous}% ${previous+amount}%`);result.total+=amount;return result},{parts:[],total:0});
  const formatTime=value=>`${String(Math.floor((value||0)/60)).padStart(2,'0')}:${String((value||0)%60).padStart(2,'0')}`;
  return <div className="reports-shell"><SideNav active="reports" onOpenParticipant={onJoin} onNavigate={onNavigate}/><main className="reports-main">
    <header className="reports-top"><h1>Reports</h1><div><select aria-label="Workshop filter" value={workshopId} onChange={event=>setWorkshopId(event.target.value)}><option value="all">All workshops</option>{report?.workshops?.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select><select aria-label="Date range" value={days} onChange={event=>setDays(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><button className="export-button" onClick={download}><Icon name="download"/> Export CSV</button><button className="avatar" onClick={onLogout}>{user?.name?.split(' ').map(value=>value[0]).join('').slice(0,2)||'YP'}</button></div></header>
    <section className="report-kpis"><div><Icon name="users"/><strong>{summary.participants}</strong><span>Participants</span><small>Live database total</small></div><div><Icon name="chat"/><strong>{summary.responses}</strong><span>Responses</span><small>All submitted answers</small></div><div><Icon name="chart"/><strong>{summary.responseRate}%</strong><span>Response rate</span><small>Across available activities</small></div><div><Icon name="clock"/><strong>{summary.avgActivities}</strong><span>Avg. activities</span><small>Per workshop</small></div></section>
    <div className="report-grid"><section className="report-panel participation-panel"><header><h2>Participation over time</h2><div><button className={metric==='participants'?'active':''} onClick={()=>setMetric('participants')}>Participants</button><button className={metric==='responses'?'active':''} onClick={()=>setMetric('responses')}>Responses</button></div></header><TrendChart rows={report?.trend?.[metric]||[]} days={days} label={metric}/><footer><i/> {metric[0].toUpperCase()+metric.slice(1)}</footer></section>
      <section className="report-panel mix-panel"><h2>Activity mix</h2><div className="mix-content"><div className="donut" style={{background:`conic-gradient(${donutStops.parts.join(',')||'#e8edf0 0 100%'})`}}><span>{mix.reduce((sum,item)=>sum+Number(item.count),0)}<small>activities</small></span></div><div className="mix-legend">{displayMix.map((item,index)=><div key={item.type}><i style={{background:mixColors[index]}}/><span>{item.type}</span><strong>{Math.round(Number(item.count)/mixTotal*100)}%</strong></div>)}</div></div></section>
      <section className="report-panel performance-panel"><h2>Activity performance</h2><div className="performance-table"><div className="performance-head"><span>Activity</span><span>Type</span><span>Responses</span><span>Response rate</span><span>Avg. time</span><span>Status</span></div>{report?.performance?.slice(0,5).map(item=>{const [icon,color]=typeMeta(item.type);return <div className="performance-row" key={item.id}><span><i className={`activity-icon ${color}`}><Icon name={icon} size={16}/></i><strong>{item.title}</strong></span><span>{item.type}</span><b>{item.responses}</b><b>{item.responseRate}%</b><b>{formatTime(item.avgSeconds)}</b><span className={`performance-status ${item.status.toLowerCase().replace(' ','-')}`}><i/>{item.status}</span></div>})}{!report?.performance?.length&&<div className="report-empty">No activity data for this period.</div>}</div></section>
      <section className="report-panel responses-panel"><h2>Top responses</h2>{report?.topResponses?.length?<ol>{report.topResponses.map((item,index)=><li key={item.answer}><span>{index+1}</span><strong>{item.answer}</strong><b>{item.count}</b></li>)}</ol>:<div className="report-empty">No visible text responses yet.</div>}</section>
    </div>{footer&&<section className="report-footer"><div className="report-footer-icon"><Icon name="clock"/></div><strong>{footer.title}</strong><div><small>Join code</small><b>{footer.joinCode}</b></div><div><small>Last session</small><b>{new Date(footer.lastSession||footer.updatedAt).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})}</b></div><div><small>Participants</small><b>{footer.participants??footer.participantCount}</b></div><div><small>Response rate</small><b>{summary.responseRate}%</b></div><button onClick={()=>onOpenWorkshop(footer.joinCode,footer.id)}>View session details</button></section>}{error&&<p className="report-error">{error}</p>}
  </main></div>;
}

const initials=name=>String(name||'').split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();
const relativeDate=value=>{if(!value)return'Never';const days=Math.max(0,Math.round((Date.now()-new Date(value).getTime())/86400000));return days===0?'Today':days===1?'Yesterday':`${days} days ago`};

function AudienceApp({user,onLogout,onJoin,onNavigate,openInvite=false,onInviteHandled=()=>{}}){
  const [audience,setAudience]=useState(null),[query,setQuery]=useState(''),[status,setStatus]=useState('all'),[groupId,setGroupId]=useState('all'),[drawer,setDrawer]=useState(new URLSearchParams(location.search).get('drawer')==='1'||openInvite),[mode,setMode]=useState('invite'),[emails,setEmails]=useState(''),[inviteGroup,setInviteGroup]=useState(''),[names,setNames]=useState({}),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  useEffect(()=>{if(openInvite){setMode('invite');setDrawer(true);onInviteHandled()}},[openInvite]);
  const load=()=>api(`/api/audience?q=${encodeURIComponent(query)}&status=${status}&groupId=${groupId}`,{auth:true}).then(result=>{setAudience(result.audience);setError('')}).catch(err=>setError(err.message));
  useEffect(()=>{const timer=setTimeout(load,180);return()=>clearTimeout(timer)},[query,status,groupId]);
  const invite=async()=>{setBusy(true);setError('');try{const result=await api('/api/audience',{method:'POST',auth:true,body:{emails,names,groupId:inviteGroup||null}});setNotice(`${result.people.length} ${result.people.length===1?'person':'people'} added`);setEmails('');setNames({});setDrawer(false);await load()}catch(err){setError(err.message)}finally{setBusy(false)}};
  const importCsv=event=>{const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{const rows=String(reader.result||'').split(/\r?\n/).map(row=>row.split(',').map(cell=>cell.trim().replace(/^"|"$/g,''))).filter(row=>row.some(Boolean)),header=rows[0]?.map(cell=>cell.toLowerCase())||[],emailIndex=header.indexOf('email'),nameIndex=header.indexOf('name'),data=emailIndex>=0?rows.slice(1):rows;const imported=data.map(row=>({email:row[emailIndex>=0?emailIndex:0],name:nameIndex>=0?row[nameIndex]:''})).filter(item=>item.email);setEmails(imported.map(item=>item.email).join('\n'));setNames(Object.fromEntries(imported.filter(item=>item.name).map(item=>[item.email.toLowerCase(),item.name])));setMode('import');setDrawer(true);setNotice(`${imported.length} CSV rows ready to import`)};reader.readAsText(file);event.target.value=''};
  const newGroup=async()=>{const name=window.prompt('New group name');if(!name?.trim())return;try{await api('/api/audience/groups',{method:'POST',auth:true,body:{name}});setNotice(`Group “${name.trim()}” created`);await load()}catch(err){setError(err.message)}};
  const summary=audience?.summary||{totalPeople:0,groups:0,activePeople:0,averageEngagement:0},people=audience?.people||[],groups=audience?.groups||[];
  return <div className="audience-shell"><SideNav active="team" onOpenParticipant={onJoin} onNavigate={onNavigate}/><main className="audience-main">
    <header className="audience-top"><h1>Audience</h1><div><label className="audience-search"><Icon name="search"/><input aria-label="Search people or groups" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search people or groups"/></label><label className="import-button"><Icon name="download"/> Import CSV<input type="file" accept=".csv,text/csv" onChange={importCsv}/></label><button className="audience-add" onClick={()=>{setMode('invite');setDrawer(true)}}><Icon name="plus"/> Add people</button><button className="avatar" onClick={onLogout}>{initials(user?.name)||'YP'}</button></div></header>
    <section className="audience-kpis"><div><Icon name="users"/><strong>{summary.totalPeople}</strong><span>Total people</span></div><div><Icon name="users"/><strong>{summary.groups}</strong><span>Groups</span></div><div><Icon name="chart"/><strong>{summary.activePeople}</strong><span>Active this month</span></div><div><Icon name="chart"/><strong>{summary.averageEngagement}%</strong><span>Average engagement</span></div></section>
    <div className={`audience-content ${drawer?'drawer-open':''}`}><section className="people-panel"><header><h2>People</h2><div>{['all','active','inactive','invited'].map(value=><button key={value} className={status===value?'active':''} onClick={()=>setStatus(value)}>{value[0].toUpperCase()+value.slice(1)}</button>)}</div></header><div className="people-table"><div className="people-head"><span>Person</span><span>Group</span><span>Workshops</span><span>Responses</span><span>Engagement</span><span>Last active</span><span/></div>{people.map((person,index)=><article className="people-row" key={person.id}><span><i className={`person-avatar ${person.groupColor||['green','violet','blue','teal','orange'][index%5]}`}>{initials(person.name)}</i><span><strong>{person.name}</strong><small>{person.email}</small></span></span><button className="group-name" onClick={()=>person.groupId&&setGroupId(person.groupId)}>{person.groupName||'Unassigned'}</button><b>{person.workshopCount}</b><b>{person.responseCount}</b><span className="engagement"><i><b style={{width:`${person.engagement}%`}}/></i><strong>{person.engagement}%</strong></span><span className={`last-active ${person.status}`}>{relativeDate(person.lastActiveAt)}</span><span/></article>)}{!people.length&&<div className="audience-empty">No people match these filters.</div>}</div><footer><span>Showing {people.length} of {summary.totalPeople} people</span><small>Page 1</small></footer></section>
      <aside className="groups-panel"><header><h2>Groups</h2><button onClick={newGroup}><Icon name="plus" size={17}/> New group</button></header><button className={groupId==='all'?'selected':''} onClick={()=>setGroupId('all')}><i className="group-icon green"><Icon name="users"/></i><span><strong>All people</strong><small>{summary.totalPeople} people</small></span></button>{groups.map(group=><button key={group.id} className={groupId===group.id?'selected':''} onClick={()=>setGroupId(group.id)}><i className={`group-icon ${group.color}`}><Icon name="users"/></i><span><strong>{group.name}</strong><small>{group.peopleCount} people · {group.workshopCount} workshop visits</small></span></button>)}</aside>
      {drawer&&<aside className="audience-drawer"><header><h2>Add people</h2><button onClick={()=>setDrawer(false)}>×</button></header><nav><button className={mode==='invite'?'active':''} onClick={()=>setMode('invite')}>Invite</button><button className={mode==='import'?'active':''} onClick={()=>setMode('import')}>Import</button></nav><label>Email addresses<textarea autoFocus value={emails} onChange={event=>setEmails(event.target.value)} placeholder="Enter email addresses separated by commas or new lines"/><small>{emails.length} / 5000</small></label><label>Assign to a group<select value={inviteGroup} onChange={event=>setInviteGroup(event.target.value)}><option value="">No group</option>{groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>{mode==='import'&&<p className="import-note">CSV columns supported: <strong>name,email</strong>. Review the imported addresses above before adding them.</p>}<div className="audience-drawer-actions"><button onClick={()=>setDrawer(false)}>Cancel</button><button className="primary" disabled={busy||!emails.trim()} onClick={invite}>{busy?'Adding…':mode==='import'?'Import people':'Send invites'}</button></div></aside>}
    </div>{notice&&<button className="audience-notice" onClick={()=>setNotice('')}>{notice} <span>×</span></button>}{error&&<p className="report-error">{error}</p>}
  </main></div>;
}

const templateVisual=(template,index=0)=>{const map={Wellness:['heart','green'],'Team building':['users','blue'],Learning:['book','violet'],Events:['spark','orange'],'My templates':['target','teal']};return map[template.category]||[['target','teal'],['heart','green'],['users','blue']][index%3]};
const usageLabel=value=>Number(value)>=1000?`${(Number(value)/1000).toFixed(Number(value)%1000?1:0)}k`:String(value||0);

function TemplatesApp({user,onLogout,onJoin,onNavigate,onWorkshop}){
  const [items,setItems]=useState([]),[selectedId,setSelectedId]=useState(''),[detail,setDetail]=useState(null),[query,setQuery]=useState(''),[category,setCategory]=useState('all'),[sort,setSort]=useState('popular'),[drawer,setDrawer]=useState(new URLSearchParams(location.search).get('drawer')==='1'),[form,setForm]=useState({title:'',description:'',category:'Wellness',estimatedMinutes:10}),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=()=>api(`/api/templates?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`,{auth:true}).then(result=>{const next=[...result.templates].sort((a,b)=>sort==='name'?a.title.localeCompare(b.title):Number(b.usageCount)-Number(a.usageCount));setItems(next);setSelectedId(current=>next.some(item=>item.id===current)?current:next[0]?.id||'');setError('')}).catch(err=>setError(err.message));
  useEffect(()=>{const timer=setTimeout(load,160);return()=>clearTimeout(timer)},[query,category,sort]);
  useEffect(()=>{if(!selectedId){setDetail(null);return}api(`/api/templates/${selectedId}`,{auth:true}).then(result=>setDetail(result.template)).catch(err=>setError(err.message))},[selectedId]);
  const useSelected=async edit=>{if(!detail)return;setBusy(true);try{const result=await api(`/api/templates/${detail.id}/use`,{method:'POST',auth:true,body:{title:detail.title}});setNotice(`“${detail.title}” workshop created`);onWorkshop(result.workshop,edit)}catch(err){setError(err.message)}finally{setBusy(false)}};
  const create=async()=>{setBusy(true);try{const result=await api('/api/templates',{method:'POST',auth:true,body:{...form,activities:[{title:'Opening reflection',type:'Q&A',question:'What would make this workshop valuable?'},{title:'Group pulse',type:'Live Poll',question:'How is everyone feeling right now?'},{title:'Next step',type:'Q&A',question:'What will you do next?'}]}});setDrawer(false);setNotice(`Template “${result.template.title}” created`);setForm({title:'',description:'',category:'Wellness',estimatedMinutes:10});setCategory('My templates');await load()}catch(err){setError(err.message)}finally{setBusy(false)}};
  const importTemplate=event=>{const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{try{const payload=JSON.parse(String(reader.result||''));const result=await api('/api/templates',{method:'POST',auth:true,body:payload});setNotice(`Template “${result.template.title}” imported`);setCategory('My templates');await load()}catch(err){setError(err.message||'Invalid template JSON')}finally{event.target.value=''}};reader.readAsText(file)};
  const categories=[['all','All templates'],['Wellness','Wellness'],['Team building','Team building'],['Learning','Learning'],['Events','Events'],['My templates','My templates']];
  return <div className="templates-shell"><SideNav active="templates" onOpenParticipant={onJoin} onNavigate={onNavigate}/><main className="templates-main">
    <header className="templates-top"><h1>Templates</h1><div><label className="template-search"><Icon name="search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search templates"/></label><label className="template-import"><Icon name="download"/> Import template<input type="file" accept="application/json,.json" onChange={importTemplate}/></label><button className="template-create" onClick={()=>setDrawer(true)}><Icon name="plus"/> Create template</button><button className="avatar" onClick={onLogout}>{initials(user?.name)||'YP'}</button></div></header>
    <section className="template-filter"><nav>{categories.map(([value,label])=><button key={value} className={category===value?'active':''} onClick={()=>setCategory(value)}>{label}</button>)}</nav><select aria-label="Sort templates" value={sort} onChange={event=>setSort(event.target.value)}><option value="popular">Most popular</option><option value="name">Name A–Z</option></select></section>
    <div className="template-workspace"><section className="template-library"><header><h2>Template library</h2><span>{items.length} templates</span></header><div className="template-grid">{items.slice(0,6).map((template,index)=>{const [icon,color]=templateVisual(template,index);return <article key={template.id} className={selectedId===template.id?'selected':''} onClick={()=>setSelectedId(template.id)}><i className={`template-art ${color}`}><Icon name={icon} size={40}/></i><div><h3>{template.title}</h3><p>{template.description}</p></div><footer><span><Icon name="file" size={15}/>{template.activityCount} activities</span><span><Icon name="clock" size={15}/>{template.estimatedMinutes} min</span><span><Icon name="users" size={15}/>{usageLabel(template.usageCount)} uses</span></footer></article>})}</div>{!items.length&&<div className="template-empty">No templates match your search.</div>}</section>
      <aside className="template-detail">{detail?<><header><h2>{detail.title}</h2><span>{detail.category}</span><p>{detail.description}</p></header><div className="template-detail-meta"><span><Icon name="file" size={16}/>{detail.activities.length} activities</span><span><Icon name="clock" size={16}/>{detail.estimatedMinutes} min</span></div><h3>Activity preview</h3><ol>{detail.activities.map((activity,index)=>{const [icon,color]=typeMeta(activity.type);return <li key={activity.id}><b>{index+1}</b><i className={`activity-preview-icon ${color}`}><Icon name={icon} size={19}/></i><span><strong>{activity.title}</strong><small>{activity.type}</small></span></li>})}</ol><div className="template-detail-actions"><button className="primary" disabled={busy} onClick={()=>useSelected(false)}>{busy?'Creating…':'Use template'}</button><button disabled={busy} onClick={()=>useSelected(true)}>Edit a copy</button></div></>:<div className="template-detail-loading">Select a template to preview it.</div>}</aside>
      {drawer&&<aside className="template-drawer"><header><div><small>MY TEMPLATE</small><h2>Create template</h2></div><button onClick={()=>setDrawer(false)}>×</button></header><label>Template name<input autoFocus value={form.title} onChange={event=>setForm({...form,title:event.target.value})} placeholder="Example: Weekly reflection"/></label><label>Description<textarea value={form.description} onChange={event=>setForm({...form,description:event.target.value})} placeholder="What will this template help presenters do?"/></label><div className="template-drawer-row"><label>Category<select value={form.category} onChange={event=>setForm({...form,category:event.target.value})}>{['Wellness','Team building','Learning','Events'].map(value=><option key={value}>{value}</option>)}</select></label><label>Estimated minutes<input type="number" min="1" max="180" value={form.estimatedMinutes} onChange={event=>setForm({...form,estimatedMinutes:event.target.value})}/></label></div><section><h3>Starter activities</h3><p>Your template starts with reflection, live poll and next-step activities. You can edit all activities after creating a workshop.</p></section><div className="template-drawer-actions"><button onClick={()=>setDrawer(false)}>Cancel</button><button className="primary" disabled={busy||!form.title.trim()||!form.description.trim()} onClick={create}>{busy?'Creating…':'Create template'}</button></div></aside>}
    </div>{notice&&<button className="audience-notice" onClick={()=>setNotice('')}>{notice}<span>×</span></button>}{error&&<p className="report-error">{error}</p>}
  </main></div>;
}

function WorkspaceApp({user,onLogout,onJoin,onNavigate}){
  const [workspace,setWorkspace]=useState(null),[profile,setProfile]=useState({name:'',website:'',senderName:'',senderEmail:''}),[form,setForm]=useState({name:'',email:'',role:'presenter',password:''}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const load=()=>api('/api/organization',{auth:true}).then(result=>{setWorkspace(result.workspace);const organization=result.workspace.organization;setProfile({name:organization.name||'',website:organization.website||'',senderName:organization.senderName||organization.name||'',senderEmail:organization.senderEmail||''});setError('')}).catch(err=>setError(err.message));
  useEffect(()=>{load()},[]);
  const canManage=['owner','admin'].includes(workspace?.membership?.role);
  const saveProfile=async()=>{setBusy(true);try{const result=await api('/api/organization',{method:'PATCH',auth:true,body:profile});setWorkspace(result.workspace);setProfile({name:result.workspace.organization.name||'',website:result.workspace.organization.website||'',senderName:result.workspace.organization.senderName||'',senderEmail:result.workspace.organization.senderEmail||''});setNotice('Organization settings saved')}catch(err){setError(err.message)}finally{setBusy(false)}};
  const addMember=async event=>{event.preventDefault();setBusy(true);setError('');try{const result=await api('/api/organization/members',{method:'POST',auth:true,body:form});setWorkspace(result.workspace);setForm({name:'',email:'',role:'presenter',password:''});setNotice('Team member added securely')}catch(err){setError(err.message)}finally{setBusy(false)}};
  const changeMember=async(member,patch)=>{setBusy(true);setError('');try{const result=await api(`/api/organization/members/${member.id}`,{method:'PATCH',auth:true,body:patch});setWorkspace(result.workspace);setNotice(`${member.name} updated`)}catch(err){setError(err.message)}finally{setBusy(false)}};
  const generatePassword=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';const values=crypto.getRandomValues(new Uint8Array(16));setForm(current=>({...current,password:[...values].map(value=>chars[value%chars.length]).join('')}))};
  const organization=workspace?.organization||{},summary=workspace?.summary||{},members=workspace?.members||[],profileChanged=['name','website','senderName','senderEmail'].some(key=>(profile[key]||'')!==(organization[key]||''));
  return <div className="manager-shell workspace-shell"><SideNav active="workspace" onNavigate={onNavigate} onOpenParticipant={onJoin}/><main className="workspace-main">
    <header className="workspace-top"><div><span>ORGANIZATION SETTINGS</span><h1>{organization.name||'Workspace'}</h1><p>Manage access, roles and the identity your presenters work under.</p></div><div className="workspace-head-actions"><button onClick={onJoin}><Icon name="qr"/> Join preview</button><button className="primary" onClick={()=>onNavigate('workshops')}><Icon name="plus"/> Create workshop</button><button className="avatar" onClick={onLogout}>{initials(user?.name)||'YP'}</button></div></header>
    <section className="workspace-kpis"><article><i className="green"><Icon name="users"/></i><div><strong>{summary.members||0}</strong><span>Active members</span></div></article><article><i className="blue"><Icon name="calendar"/></i><div><strong>{summary.workshops||0}</strong><span>Workshops</span></div></article><article><i className="violet"><Icon name="users"/></i><div><strong>{summary.audience||0}</strong><span>Audience people</span></div></article><article><i className="orange"><Icon name="spark"/></i><div><strong>{organization.plan||'starter'}</strong><span>Current plan</span></div></article></section>
    <div className="workspace-grid"><section className="workspace-identity"><header><h2>Organization profile</h2><span>{organization.slug}</span></header><label>Organization name<input value={profile.name} onChange={event=>setProfile({...profile,name:event.target.value})} disabled={!canManage}/></label><label>Website<input value={profile.website} onChange={event=>setProfile({...profile,website:event.target.value})} disabled={!canManage} placeholder="https://coachforlife.com"/></label><label>Default sender name<input value={profile.senderName} onChange={event=>setProfile({...profile,senderName:event.target.value})} disabled={!canManage}/></label><label>Default sender email<input type="email" value={profile.senderEmail} onChange={event=>setProfile({...profile,senderEmail:event.target.value})} disabled={!canManage} placeholder="hello@coachforlife.com"/></label><label>Workspace URL<div className="workspace-url"><span>live.cfl.app/</span><input value={organization.slug||''} disabled/></div></label><button className="primary" disabled={!canManage||busy||!profileChanged} onClick={saveProfile}>{busy?'Saving…':'Save changes'}</button><p><Icon name="help" size={16}/> The URL slug stays locked to keep participant links stable.</p></section>
      <section className="workspace-members"><header><div><h2>Team members</h2><p>{members.length} people can access this workspace</p></div><span className={`workspace-role ${workspace?.membership?.role}`}>{workspace?.membership?.role}</span></header><div className="workspace-member-head"><span>Member</span><span>Role</span><span>Status</span></div>{members.map(member=><div className="workspace-member" key={member.id}><div><i>{initials(member.name)}</i><span><strong>{member.name}{member.id===user.id&&<small>You</small>}</strong><small>{member.email}</small></span></div><select aria-label={`Role for ${member.name}`} value={member.role} disabled={!canManage||busy||member.id===user.id} onChange={event=>changeMember(member,{role:event.target.value})}>{member.role==='owner'&&<option value="owner">Owner</option>}{workspace?.membership?.role==='owner'&&member.role!=='owner'&&<option value="owner">Owner</option>}<option value="admin">Admin</option><option value="presenter">Presenter</option></select><button className={`member-status ${member.status}`} disabled={!canManage||busy||member.id===user.id} onClick={()=>changeMember(member,{status:member.status==='active'?'disabled':'active'})}><i/>{member.status}</button></div>)}</section>
    </div>
    {canManage&&<form className="workspace-invite" onSubmit={addMember}><header><div><h2>Add a workspace member</h2><p>Create secure presenter or admin access. Share the temporary password privately.</p></div><Icon name="users"/></header><div><label>Full name<input required value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="Example: Priya Shah"/></label><label>Work email<input required type="email" value={form.email} onChange={event=>setForm({...form,email:event.target.value})} placeholder="priya@company.com"/></label><label>Role<select value={form.role} onChange={event=>setForm({...form,role:event.target.value})}><option value="presenter">Presenter</option><option value="admin">Admin</option></select></label><label>Temporary password<div className="workspace-password"><input required minLength="12" value={form.password} onChange={event=>setForm({...form,password:event.target.value})} placeholder="Minimum 12 characters"/><button type="button" onClick={generatePassword}>Generate</button></div></label></div><button className="primary" disabled={busy}>{busy?'Adding member…':'Add member'}</button></form>}
    {notice&&<button className="audience-notice" onClick={()=>setNotice('')}>{notice}<span>×</span></button>}{error&&<p className="report-error">{error}</p>}
  </main></div>;
}

function ParticipantActivityInput({activity,answer,setAnswer}){
  if(!activity)return null;
  const settings=activity.settings||{},options=defaultOptionsFor(activity);
  if(activity.type==='Conditional Poll'){const response=parseConditionalAnswer(answer),branchIndex=options.indexOf(response.choice),followUpQuestion=branchIndex>=0?String(settings.followUps?.[branchIndex]||'').trim():'',followUpType=settings.followUpTypes?.[branchIndex]==='number'?'number':'short';return <div className="participant-conditional"><div className="participant-options">{options.map(option=><label key={option} className={response.choice===option?'selected':''}><input type="radio" name="participant-option" checked={response.choice===option} onChange={()=>setAnswer(conditionalAnswer(option,''))}/>{option}</label>)}</div>{followUpQuestion&&<section><small>Follow-up for “{response.choice}” · {followUpType==='number'?'Number total':'Short answer'}</small><h2>{followUpQuestion}</h2>{followUpType==='number'?<input autoFocus aria-label="Your number" className="participant-number" type="number" inputMode="decimal" step="any" value={response.followUp} onChange={event=>setAnswer(conditionalAnswer(response.choice,event.target.value))} placeholder="Enter a number"/>:<><textarea autoFocus value={response.followUp} maxLength={120} onChange={event=>setAnswer(conditionalAnswer(response.choice,event.target.value))} placeholder="Type your follow-up answer…"/><div className="char-count">{response.followUp.length}/120</div></>}</section>}</div>}
  if(activity.type==='Image Choice Poll')return <div className="participant-image-options">{options.map((option,index)=>{const selected=answer===option,image=safeImage(settings.optionImages?.[index]);return <button type="button" key={option} className={selected?'selected':''} onClick={()=>setAnswer(option)}>{image?<img src={image} alt=""/>:<span className={`image-placeholder tone-${index%4}`}><Icon name="eye"/></span>}<strong>{option}</strong><i>{selected?'✓':''}</i></button>})}</div>;
  if(activity.type==='Opinion Scale'){const min=Number(settings.min??1),max=Math.max(min+1,Number(settings.max??10)),value=Number(answer||Math.round((min+max)/2));return <div className="participant-scale"><strong>{value}</strong><input aria-label="Opinion rating" type="range" min={min} max={max} value={value} onChange={event=>setAnswer(event.target.value)}/><div><span>{settings.leftLabel||'Not at all'}</span><span>{settings.rightLabel||'Absolutely'}</span></div></div>}
  if(activity.type==='Arrange the Steps'){const order=answer.split('\u001f').filter(Boolean);return <ol className="participant-arrange">{order.map((option,index)=><li key={`${option}-${index}`}><b>{index+1}</b><span>{option}</span><div><button type="button" aria-label={`Move ${option} up`} disabled={index===0} onClick={()=>setAnswer(moveItem(order,index,index-1).join('\u001f'))}>↑</button><button type="button" aria-label={`Move ${option} down`} disabled={index===order.length-1} onClick={()=>setAnswer(moveItem(order,index,index+1).join('\u001f'))}>↓</button></div></li>)}</ol>}
  if(activity.type==='Hotspot Challenge'){const [x,y]=answer.split(',').map(Number),image=safeImage(settings.imageUrl);return <button type="button" className="participant-hotspot" style={image?{backgroundImage:`url("${image.replaceAll('"','%22')}")`}:undefined} onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();setAnswer(`${Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100)).toFixed(1)},${Math.max(0,Math.min(100,(event.clientY-rect.top)/rect.height*100)).toFixed(1)}`)}}>{!image&&<span><Icon name="target" size={42}/>Ask the host to add a challenge image</span>}{Number.isFinite(x)&&Number.isFinite(y)&&<i style={{left:`${x}%`,top:`${y}%`}}/>}</button>}
  if(optionTypes.has(activity.type))return <div className="participant-options">{options.map(option=>{const selected=answer.split('\u001f').filter(Boolean).includes(option),multiple=settings.allowMultiple||activity.type==='Multiple Answers';return <label key={option} className={selected?'selected':''}><input type={multiple?'checkbox':'radio'} name="participant-option" checked={selected} onChange={()=>{if(!multiple){setAnswer(option);return}const values=answer.split('\u001f').filter(Boolean);setAnswer((selected?values.filter(value=>value!==option):[...values,option]).join('\u001f'))}}/>{option}</label>})}</div>;
  if(activity.type==='Number Count')return <div className="participant-number-wrap"><input aria-label="Your number" className="participant-number" type="number" inputMode="decimal" step="any" min={settings.min??0} max={settings.max??1000000} value={answer} onChange={event=>setAnswer(event.target.value)} placeholder="Enter a number"/><small>Your number will be added to the group total.</small></div>;
  const placeholder=activity.type==='Commitment Wall'?'Write the commitment you will keep…':activity.type==='Idea Board'?'Share one clear idea…':'Type your answer…';
  return <><textarea value={answer} maxLength={280} onChange={event=>setAnswer(event.target.value)} placeholder={placeholder}/><div className="char-count">{answer.length}/280</div></>;
}

const answerIsComplete=(activity,answer)=>{if(!String(answer||'').trim())return false;if(activity?.type==='Number Count'){const value=Number(answer),min=Number(activity.settings?.min??0),max=Number(activity.settings?.max??1000000);return Number.isFinite(value)&&value>=min&&value<=max}if(activity?.type!=='Conditional Poll')return true;const response=parseConditionalAnswer(answer),index=defaultOptionsFor(activity).indexOf(response.choice),followUp=String(activity.settings?.followUps?.[index]||'').trim(),followUpType=activity.settings?.followUpTypes?.[index]==='number'?'number':'short';return Boolean(response.choice)&&(!followUp||(Boolean(response.followUp.trim())&&(followUpType!=='number'||Number.isFinite(Number(response.followUp)))))};

function JoinApp({ onBack, initialCode='' }) {
  const normalizedInitial=String(initialCode||'').trim().toUpperCase().slice(0,6);
  const [step,setStep]=useState('code'), [name,setName]=useState(''), [code,setCode]=useState(normalizedInitial), [answer,setAnswer]=useState(''), [participant,setParticipant]=useState(null), [error,setError]=useState('');
  const {session}=useLiveSession(code,code.length===6);
  const currentActivity=session?.activities?.find(item=>item.id===session.currentActivityId);
  useEffect(()=>setAnswer(initialAnswerFor(currentActivity)),[session?.currentActivityId]);
  const submit=async()=>{
    setError('');
    try {
      if(step==='code' && code.trim()){await api(`/api/sessions/${code}`);setStep('name')}
      else if(step==='name' && name.trim()){const result=await api(`/api/sessions/${code}/join`,{method:'POST',body:{name}});setParticipant(result.participant);setStep('activity')}
    } catch(err){setError(err.message)}
  };
  const sendAnswer=async()=>{
    try{await api(`/api/sessions/${code}/responses`,{method:'POST',body:{participantId:participant.id,activityId:session?.currentActivityId,answer}});setStep('thanks')}
    catch(err){setError(err.message)}
  };
  return <div className="join-page"><header><Logo compact/><button onClick={onBack}>Presenter</button></header><main>
    {step!=='activity' ? <div className="join-card"><div className="join-orb"><Icon name={step==='code'?'qr':'users'} size={32}/></div><h1>{step==='code'?'Join a live workshop':`Welcome to ${session?.title||'the workshop'}`}</h1><p>{step==='code'?'Enter the six-character code shown by your presenter.':'How should we show your name?'}</p><label>{step==='code'?'Workshop code':'Your name'}</label><input autoFocus value={step==='code'?code:name} maxLength={step==='code'?6:32} onChange={e=>step==='code'?setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')):setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/><button className="primary-btn" disabled={step==='code'?code.length!==6:!name.trim()} onClick={submit}>Continue <Icon name="arrow"/></button>{error&&<p className="form-error">{error}</p>}<small>No download or account needed</small></div>:
    <div className="participant-card"><div className="participant-head"><span><i/>{session?.status==='live'?'Live':'Ready'}</span><b>{session?.title || 'Healthy Forever'}</b><small>Hi, {name}</small></div><p>{currentActivity?.type || 'Word Cloud'}</p><h1>{currentActivity?.question || 'What does healthy living mean to you?'}</h1><ParticipantActivityInput activity={currentActivity} answer={answer} setAnswer={setAnswer}/>{error&&<p className="form-error">{error}</p>}<button className="primary-btn" disabled={!answerIsComplete(currentActivity,answer)} onClick={sendAnswer}>Send answer <Icon name="arrow"/></button></div>}
    {step==='thanks'&&<div className="success-overlay"><div><span>✓</span><h2>Answer sent!</h2><p>Look at the projector to see your response appear.</p><button onClick={()=>{setAnswer(initialAnswerFor(currentActivity));setStep('activity')}}>Send another</button></div></div>}
  </main></div>;
}

function Projector({ onBack, joinCode='27RJ27' }) {
  const {session}=useLiveSession(joinCode);
  const currentActivity=session?.activities?.find(item=>item.id===session.currentActivityId);
  return <div className="projector"><header><Logo compact/><span><i/>{session?.participantCount ?? 0} connected</span><button onClick={onBack}>Exit projector</button></header><main><p>{currentActivity?.type || 'Activity'}</p><h1>{currentActivity?.question || 'Waiting for the presenter to select an activity'}</h1><ActivityResults activity={currentActivity} responses={session?.responses}/></main><footer><strong>{location.host}</strong><span>{session?.joinCode || joinCode}</span></footer></div>;
}

function LoginApp({onLogin,onJoin}){
  const [email,setEmail]=useState(import.meta.env.DEV?'admin@cfl.live':''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const submit=async event=>{event.preventDefault();setBusy(true);setError('');try{const result=await api('/api/auth/login',{method:'POST',body:{email,password}});setAuthToken(result.token);onLogin(result.user)}catch(err){setError(err.message)}finally{setBusy(false)}};
  return <div className="login-page"><header><Logo compact/><button onClick={onJoin}>Join workshop <Icon name="arrow" size={16}/></button></header><main><aside className="login-story"><span className="eyebrow"><i/> Live workshop intelligence</span><h2>Turn every room into an active conversation.</h2><p>Design activities, invite your audience and understand participation in real time—from one calm workspace.</p><div><article><Icon name="spark"/><strong>Real-time</strong><small>Results update instantly</small></article><article><Icon name="users"/><strong>Inclusive</strong><small>No app or account needed</small></article><article><Icon name="chart"/><strong>Measurable</strong><small>Actionable engagement data</small></article></div><footer><span className="story-avatars"><i>Y</i><i>P</i><i>+</i></span><p><strong>Built for facilitators</strong><small>Workshops that keep everyone involved</small></p></footer></aside><form className="login-card" onSubmit={submit}><div className="join-orb"><Icon name="users" size={28}/></div><span className="login-kicker">Presenter workspace</span><h1>Welcome back</h1><p>Sign in to manage your live workshops and participant responses.</p><label>Email</label><input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/><label>Password</label><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/>{error&&<p className="login-error">{error}</p>}<button className="primary-btn" disabled={busy}>{busy?'Signing in…':'Sign in securely'}<Icon name="arrow"/></button><small className="login-security"><Icon name="check" size={15}/> Secure, encrypted workspace access</small></form></main></div>
}

function App(){
  const allowedViews=['home','workshops','templates','reports','team','workspace','join','presenter','projector'];
  const readLocation=()=>{const params=new URLSearchParams(location.search),join=params.get('join'),requested=params.get('view');return{view:join?'join':allowedViews.includes(requested)?requested:'home',code:String(join||params.get('code')||'').toUpperCase().slice(0,6),workshop:params.get('workshop')||''}};
  const initial=readLocation();
  const [view,setView]=useState(initial.view),[user,setUser]=useState(undefined),[activeCode,setActiveCode]=useState(initial.code||'27RJ27'),[activeWorkshop,setActiveWorkshop]=useState(initial.workshop||'healthy-forever'),[editWorkshopId,setEditWorkshopId]=useState(null),[teamDrawer,setTeamDrawer]=useState(false);
  const go=(next,{code,workshop,replace=false}={})=>{if(!allowedViews.includes(next))return;if(code)setActiveCode(code);if(workshop)setActiveWorkshop(workshop);setView(next);const params=new URLSearchParams();if(next==='join'){const joinCode=code||'';if(joinCode)params.set('join',joinCode)}else if(next!=='home'){params.set('view',next);if(['presenter','projector'].includes(next)){params.set('code',code||activeCode);params.set('workshop',workshop||activeWorkshop)}}const url=`${location.pathname}${params.size?`?${params}`:''}`;history[replace?'replaceState':'pushState']({},'',url)};
  useEffect(()=>{if(!getAuthToken()){setUser(null);return}api('/api/auth/me',{auth:true}).then(result=>setUser(result.user)).catch(()=>{setAuthToken('');setUser(null)})},[]);
  useEffect(()=>{const restore=()=>{const state=readLocation();setView(state.view);if(state.code)setActiveCode(state.code);if(state.workshop)setActiveWorkshop(state.workshop)};addEventListener('popstate',restore);return()=>removeEventListener('popstate',restore)},[]);
  useEffect(()=>{window.scrollTo({top:0,behavior:'auto'})},[view,user?.id]);
  const logout=async()=>{try{await api('/api/auth/logout',{method:'POST',auth:true})}finally{setAuthToken('');setUser(null);go('home',{replace:true})}};
  if(view==='join')return <JoinApp initialCode={initial.view==='join'?initial.code:''} onBack={()=>go('home')}/>;
  if(user===undefined)return <div className="app-loading"><Logo compact/><span>Loading secure workspace…</span></div>;
  if(!user)return <LoginApp onLogin={setUser} onJoin={()=>go('join')}/>;
  if(view==='projector')return <Projector joinCode={activeCode} onBack={()=>go('presenter',{code:activeCode,workshop:activeWorkshop})}/>;
  const navigate=next=>['home','workshops','templates','reports','team','workspace'].includes(next)&&go(next);
  if(view==='presenter')return <PresenterApp user={user} joinCode={activeCode} onLogout={logout} onJoin={()=>go('join',{code:activeCode})} onProjector={()=>go('projector',{code:activeCode,workshop:activeWorkshop})} onBack={()=>go('workshops')} onNavigate={navigate} onEdit={()=>{setEditWorkshopId(activeWorkshop);go('workshops')}}/>;
  if(view==='reports')return <ReportsApp user={user} onLogout={logout} onJoin={()=>go('join')} onNavigate={navigate} onOpenWorkshop={(code,id)=>go('presenter',{code,workshop:id})}/>;
  if(view==='team')return <AudienceApp user={user} onLogout={logout} onJoin={()=>go('join')} onNavigate={navigate} openInvite={teamDrawer} onInviteHandled={()=>setTeamDrawer(false)}/>;
  if(view==='workspace')return <WorkspaceApp user={user} onLogout={logout} onJoin={()=>go('join')} onNavigate={navigate}/>;
  if(view==='templates')return <TemplatesApp user={user} onLogout={logout} onJoin={()=>go('join')} onNavigate={navigate} onWorkshop={(workshop,edit)=>{setActiveCode(workshop.joinCode);setActiveWorkshop(workshop.id);if(edit)setEditWorkshopId(workshop.id);go('workshops')}}/>;
  if(view==='home')return <HomeApp user={user} onLogout={logout} onJoin={()=>go('join')} onNavigate={navigate} onInvite={()=>{setTeamDrawer(true);go('team')}} onOpenWorkshop={(code,id)=>go('presenter',{code,workshop:id})}/>;
  return <WorkshopManager user={user} onLogout={logout} onJoin={()=>go('join')} onNavigate={navigate} editWorkshopId={editWorkshopId} onEditHandled={()=>setEditWorkshopId(null)} onOpen={(code,id)=>go('presenter',{code,workshop:id})}/>;
}

class ErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={failed:false}}
  static getDerivedStateFromError(){return{failed:true}}
  render(){return this.state.failed?<main className="fatal-error"><Logo compact/><h1>Something went wrong</h1><p>Your data is safe. Reload the workspace to continue.</p><button onClick={()=>location.reload()}>Reload workspace</button></main>:this.props.children}
}

createRoot(document.getElementById('root')).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
