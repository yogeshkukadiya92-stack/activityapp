import { randomUUID } from 'node:crypto';

const redisUrl=process.env.REDIS_URL;
const instanceId=randomUUID();
const localBuckets=new Map();
let publisher=null,subscriber=null,localBroadcast=()=>{};

export async function initRealtime(handler){
  localBroadcast=handler;
  if(!redisUrl)return;
  const {createClient}=await import('redis');
  publisher=createClient({url:redisUrl});
  subscriber=publisher.duplicate();
  publisher.on('error',error=>console.error('Redis publisher error:',error.message));
  subscriber.on('error',error=>console.error('Redis subscriber error:',error.message));
  await Promise.all([publisher.connect(),subscriber.connect()]);
  await subscriber.subscribe('cfl-live:events',raw=>{
    try{const message=JSON.parse(raw);if(message.instanceId!==instanceId)localBroadcast(message.code,message.payload)}catch{}
  });
}

export async function broadcastCluster(code,payload){
  localBroadcast(code,payload);
  if(publisher)await publisher.publish('cfl-live:events',JSON.stringify({instanceId,code,payload}));
}

export async function allowDistributedRequest(key,limit,windowMs){
  if(publisher){
    const redisKey=`cfl-live:limit:${key}`;
    const count=await publisher.incr(redisKey);
    if(count===1)await publisher.pExpire(redisKey,windowMs);
    return count<=limit;
  }
  const now=Date.now(),current=localBuckets.get(key);
  if(!current||current.resetAt<=now){localBuckets.set(key,{count:1,resetAt:now+windowMs});return true}
  if(current.count>=limit)return false;
  current.count+=1;return true;
}

export async function acquireTickLease(){
  if(!publisher)return true;
  const result=await publisher.set('cfl-live:timer-lease',instanceId,{NX:true,PX:900});
  return result==='OK';
}

export async function realtimeHealth(){
  if(!publisher)return{driver:'local'};
  const pong=await publisher.ping();
  return{driver:'redis',ok:pong==='PONG'};
}

export async function closeRealtime(){
  await Promise.allSettled([subscriber?.quit(),publisher?.quit()].filter(Boolean));
}
