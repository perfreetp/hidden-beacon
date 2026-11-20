import { spawn } from 'node:child_process';
import http from 'node:http';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9259;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function getJSON(p){return new Promise((res,rej)=>{http.get(`http://127.0.0.1:${PORT}${p}`,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,'--user-data-dir=C:/Users/Administrator/AppData/Local/Temp/chrome-f3','about:blank']);
try{
  let t;
  for(let i=0;i<30;i++){try{const l=await getJSON('/json');t=l.find(x=>x.type==='page');if(t)break;}catch{}await sleep(500);}
  const ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let id=0; const pend=new Map();
  const logs=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const{resolve,reject}=pend.get(m.id);pend.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')logs.push((m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text).split('\n').slice(0,5).join(' '));
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pend.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method,params}));});
  const ev=(expression)=>send('Runtime.evaluate',{returnByValue:true,expression});
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.navigate',{url:process.argv[2]});
  await sleep(2500);
  await ev("document.querySelector('.build-btn').click()");
  for(let i=0;i<60;i++){await sleep(500);const v=(await ev("document.querySelectorAll('.stat-value')[0].textContent")).result.value;if(v&&v!=='—'&&Number(v.replace(/,/g,''))>0)break;}
  await ev("document.querySelectorAll('.tab')[1].click()");
  for(let i=0;i<40;i++){await sleep(500);const s=(await ev("document.querySelector('.export-card .export-stats')?.textContent")).result.value;if(s&&s.includes('三角面'))break;}
  await ev("HTMLAnchorElement.prototype.click=function(){};URL.createObjectURL=()=>'blob:x';");
  const disabled=await ev("[...document.querySelectorAll('.export-btn')].map(b=>b.disabled)");
  console.log('buttons disabled before clicks:', JSON.stringify(disabled.result.value));
  for(let bi=0; bi<4; bi++){
    await ev(`document.querySelectorAll('.export-card .export-btn')[${bi}].click()`);
    await sleep(800);
  }
  const rows=await ev("[...document.querySelectorAll('.export-history tbody tr')].map(r=>r.textContent.replace(/\s+/g,' ').trim())");
  console.log('HISTORY ('+rows.result.value.length+' rows):');
  rows.result.value.forEach(r=>console.log('  '+r));
  console.log('EXCEPTIONS:', logs.join(' | ')||'(none)');
  ws.close();
}finally{chrome.kill();}
