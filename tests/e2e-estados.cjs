const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const B='http://localhost:8810';
const ctx=await b.newContext({viewport:{width:1400,height:860},deviceScaleFactor:1});const p=await ctx.newPage();
let modo='lento';await p.route('**/api/ws?op=man*',async r=>{if(modo==='lento'){await new Promise(x=>setTimeout(x,4000));return r.continue();}if(modo==='caido')return r.abort();return r.continue();});
await p.goto(B+'/');await p.waitForTimeout(3000);await p.click('#lg-user');await p.fill('#lg-user','victoria');await p.click('#lg-pass');await p.fill('#lg-pass','v1');await p.click('#loginForm [type=submit]');await p.waitForTimeout(1800);
console.log('cargando:',await p.evaluate(()=>[$('#wsBar').hidden?'(oculto)':$('#wsBar').innerText,$('#entLbl').textContent,$('#modal').hidden?'':'MODAL '+$('#modal').innerText.slice(0,40)]));await p.screenshot({path:'val_cargando.png'});
await p.waitForTimeout(5000);console.log('listo:',await p.evaluate(()=>[$('#wsBar').hidden?'(oculto)':$('#wsBar').innerText,$('#entLbl').textContent]));
modo='caido';await p.evaluate(()=>{wsStop();wsWatch();});await p.waitForTimeout(2000);console.log('caído:',await p.evaluate(()=>[$('#wsBar').hidden?'(oculto)':$('#wsBar').innerText,$('#entLbl').textContent,S.base.length]));await p.screenshot({path:'val_error.png'});
modo='ok';await p.click('[data-a="wsReintentar"]');await p.waitForTimeout(3000);console.log('reintento:',await p.evaluate(()=>[$('#wsBar').hidden?'(oculto)':$('#wsBar').innerText,WSYNC.estado]));
// vacío confirmado vs error para cuenta nueva
const p2=await (await b.newContext()).newPage();await p2.route('**/api/ws?op=man*',r=>r.abort());await p2.goto(B+'/');await p2.waitForTimeout(3000);await p2.click('#lg-user');await p2.fill('#lg-user','otro');await p2.click('#lg-pass');await p2.fill('#lg-pass','o1');await p2.click('#loginForm [type=submit]');await p2.waitForTimeout(4000);
console.log('cuenta sin datos con fallo de red:',await p2.evaluate(()=>[$('#wsBar').hidden?'(oculto)':$('#wsBar').innerText,$('#modal').hidden?'(sin aviso de vacío)':$('#modal').innerText.slice(0,40)]));
// expired session
await p.evaluate(()=>{NET.tok='x.y';wsStop();wsWatch();});await p.waitForTimeout(2500);console.log('sesión vencida:',await p.evaluate(()=>$('#wsBar').hidden?'(oculto)':$('#wsBar').innerText));
await b.close();})();
