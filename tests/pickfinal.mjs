import { spawn } from 'node:child_process';
import http from 'node:http';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9271;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function getJSON(p){return new Promise((res,rej)=>{http.get(`http://127.0.0.1:${PORT}${p}`,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--window-size=1600,1000',`--remote-debugging-port=${PORT}`,'--user-data-dir=C:/Users/Administrator/AppData/Local/Temp/chrome-pf','about:blank']);
try{
  let t;
  for(let i=0;i<30;i++){try{const l=await getJSON('/json');t=l.find(x=>x.type==='page');if(t)break;}catch{}await sleep(500);}
  const ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let id=0; const pend=new Map();
  const logs=[];
  ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const{resolve,reject}=pend.get(m.id);pend.delete(m.id);if(m.error)reject(new Error(m.error.message));else resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')logs.push((m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text).split('\n').slice(0,4).join(' '));
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pend.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method,params}));});
  const ev=(expression)=>send('Runtime.evaluate',{returnByValue:true,expression});
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.navigate',{url:process.argv[2]});
  await sleep(2500);
  await ev("document.querySelector('.build-btn').click()");
  for(let i=0;i<60;i++){await sleep(500);const v=(await ev("document.querySelectorAll('.stat-value')[0].textContent")).result.value;if(v&&v!=='—'&&Number(v.replace(/,/g,''))>0)break;}
  await sleep(1500);
  // 找一个命中点:要求 NDC -> 像素 -> NDC 往返后仍命中,避免细杆边缘的量化抖动
  const hit = await ev(`(function(){
    const vp = window.__viewports[0];
    const c = document.querySelectorAll('canvas')[0].getBoundingClientRect();
    for (let x = -0.8; x <= 0.8; x += 0.02) {
      for (let y = -0.8; y <= 0.8; y += 0.02) {
        const nx = Number(x.toFixed(3)), ny = Number(y.toFixed(3));
        if (!vp.raycast(nx, ny).hit) continue;
        const cx = Math.round(c.left + (nx + 1) / 2 * c.width);
        const cy = Math.round(c.top + (1 - ny) / 2 * c.height);
        const back = vp.clientToNdc(cx, cy);
        if (vp.raycast(back[0], back[1]).hit) {
          return { member: vp.raycast(nx, ny).memberId, client: [cx, cy], ndc: back.map(Number) };
        }
      }
    }
    return null;
  })()`);
  console.log('hit:', JSON.stringify(hit.result.value));
  const [px, py] = hit.result.value.client;
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:px,y:py,button:'left',buttons:1,clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:px,y:py,button:'left',buttons:0,clickCount:1});
  await sleep(500);
  const editorOpen=(await ev("!!document.querySelector('.member-editor')")).result.value;
  const label=(await ev("document.querySelector('.member-editor h4')?.textContent ?? null")).result.value;
  console.log('editor open:', editorOpen, '| member:', label);
  if(editorOpen){
    const beforeMs=(await ev("document.querySelectorAll('.stat-value')[2].textContent")).result.value;
    const beforeTri=(await ev("document.querySelectorAll('.stat-value')[0].textContent")).result.value;
    await ev(`(function(){const inp=document.querySelector('.member-editor input[type=number]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,Number(inp.value)*1.3);inp.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.member-editor form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()`);
    for(let i=0;i<60;i++){await sleep(400);const tt=(await ev("document.querySelectorAll('.stat-value')[2].textContent")).result.value;if(tt!==beforeMs)break;}
    const afterMs=(await ev("document.querySelectorAll('.stat-value')[2].textContent")).result.value;
    const afterTri=(await ev("document.querySelectorAll('.stat-value')[0].textContent")).result.value;
    const banner=(await ev("document.querySelector('.overlay-banner.ok')?.textContent ?? null")).result.value;
    console.log('boolean ms:', beforeMs,'->',afterMs,'| triangles:',beforeTri,'->',afterTri);
    console.log('incremental banner:', banner);
  }
  console.log('EXCEPTIONS:', logs.join(' | ')||'(none)');
  ws.close();
}catch(e){console.log('ERR',e.message);}finally{chrome.kill();}
