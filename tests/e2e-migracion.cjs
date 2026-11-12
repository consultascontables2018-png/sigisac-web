const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await (await b.newContext()).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8810/');await p.waitForTimeout(3000);await p.fill('#lg-user','legado');await p.fill('#lg-pass','l1');await p.click('#loginForm [type=submit]');await p.waitForTimeout(6000);
console.log(await p.evaluate(()=>JSON.stringify({ent:S.cfg.entidad.nombre,inv:S.inv.length,base:S.base.length,est:WSYNC.estado,modal:$('#modal').hidden?'':$('#modal').innerText.slice(0,50)})));
console.log('legado público:',await p.evaluate(async()=>(await fetch('/api/db?c=wsman',{headers:{Authorization:'Bearer '+NET.tok}})).status));
console.log(errs.join('\n'));await b.close();})();
