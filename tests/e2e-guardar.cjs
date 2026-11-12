const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const errs=[];
const p=await (await b.newContext({viewport:{width:1400,height:860}})).newPage();p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8810/');await p.waitForTimeout(3000);await p.click('#lg-user');await p.fill('#lg-user','victoria');await p.click('#lg-pass');await p.fill('#lg-pass','v1');await p.click('#loginForm [type=submit]');await p.waitForTimeout(5000);
await p.evaluate(()=>{closeModal();entSwitch('E1',true);go('campo');});await p.waitForTimeout(1500);await p.click('.inv-sv');await p.waitForTimeout(4000);
console.log('guardar inventario:',await p.evaluate(()=>$('#modal').innerText.replace(/\n+/g,' | ')));await p.screenshot({path:'val_guardar.png'});
await p.evaluate(()=>{closeModal();go('data');});await p.waitForTimeout(800);await p.click('[data-a="wsRecup"]');await p.waitForTimeout(2500);console.log('recuperar:',await p.evaluate(()=>$('#modal').innerText.slice(0,500).replace(/\n+/g,' | ')));
// file:// mode
const f=await (await b.newContext()).newPage();f.on('pageerror',e=>errs.push('file:'+e.message));await f.goto('file://'+process.cwd()+'/public/index.html');await f.waitForTimeout(3500);await f.click('#lg-user');await f.fill('#lg-user','admin');await f.click('#lg-pass');await f.fill('#lg-pass','sigisac2026');await f.click('#loginForm [type=submit]');await f.waitForTimeout(3000);
console.log('modo archivo:',await f.evaluate(()=>JSON.stringify({ent:S.cfg.entidad.nombre,save:$('#saveState').textContent,bar:$('#wsBar').hidden,est:WSYNC.estado})));
console.log('errores:',errs.join('\n'));await b.close();})();
