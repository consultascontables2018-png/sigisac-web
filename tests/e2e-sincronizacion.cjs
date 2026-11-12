const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const errs=[];const B='http://localhost:8810';
const page=async(n)=>{const p=await (await b.newContext({viewport:{width:1400,height:860}})).newPage();p.on('pageerror',e=>errs.push(n+':'+e.message));p.on('console',m=>{if(m.type()==='warning'&&/ws/.test(m.text()))errs.push(n+':'+m.text())});await p.goto(B+'/');await p.waitForTimeout(3000);return p;};
const login=async(p,u,pw,w=2500)=>{await p.click('#lg-user');await p.fill('#lg-user',u);await p.click('#lg-pass');await p.fill('#lg-pass',pw);await p.click('#loginForm [type=submit]');await p.waitForTimeout(w);};
const st=p=>p.evaluate(()=>({ent:S.cfg.entidad.nombre,dir:S.cfg.entidad.direccion||'',base:S.base.length,inv:S.inv.length,ents:Object.keys(S.ents||{}).length,save:$('#saveState').textContent,bar:$('#wsBar').hidden?'':$('#wsBar').innerText,modal:$('#modal').hidden?'':$('#modal').innerText.split('\n')[0],estado:WSYNC.estado,tok:!!NET.tok}));
const t0=Date.now(),T=()=>((Date.now()-t0)/1000).toFixed(1)+'s';
// 1 admin creates users
const X=await page('X');await login(X,'admin','sigisac2026',4000);
await X.evaluate(async()=>{for(const [u,n,c] of [['victoria','VICTORIA ZÚÑIGA FLORENCIO','v1'],['otro','OTRO USUARIO','o1']]){const x={user:u,nombre:n,cargo:'Jefe de Patrimonio',clave:await claveHash(c),ws:wsDe(u),modulos:['Todos'],libre:true,plan:'gold',invEquipo:u==='victoria'};USERS.push(x);await usrPush(x);}mutate();});
console.log(T(),'X admin:',JSON.stringify(await st(X)));
// 2 A: victoria registers entity + 60,000 SIGA rows
const A=await page('A');await login(A,'victoria','v1',6000);console.log(T(),'A al ingresar:',JSON.stringify(await st(A)));
await A.evaluate(()=>{closeModal();Object.assign(S.cfg.entidad,{nombre:'MUNICIPALIDAD PROVINCIAL DE PRUEBA',ruc:'20123456789',ue:'300123'});S.nuevo=false;S.base=Array.from({length:60000},(_,i)=>{const r=Array(58).fill('');r[3]='74'+String(i).padStart(10,'0');r[10]='BIEN PATRIMONIAL NUMERO '+i;r[30]='MARCA'+(i%50);r[45]=100+i%900;r[50]='01';r[51]='1503.0302';r[54]='OFICINA '+(i%40);r[56]='RESPONSABLE '+(i%120);return r;});S.inv=S.base.slice(0,300).map(r=>({cod:r[3],den:r[10],valor:r[45],estado:'BUENO',verifT:new Date().toISOString()}));mutate('registro');});
for(let i=0;i<40;i++){await A.waitForTimeout(1000);const s=await st(A);if(s.save==='Guardado correctamente')break;}
console.log(T(),'A guardado:',JSON.stringify(await st(A)));
const man=await A.evaluate(()=>WT().man(WS_KEY));console.log('  manifiesto:',JSON.stringify({n:man.n,size:man.size,nb:man.nb,nom:man.nom,t:man.t}));
// 3 B: other browser same account
const Bp=await page('B');await login(Bp,'victoria','v1',1200);console.log(T(),'B durante carga:',JSON.stringify(await st(Bp)));
for(let i=0;i<30;i++){await Bp.waitForTimeout(1000);if((await st(Bp)).base)break;}console.log(T(),'B cargado:',JSON.stringify(await st(Bp)));
await Bp.screenshot({path:'val_B.png'});
// 4 B modifies -> A receives
await Bp.evaluate(()=>{S.cfg.entidad.direccion='JR. LIMA 123 - MODIFICADO EN B';S.inv[0].estado='MALO';mutate('cambio B');});
for(let i=0;i<25;i++){await A.waitForTimeout(1000);if((await st(A)).dir)break;}console.log(T(),'A recibe cambio de B:',JSON.stringify(await st(A)), await A.evaluate(()=>S.inv[0].estado));
// 5 A creates second entity -> B receives
await A.evaluate(()=>{entNew({nombre:'UGEL PRUEBA',ruc:'20999999999'});});await A.waitForTimeout(500);
for(let i=0;i<25;i++){await Bp.waitForTimeout(1000);if((await st(Bp)).ents>1)break;}console.log(T(),'B recibe 2da entidad:',JSON.stringify(await st(Bp)));
// 6 other account cannot access
const C=await page('C');await login(C,'otro','o1',5000);console.log(T(),'C otra cuenta:',JSON.stringify(await st(C)));
console.log('  C lee base de victoria:',await C.evaluate(async()=>{try{await netApi('GET',{op:'man',ws:'ws-victoria'});return 'PERMITIDO (mal)';}catch(e){return e.status+' '+e.message;}}));
console.log('  C escribe base de victoria:',await C.evaluate(async()=>{try{await netApi('POST',null,{op:'put',ws:'ws-victoria',ver:'zzzzzz1',i:0,d:'x'});return 'PERMITIDO (mal)';}catch(e){return e.status+' '+e.message;}}));
console.log('  C se sube privilegios:',await C.evaluate(async()=>{try{await USR.db.collection('usuarios').doc('otro').set({...usrPub(SESSION),modulos:['Todos'],cargo:'Administrador',plan:'gold'});const r=await fetch('/api/ws?op=yo',{headers:{Authorization:'Bearer '+NET.tok}}).then(r=>r.json());return 'cargo='+r.perfil.cargo+' admin='+r.perfil.admin;}catch(e){return e.message;}}));
console.log('  C cambia clave de victoria:',await C.evaluate(async()=>{try{await USR.db.collection('usuarios').doc('victoria').set({user:'victoria',clave:'x'});return 'PERMITIDO (mal)';}catch(e){return e.message;}}));
console.log('  sin sesión /api/db usuarios:',await C.evaluate(async()=>(await fetch('/api/db?c=usuarios')).status), ' claves expuestas a C:',await C.evaluate(async()=>{const j=await fetch('/api/db?c=usuarios',{headers:{Authorization:'Bearer '+NET.tok}}).then(r=>r.json());return Object.values(j.docs||{}).some(d=>d.clave);}));
// 7 relogin A after logout keeps data
await A.evaluate(()=>logout());await A.reload();await A.waitForTimeout(3000);await login(A,'victoria','v1',6000);console.log(T(),'A reingreso:',JSON.stringify(await st(A)));
console.log(errs.slice(0,12).join('\n'));await b.close();})();
