// 通用带超时的 flag 等待
export async function waitFlag(ev, expr, timeoutMs = 8000) {
  return ev(`new Promise((res,rej)=>{
    const t0=performance.now()
    const t=setInterval(()=>{
      if(eval(${JSON.stringify(expr)})){clearInterval(t);res(true)}
      else if(performance.now()-t0>${timeoutMs}){clearInterval(t);res('TIMEOUT')}
    },80)
  })`)
}
