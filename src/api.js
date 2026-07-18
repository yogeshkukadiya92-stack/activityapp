import { useCallback, useEffect, useRef, useState } from 'react';

const host=window.location.hostname||'localhost';
export const API_BASE=import.meta.env.VITE_API_BASE||((import.meta.env.DEV)?`${window.location.protocol}//${host}:8787`:window.location.origin);
const apiUrl=new URL(API_BASE);
export const WS_BASE=import.meta.env.VITE_WS_BASE||`${apiUrl.protocol==='https:'?'wss':'ws'}://${apiUrl.host}`;
const TOKEN_KEY='cfl-live-presenter-token';
export const getAuthToken=()=>localStorage.getItem(TOKEN_KEY)||'';
export const setAuthToken=token=>token?localStorage.setItem(TOKEN_KEY,token):localStorage.removeItem(TOKEN_KEY);

export async function api(path, options={}) {
  const {auth=false,...fetchOptions}=options;
  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers: {'content-type':'application/json',...(auth&&getAuthToken()?{authorization:`Bearer ${getAuthToken()}`}:{ }),...(options.headers||{})},
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export function useLiveSession(code='27RJ27') {
  const [session,setSession]=useState(null);
  const [connection,setConnection]=useState('connecting');
  const [error,setError]=useState('');
  const wsRef=useRef(null);

  useEffect(()=>{
    let active=true, reconnect;
    api(`/api/sessions/${code}`).then(data=>active&&setSession(data)).catch(err=>active&&setError(err.message));
    const connect=()=>{
      const socket=new WebSocket(`${WS_BASE}/ws?code=${encodeURIComponent(code)}`);
      wsRef.current=socket;
      socket.onopen=()=>active&&setConnection('connected');
      socket.onmessage=(event)=>{try{const message=JSON.parse(event.data);if(active&&message.state)setSession(message.state)}catch{}};
      socket.onerror=()=>active&&setConnection('offline');
      socket.onclose=()=>{if(active){setConnection('reconnecting');reconnect=setTimeout(connect,1200)}};
    };
    connect();
    return()=>{active=false;clearTimeout(reconnect);wsRef.current?.close()};
  },[code]);

  const control=useCallback(async patch=>{
    const next=await api(`/api/sessions/${code}/control`,{method:'POST',body:patch,auth:true});
    setSession(next); return next;
  },[code]);
  return {session,connection,error,control};
}
