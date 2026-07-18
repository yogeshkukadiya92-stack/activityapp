const base=String(process.env.DEPLOYMENT_URL||'').replace(/\/$/,'');
if(!/^https:\/\//.test(base))throw new Error('Set DEPLOYMENT_URL to the deployed HTTPS origin');

const check=async path=>{
  const response=await fetch(`${base}${path}`,{headers:{accept:'application/json'}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body.ok!==true)throw new Error(`${path} failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
};

const health=await check('/api/health');
const ready=await check('/api/ready');
if(ready.database?.driver!=='postgresql')throw new Error('Readiness is not using PostgreSQL');
if(ready.realtime?.driver!=='redis'||ready.realtime?.ok!==true)throw new Error('Readiness is not using healthy Redis');
console.log(`Deployment smoke test passed for ${base} (release ${health.release||'unknown'}).`);
