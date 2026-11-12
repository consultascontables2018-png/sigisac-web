const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const errs=[];const B='http://localhost:8810';
const page=async(n,vp)=>{const p=await (await b.newContext({viewport:vp||{width:1400,height:900}})).newPage();p.on('pageerror',e=>errs.push(n+':'+e.message));await p.goto(B+'/');await p.waitForTimeout(3000);return p;};
const login=async(p,u,pw,w=5000)=>{await p.click('#lg-user');await p.fill('#lg-user',u);await p.click('#lg-pass');await p.fill('#lg-pass',pw);await p.click('#loginForm [type=submit]');await p.waitForTimeout(w);await p.evaluate(()=>closeModal());};
const X=await page('X');await login(X,'admin','sigisac2026');
await X.evaluate(async()=>{for(const [u,eq] of [['jefe',false]]){const x={user:u,nombre:'JEFE DE PATRIMONIO',cargo:'Jefe de Control Patrimonial',clave:await claveHash('j12345'),ws:wsDe(u),modulos:['Inventario físico'],libre:true,plan:'gold',invEquipo:eq};USERS.push(x);mutate();await usrPush(x);}});
const J=await page('J',{width:1400,height:900});await login(J,'jefe','j12345',6000);
await J.evaluate(()=>{Object.assign(S.cfg.entidad,{nombre:'MUNICIPALIDAD DE PRUEBA EQUIPO',ruc:'20555555555'});S.nuevo=false;mutate();go('planificacion');});await J.waitForTimeout(1500);
console.log('sin permiso (pantalla):',await J.evaluate(()=>[...document.querySelectorAll('.card h3')].some(h=>/Accesos del equipo/.test(h.textContent))&&!!document.querySelector('#ia-user')?'FORMULARIO (mal)':'aviso de bloqueo'));
console.log('sin permiso (servidor):',await J.evaluate(async()=>{try{await USR.db.collection('usuarios').doc('pirata').set({user:'pirata',tipo:'inventario',padre:'jefe',clave:'x'});return 'PERMITIDO (mal)';}catch(e){return e.message;}}));
console.log('se autoriza solo:',await J.evaluate(async()=>{try{const me=USERS.find(x=>x.user==='jefe');await USR.db.collection('usuarios').doc('jefe').set({...usrPub(me),invEquipo:true});const r=await fetch(NET.ruta.ws+'?op=yo',{headers:{Authorization:'Bearer '+NET.tok}}).then(r=>r.json());return 'invEquipo='+!!r.perfil.invEquipo;}catch(e){return e.message;}}));
// administrador autoriza desde Autorización (formulario real)
await X.evaluate(()=>{go('autorizacion');});await X.waitForTimeout(1200);await X.evaluate(()=>{const u=USERS.find(x=>x.user==='jefe');VIEWS.autorizacion.edit=u.user;refresh();});await X.waitForTimeout(800);
const hay=await X.$('#u-inveq');console.log('casilla en Autorización:',!!hay);
if(hay){await X.evaluate(()=>{const u=USERS.find(x=>x.user==='jefe');});}
await X.evaluate(async()=>{const u=USERS.find(x=>x.user==='jefe');u.invEquipo=true;mutate();await usrPush(u);});await X.waitForTimeout(500);
await J.waitForTimeout(6000);await J.evaluate(()=>refresh());await J.waitForTimeout(800);
console.log('con permiso:',await J.evaluate(()=>!!document.querySelector('#ia-user')));
const intento=async(n,u,pw)=>{await J.fill('#ia-nom',n);await J.fill('#ia-user',u);await J.fill('#ia-pw',pw);await J.click('[data-a="invSave"]');await J.waitForTimeout(2500);return J.evaluate(()=>$('#ia-err')?.textContent||'');};
console.log('clave 7 dígitos:',await J.evaluate(()=>$('#ia-pw').maxLength), await intento('PEREZ LUIS','inv01','12a4'));
console.log('clave válida:',JSON.stringify(await intento('PEREZ LUIS','inv01','123456')));
await J.evaluate(()=>$('.card h3') && [...document.querySelectorAll('.card')].find(c=>/Accesos del equipo/.test(c.textContent))?.scrollIntoView());await J.waitForTimeout(400);
const card=await J.evaluateHandle(()=>[...document.querySelectorAll('section.card')].find(c=>/Accesos del equipo/.test(c.querySelector('h3')?.textContent||'')));await card.screenshot({path:'eq_card.png'});
console.log('tabla:',await J.evaluate(()=>[...document.querySelectorAll('section.card')].find(c=>/Accesos del equipo/.test(c.querySelector('h3')?.textContent||'')).querySelector('tbody').innerText.replace(/\s+/g,' ')));
// inventariador ingresa desde otro dispositivo (celular)
const I=await page('I',{width:390,height:800});await login(I,'inv01','123456',7000);
console.log('inventariador:',await I.evaluate(()=>JSON.stringify({ok:!!SESSION,user:SESSION?.user,inv:esInv(SESSION),ws:WS_KEY,ent:S.cfg.entidad.nombre,vista:CUR,menu:[...document.querySelectorAll('#nav a, #nav button')].map(x=>x.textContent.trim()).filter(Boolean).slice(0,6)})));
// bloquear
await J.click('[data-a="invBloq"][data-u="inv01"]');await J.waitForTimeout(2500);
const I2=await page('I2');await login(I2,'inv01','123456',6000);console.log('bloqueado:',await I2.evaluate(()=>SESSION?'INGRESÓ (mal)':$('#lg-err').textContent));
console.log(errs.join('\n'));await b.close();})();
