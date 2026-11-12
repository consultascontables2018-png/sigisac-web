const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const e=[];
const login=async(p,u,pw)=>{await p.click('#lg-user');await p.fill('#lg-user',u);await p.click('#lg-pass');await p.fill('#lg-pass',pw);await p.click('#loginForm [type=submit]');await p.waitForTimeout(6000);await p.evaluate(()=>closeModal());};
// sitio central (segisacerp simulado)
const A=await (await b.newContext()).newPage();A.on('pageerror',x=>e.push('A:'+x.message));await A.goto('http://localhost:8810/');await A.waitForTimeout(3000);await login(A,'admin','sigisac2026');
await A.evaluate(async()=>{const x={user:'zz',nombre:'USUARIO OTRO SITIO',cargo:'Jefe de Patrimonio',clave:await claveHash('z1'),ws:wsDe('zz'),modulos:['Todos'],libre:true,plan:'gold'};USERS.push(x);mutate();await usrPush(x);});
// otro sitio sin funciones (sigisacerp simulado): usa la base central por CORS
const ctx=await b.newContext({viewport:{width:1500,height:900}});await ctx.addInitScript(()=>{window.SIGISAC_CENTRAL='http://localhost:8810';});
const O=await ctx.newPage();O.on('pageerror',x=>e.push('O:'+x.message));await O.goto('http://127.0.0.1:8811/');await O.waitForTimeout(4000);await login(O,'zz','z1');
await O.evaluate(()=>{Object.assign(S.cfg.entidad,{nombre:'ENTIDAD DESDE OTRO SITIO'});S.nuevo=false;mutate('x');});await O.waitForTimeout(4000);await O.evaluate(()=>go('autorizacion'));await O.waitForTimeout(2500);
console.log('otro sitio:',await O.evaluate(()=>JSON.stringify({ruta:NET.ruta.db,tok:!!NET.tok,est:WSYNC.estado,save:$('#saveState').textContent,sync:$('#usrSync')?.innerText.split('\n')[0]})));
const C=await (await b.newContext()).newPage();await C.goto('http://localhost:8810/');await C.waitForTimeout(3000);await login(C,'zz','z1');
console.log('sitio central ve lo del otro sitio:',await C.evaluate(()=>S.cfg.entidad.nombre));
console.log(e.join('|'));await b.close();})();
