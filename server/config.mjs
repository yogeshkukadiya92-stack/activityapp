const production=process.env.NODE_ENV==='production';

const validUrl=(value,protocols)=>{
  try{return protocols.includes(new URL(value).protocol)}catch{return false}
};

export function productionConfigErrors(env=process.env){
  if(env.NODE_ENV!=='production')return[];
  const errors=[];
  const origins=String(env.PUBLIC_ORIGIN||'').split(',').map(value=>value.trim()).filter(Boolean);
  if(!origins.length||origins.some(origin=>!validUrl(origin,['https:'])))errors.push('PUBLIC_ORIGIN must contain one or more HTTPS origins');
  if(!validUrl(env.DATABASE_URL,['postgres:','postgresql:']))errors.push('DATABASE_URL must be a PostgreSQL connection URL');
  if(!validUrl(env.REDIS_URL,['redis:','rediss:']))errors.push('REDIS_URL must be a Redis connection URL');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(env.ADMIN_EMAIL||'')))errors.push('ADMIN_EMAIL must be a valid email address');
  const password=String(env.ADMIN_PASSWORD||'');
  if(password.length<16||/replace|password|cflive@2026/i.test(password))errors.push('ADMIN_PASSWORD must be at least 16 characters and must not use a documented placeholder');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(env.ORGANIZATION_SLUG||'')))errors.push('ORGANIZATION_SLUG must use lowercase letters, numbers and single hyphens');
  if(!['true','false'].includes(String(env.TRUST_PROXY||'')))errors.push('TRUST_PROXY must be explicitly set to true or false');
  const port=Number(env.PORT||8787);
  if(!Number.isInteger(port)||port<1||port>65535)errors.push('PORT must be a valid TCP port');
  return errors;
}

export function assertProductionConfig(env=process.env){
  const errors=productionConfigErrors(env);
  if(errors.length)throw new Error(`Invalid production configuration:\n- ${errors.join('\n- ')}`);
}

export const runtimeInfo={
  environment:production?'production':'development',
  release:String(process.env.SOURCE_COMMIT||process.env.BUILD_SHA||'local').slice(0,64),
};
