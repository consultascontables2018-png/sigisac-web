const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const errs=[];const B='http://localhost:8810';
const page=async(ctx,n)=>{const p=await ctx.newPage();p.on('pageerror',e=>errs.push(n+':'+e.message));await p.goto(B+'/');await p.waitForTimeout(3000);return p;};
const login=async(p,u,pw,w=5000)=>{await p.click('#lg-user');await p.fill('#lg-user',u);await p.click('#lg-pass');await p.fill('#lg-pass',pw);await p.click('#loginForm [type=submit]');await p.waitForTimeout(w);};
const st=p=>p.evaluate(()=>JSON.stringify({ent:S.cfg.entidad.nombre,ents:Object.keys(S.ents).length,periodos:(S.cfg.periodos||[]).map(x=>x.anio+':'+x.estado).join(','),inv:S.inv.length,verif:S.inv.filter(b=>b.verifT).length,est:WSYNC.estado,save:$('#saveState').textContent,tok:!!NET.tok}));
const X=await page(await b.newContext(),'X');await login(X,'admin','sigisac2026',4000);
console.log('X:',await X.evaluate(()=>JSON.stringify({tok:!!NET.tok,u:SESSION?.user,err:$('#lg-err').textContent})));await X.evaluate(async()=>{const x={user:'mig',nombre:'USUARIO MIGRACION',cargo:'Jefe de Patrimonio',clave:await claveHash('m1'),ws:wsDe('mig'),modulos:['Todos'],libre:true,plan:'gold'};USERS.push(x);mutate();await usrPush(x);});
// L: equipo con datos guardados SOLO en el navegador (base central inaccesible mientras trabajaba)
const cL=await b.newContext();let L=await page(cL,'L');await login(L,'mig','m1');await L.evaluate(()=>logout());
await L.route('**/api/ws**',r=>r.abort());await L.reload();await L.waitForTimeout(3000);await login(L,'mig','m1');
await L.evaluate(()=>{closeModal();Object.assign(S.cfg.entidad,{nombre:'MUNICIPALIDAD LOCAL SIN NUBE',ruc:'20111111111'});S.nuevo=false;S.cfg.periodos=[{anio:2025,corte:'2025-12-31',estado:'CERRADO'},{anio:2026,corte:'2026-12-31',estado:'APERTURADO'}];S.inv=Array.from({length:150},(_,i)=>({cod:'74'+String(i).padStart(10,'0'),den:'BIEN '+i,estado:'BUENO',valor:100,verifT:i<40?new Date().toISOString():undefined}));mutate('datos locales');});
await L.waitForTimeout(2500);console.log('L solo navegador:',await st(L));await L.close();
// L vuelve con conexión: migración segura a la base central
L=await page(cL,'L2');await login(L,'mig','m1',8000);console.log('L con base central:',await st(L));
// M: otro dispositivo
const M=await page(await b.newContext(),'M');await login(M,'mig','m1',6000);console.log('M recupera:',await st(M));
// M verifica bienes en Campo -> L lo recibe
await M.evaluate(()=>{for(let i=40;i<60;i++){S.inv[i].verifT=new Date().toISOString();S.inv[i].estado='REGULAR';}mutate('campo M');});
for(let i=0;i<20;i++){await L.waitForTimeout(1000);if(JSON.parse(await st(L)).verif>=60)break;}console.log('L recibe avance de M:',await st(L));
// L apertura nuevo periodo -> M lo recibe
await L.evaluate(()=>{S.cfg.periodos.push({anio:2027,corte:'2027-12-31',estado:'APERTURADO'});mutate('apertura 2027');});
for(let i=0;i<20;i++){await M.waitForTimeout(1000);if(JSON.parse(await st(M)).periodos.includes('2027'))break;}console.log('M recibe apertura de L:',await st(M));
// sin duplicados en historial
console.log('versiones en la nube:',await M.evaluate(async()=>(await WT().hist(WS_KEY)).length),' bienes únicos M:',await M.evaluate(()=>new Set(S.inv.map(b=>b.cod)).size+'/'+S.inv.length));
console.log(errs.join('\n'));await b.close();})();
