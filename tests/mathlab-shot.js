#!/usr/bin/env node
/* Maths Lab — render the shipped bundle and photograph it.
   Fails on any page error, so a change that blanks the Lab fails the build.

   What it photographs is the Maths Lab at /study/lab (src/modules/mathslab/
   mlb-app.jsx) and its door in the Arcade. The old twenty-one-level ladder
   this file used to shoot was retired on 3 Nov 2026 (docs/MATH-LAB-PLAN.md);
   shooting it went on "passing" over components nothing could open any more.

   The figures are internally CONSISTENT on purpose — a picture that
   contradicts itself is what people quote back. The stages and which topics
   are open are READ FROM THE SOURCE (mathslab-map.php / mathslab.php), and
   the learner's progress is derived from them: the first twelve open topics
   mastered, the next three in progress, and the home's counts are those same
   numbers. */
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const {execFileSync}=require('child_process');
const {waitForServer}=require('./_serve');
const ROOT=path.resolve(__dirname,'..'),PORT=process.env.ML_PORT||8216;
const BASE='http://127.0.0.1:'+PORT,FIX=path.join(ROOT,'tests','_ml_fixture.html');
const OUT=path.join(ROOT,'tests','screens');
function loadChromium(){for(const m of [process.env.PLAYWRIGHT_MODULE,'playwright','playwright-core'].filter(Boolean)){try{return require(m).chromium;}catch(_){}}return null;}
(async()=>{
  const chromium=loadChromium();
  if(!chromium){console.log('⏭  maths lab shots: skipped (playwright not installed)');process.exit(0);}
  const exe=process.env.CHROMIUM_PATH||(fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')?'/opt/pw-browsers/chromium-1194/chrome-linux/chrome':undefined);
  fs.mkdirSync(OUT,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'dist','build-manifest.json'),'utf8'));
  /* The map, straight out of the domain code that serves it. */
  const SRC=JSON.parse(execFileSync('php',['-r',
    'function db_row(){return null;} require "api/_lib/domain/mathslab-map.php";require "api/_lib/domain/mathslab-gen.php";require "api/_lib/domain/mathslab-gen-upper.php";require "api/_lib/domain/mathslab-gen-deep.php";require "api/_lib/domain/mathslab-gen-gods.php";require "api/_lib/domain/mathslab-why.php";require "api/_lib/domain/mathslab.php";'
    +'$st=[];foreach(mlb_stages() as $n=>$s){$st[]=["n"=>$n,"title"=>$s["title"],"strand"=>$s["strand"],"available"=>mlb_stage_available($n),'
    +'"comps"=>array_map(fn($id)=>["id"=>$id,"title"=>mlb_comp($id)["title"],"available"=>mlb_available($id)],$s["comps"])];}'
    +'$cv=[];foreach(["MC-002","MC-074","MC-077","MC-103","MC-145","MC-152"] as $id){$v=mlb_comp_view(["comp"=>$id]);unset($v["ok"]);$cv[$id]=$v;}'
    +'$n=count(mlb_forms()["MC-002"]);$ord=mlb_public(mlb_item("MC-002",$n-1,11));'
    +'$fig=mlb_public(mlb_item("MC-074",0,5));'
    +'echo json_encode(["stages"=>$st,"total"=>count(mlb_competencies()),"comps"=>$cv,"order"=>$ord,"fig"=>$fig,"bands"=>mlb_map([])["bands"]],JSON_UNESCAPED_UNICODE);'
  ],{cwd:ROOT,encoding:'utf8'}));
  const open=[];SRC.stages.forEach(s=>s.comps.forEach(c=>{if(c.available)open.push(c.id);}));
  const MASTERED=open.slice(0,12),LEARNING=open.slice(12,15);
  const stateOf=c=>!c.available?'soon':MASTERED.indexOf(c.id)>=0?'mastered':LEARNING.indexOf(c.id)>=0?'practising':'open';
  const MAP={ok:true,member:true,bands:SRC.bands,stages:SRC.stages.map(s=>{const comps=s.comps.map(c=>({id:c.id,title:c.title,state:stateOf(c)}));
    const band=SRC.bands.find(b=>{const m=b.stages.match(/(\d+)(?:–(\d+))?/);return s.n>=+m[1]&&s.n<=+(m[2]||m[1]);});
    return {n:s.n,title:s.title,strand:s.strand,band:band&&band.name,bandId:band&&band.id,level:band&&band.level,available:s.available,comps:comps,boss:false,
      bossReady:s.available&&comps.every(c=>c.state==='mastered')};})};
  const firstLearning=SRC.stages.reduce((a,s)=>a.concat(s.comps),[]).find(c=>c.id===LEARNING[0]);
  // 640 XP sits in the Analyst band (500–1500); the climb is done, so next is the topic in progress.
  const HOME={ok:true,name:'Temiloluwa',xp:640,level:{n:2,name:'Analyst',next:1500,from:500},streak:6,freezes:1,
    climb:{stage:3,done:true,momentum:2},next:{mode:'practice',comp:LEARNING[0],label:'Keep going: '+firstLearning.title},
    counts:{mastered:MASTERED.length,learning:LEARNING.length,due:0,available:open.length,total:SRC.total},
    badges:[{id:'first-star',name:'First star',what:'Your first topic known or mastered',earned:true},
            {id:'ten-stars',name:'Ten stars',what:'10 topics known or mastered',earned:true},
            {id:'climber',name:'Climber',what:'Finished the climb to your level',earned:true},
            {id:'week',name:'Seven-day streak',what:'7 days in a row',earned:false}],
    courses:[{id:'C-ALG',title:'Algebra foundations',pct:35,enrolled:true,available:true}]};
  /* Progress, from the same learner: the first stage is fully mastered (its
     ten topics are the first ten open) and has its certificate; the mistakes
     are on the topics in progress, which is where mistakes would be. */
  // The foundation underneath the topics in progress (as mlb_root_gaps would name it).
  const ROOTS=[{comp:open[10],title:SRC.stages[1].comps[0].title,stage:2,behind:LEARNING.map(id=>SRC.stages.reduce((a,s)=>a.concat(s.comps),[]).find(c=>c.id===id).title)}];
  HOME.roots=ROOTS;
  HOME.focus={stage:2,title:SRC.stages[1].title,band:'Foundations',total:10,known:2};
  // One certificate, unseen on this device: Home's banner, the tab's dot, the Certificates page.
  HOME.certificates=[{no:'NGG-MLS-2026-00007',title:'Maths Lab · Stage 1: '+SRC.stages[0].title,at:'2026-11-02T10:00:00Z',url:'#cert',scope:'stage'}];
  const PROGRESS={ok:true,roots:ROOTS,bands:SRC.bands.map(b=>({name:b.name,level:b.level,total:b.topics,mastered:b.id==='foundations'?MASTERED.length:0})),xp:HOME.xp,level:HOME.level,streak:HOME.streak,due:0,badges:HOME.badges,
    recent:{answered:64,right:51,sureWrong:3},
    stages:MAP.stages.filter(s=>s.available).map(s=>({n:s.n,title:s.title,strand:s.strand,total:s.comps.length,
      mastered:s.comps.filter(c=>c.state==='mastered').length,started:s.comps.some(c=>c.state!=='open'),boss:s.n===1,
      certificate:s.n===1?{no:'NGG-MLS-2026-00007',url:'#'}:null})),
    certificates:[{no:'NGG-MLS-2026-00007',title:'Maths Lab · Stage 1: '+MAP.stages[0].title,at:'2026-11-02T10:00:00Z',url:'#'}],
    mistakes:LEARNING.map((id,k)=>{const c=SRC.stages.reduce((a,s)=>a.concat(s.comps),[]).find(x=>x.id===id);
      return {comp:id,title:c.title,wrong:[4,3,2][k],why:['Line them up by place value before you add.','Exchange a ten for ten ones when the top digit is smaller.','Check by adding the answer back.'][k],last:'2026-11-03T09:00:00Z'};})};
  fs.writeFileSync(FIX,`<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/vendor/phosphor/phosphor.css"><link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#fff;}</style>
</head><body class="cm-app"><div class="cm-slack-page"><div class="cm-slack"><main class="cm-col">
<div class="cm-stream is-feed"><div id="root"></div></div></main></div></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
 var Q=new URLSearchParams(location.search);
 var HOME=${JSON.stringify(HOME)}, MAP=${JSON.stringify(MAP)}, PROGRESS=${JSON.stringify(PROGRESS)}, COMPS=${JSON.stringify(SRC.comps)}, ORDER=${JSON.stringify(SRC.order)}, FIG=${JSON.stringify(SRC.fig)};
 window.NGGApi=window.NGGApi||{}; window.NGGApi.member=window.NGGApi.member||{};
 window.NGGApi.member.mathslab={ home:function(){return Promise.resolve(HOME);}, map:function(){return Promise.resolve(MAP);}, progress:function(){return Promise.resolve(PROGRESS);},
   comp:function(id){return Promise.resolve(Object.assign({ok:true},COMPS[id]));},
   start:function(){return Promise.resolve({ok:true,sessionId:'S1',mode:'practice',title:'Practice · Triangles and angle properties',items:[FIG,ORDER,FIG]});},
   answer:function(){return Promise.resolve({ok:true,correct:false,why:'',answer:'$72$°',steps:['The angles of a triangle add to $180^\\circ$.','$180 - 38 - 70 = 72$.']});} };
 window.NGGApi.public=window.NGGApi.public||{};
 window.NGGApi.public.mathslabComp=function(id){return Promise.resolve(Object.assign({ok:true},COMPS[id]));};
 window.NGGApi.public.mathslabMap=function(){return Promise.resolve(MAP);};
 window.NGGApi.public.mathslabItem=function(){return Promise.resolve({token:'t',item:Q.get('q')==='fig'?FIG:ORDER});};
 window.LAST_CHECK=null;
 window.NGGApi.public.mathslabCheck=function(t,a){window.LAST_CHECK=a;return Promise.resolve({correct:true,answer:'ok',steps:['ok']});};
 window.NGGApi.member.arcade={ home:function(){return Promise.resolve({
     games:[{key:'maths',name:'Number Rush',icon:'\\u26a1',blurb:'Twenty sums against the clock.',skill:'Mental arithmetic',kind:'type',questions:20,seconds:90,best:140,plays:3,tier:2,isDaily:true}],
     daily:'maths',dailyDone:false,streak:6,stars:9,programme:'ngg',totalPlays:14});},
   board:function(){return Promise.resolve({scope:'week',game:'maths',programme:'ngg',board:[],me:null});},
   start:function(){return Promise.resolve({});}, submit:function(){return Promise.resolve({});} };
 var WINRES={ok:true,mode:'boss',right:8,total:8,pct:100,xp:40,message:'The stage is yours.',changes:[],review:[],bestRun:8,
   certificates:[{scope:'stage',stage:1,title:'Stage 1: '+MAP.stages[0].title,stageTitle:MAP.stages[0].title,topics:10,next:{stage:2,title:MAP.stages[1].title},no:'NGG-MLS-2026-00012',url:'#'}]};
 var view=Q.get('view')||'home';
 var C = view==='win' ? React.createElement('div',{className:'mlb'},React.createElement(MlbResult,{res:WINRES,onDone:function(){},go:function(){},onAgain:null}))
       : view==='play' ? React.createElement('div',{className:'mlb'},React.createElement(MlbPlayer,{start:{mode:'practice',comp:'MC-074'},onDone:function(){},go:function(){}}))
       : view==='learn' ? React.createElement('div',{className:'mlb'},React.createElement(MlbLearn,{comp:Q.get('comp'),go:function(){},startPlay:function(){},lite:Q.get('lite')==='1'}))
       : view==='arcade' ? React.createElement(CmArcade,{auth:{member:{fullName:'Temiloluwa Adeyemi',centre:'Egbeda'}}})
       :                   React.createElement(MathsLab,{me:{phase:'ok',member:{fullName:'Temiloluwa Adeyemi'}}});
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('div',{className:'stt-app'},C));
</script></body></html>`);
  const srv=spawn('php',['-S','127.0.0.1:'+PORT,'-t',ROOT],{cwd:ROOT,stdio:'ignore'});
  const browser=await chromium.launch({executablePath:exe});
  let shots=0,problems=[];
  try{
    await waitForServer(BASE+'/tests/_ml_fixture.html');
    const shoot=async(name,query,viewport,wait,click)=>{
      const page=await browser.newPage({viewport,deviceScaleFactor:2});
      const errs=[]; page.on('pageerror',e=>errs.push(String(e&&e.message)));
      await page.goto(BASE+'/tests/_ml_fixture.html?'+query,{waitUntil:'networkidle'});
      if(click){ try{ await page.waitForSelector(click,{timeout:8000}); await page.click(click); }catch(_){ problems.push(name+': could not press '+click); } }
      if(wait){ try{ await page.waitForSelector(wait,{timeout:8000}); }catch(_){ problems.push(name+': never showed '+wait); } }
      await page.waitForTimeout(500);
      const text=await page.evaluate(()=>document.body.innerText.trim());
      if(!text) problems.push(name+': rendered nothing');
      if(errs.length) problems.push(name+': '+errs[0]);
      await page.screenshot({path:path.join(OUT,'mathlab-'+name+'.png'),fullPage:true});
      shots++;
      console.log('  📸 mathlab-'+name+'.png  ('+viewport.width+'×'+viewport.height+')'+(errs.length?'  ⚠ '+errs[0]:''));
      await page.close();
    };
    await shoot('arcade','view=arcade',{width:1080,height:900},'.ml-teaser-n');
    await shoot('home','',{width:1080,height:1000},'.mlb-hero',null);
    await shoot('map','',{width:1080,height:1000},'.mlb-path','.mlb-navb:nth-child(2)');
    await shoot('progress','',{width:1080,height:1000},'.mlb-miss','.mlb-navb:nth-child(5)');
    await shoot('home-phone','',{width:390,height:844},'.mlb-hero',null);
    await shoot('progress-phone','',{width:390,height:844},'.mlb-miss','.mlb-navb:nth-child(5)');
    await shoot('map-phone','',{width:390,height:844},'.mlb-path','.mlb-navb:nth-child(2)');
    await shoot('learn-pythagoras','view=learn&comp=MC-077',{width:1080,height:1000},'.mlb-explore',null);
    await shoot('learn-quadratic-phone','view=learn&comp=MC-103',{width:390,height:844},'.mlb-explore',null);
    await shoot('learn-unit-circle','view=learn&comp=MC-145',{width:1080,height:1000},'.mlb-explore',null);
    await shoot('learn-derivative','view=learn&comp=MC-152',{width:1080,height:1000},'.mlb-explore',null);
    await shoot('home-certificate','',{width:1080,height:1000},'.mlb-certban',null);
    await shoot('certificates','',{width:1080,height:900},'.mlb-certcard','.mlb-navb:nth-child(4)');
    await shoot('certificates-phone','',{width:390,height:844},'.mlb-certcard','.mlb-navb:nth-child(4)');
    /* After a stage, a child must FIND the certificate: a banner first on Home, a tab named Certificates with a "new" dot,
       and opening it there clears both. */
    { const page=await browser.newPage({viewport:{width:1080,height:900}}); await page.goto(BASE+'/tests/_ml_fixture.html',{waitUntil:'networkidle'});
      await page.evaluate(()=>{try{localStorage.removeItem('ngg.mlb.certsSeen');}catch(_){}}); await page.reload({waitUntil:'networkidle'});
      const ok1=await page.waitForSelector('.mlb-certban',{timeout:8000}).then(()=>true,()=>false);
      const dot=await page.locator('.mlb-navb:has-text("Certificates") .mlb-navdot').count();
      const ban=ok1?await page.innerText('.mlb-certban'):'';
      if(!ok1||!/New certificate/.test(ban)||!/Open my certificate/.test(ban)||dot!==1) problems.push('certificate findability: banner '+ok1+' dot '+dot+' '+ban.slice(0,80));
      await page.click('.mlb-navb:has-text("Certificates")'); await page.waitForSelector('.mlb-certcard',{timeout:8000});
      const card=await page.innerText('.mlb-certcard');
      if(!/New/.test(card)||!/NGG-MLS-2026-00007/.test(card)||!(await page.locator('.mlb-certcard a:has-text("Print")').count())) problems.push('certificates tab: '+card.slice(0,120));
      await page.evaluate(()=>{const a=document.querySelector('.mlb-certcard a.mlb-go');a.removeAttribute('target');a.addEventListener('click',e=>e.preventDefault());a.click();});
      await page.waitForTimeout(400);
      if(await page.locator('.mlb-navdot').count()) problems.push('certificates: opening it did not clear the new dot');
      await page.close(); console.log('  ✓ a certificate is easy to find: a banner on Home, a Certificates tab with a new dot, cleared once opened'); }
    await shoot('stage-win','view=win',{width:1080,height:900},'.mlb-win',null);
    await shoot('stage-win-phone','view=win',{width:390,height:844},'.mlb-win',null);
    /* A completed stage is celebrated over everything, as a dialog: the stage by name, the certificate, one way onward. */
    { const page=await browser.newPage({viewport:{width:1080,height:900}}); await page.goto(BASE+'/tests/_ml_fixture.html?view=win',{waitUntil:'networkidle'});
      const w=await page.waitForSelector('.mlb-win',{timeout:8000}).then(()=>page.evaluate(()=>({dlg:!!document.querySelector('.mlb-win-wrap[role=dialog][aria-modal=true]'),
        t:(document.querySelector('.mlb-win')||{}).innerText||'', focus:document.activeElement&&document.activeElement.className})),()=>null);
      if(!w||!w.dlg||!/Stage 1 complete/.test(w.t)||!/Certificate earned/.test(w.t)||!/On to Stage 2/.test(w.t)||!/mlb-win-go/.test(w.focus||'')) problems.push('stage win: '+JSON.stringify(w));
      await page.keyboard.press('Escape');
      if(await page.locator('.mlb-win').count()) problems.push('stage win: Escape did not close it');
      if(!(await page.locator('.mlb-result').count())) problems.push('stage win: the result was not underneath');
      await page.close(); console.log('  ✓ a completed stage is celebrated as a dialog: named, certificate, onward, Escape closes'); }
    await shoot('player','view=play',{width:1080,height:900},'.mlb-q',null);
    await shoot('player-phone','view=play',{width:390,height:844},'.mlb-q',null);
    /* Lite lessons are studied step by step before their questions appear; walk one through. */
    const walk=async page=>{ for(let k=0;k<12;k++){
        if(await page.locator('.mlb-order-list, .mlb-q svg.mlb-dia').count()) return true;
        if(await page.locator('.mlb-ex .mlb-sl-in').count()){ const sl=page.locator('.mlb-ex .mlb-sl-in').first(); await sl.focus(); await page.keyboard.press('ArrowRight'); }
        while(await page.locator('.mlb-why .mlb-actions .stt-btn').count()) await page.click('.mlb-why .mlb-actions .stt-btn');
        while(await page.locator('.mlb-lesson-body .mlb-card .stt-btn:has-text("Show the next line")').count()) await page.click('.mlb-lesson-body .mlb-card .stt-btn:has-text("Show the next line")');
        const go=page.locator('.mlb-lesson-foot .mlb-go'); if(await go.count()&&await go.isEnabled()) await go.click(); await page.waitForTimeout(150); } return false; };
    for(const [name,q,sel] of [['lite-order','view=learn&comp=MC-002&lite=1','.mlb-order-list'],['lite-figure','view=learn&comp=MC-074&lite=1&q=fig','.mlb-q svg.mlb-dia']]){
      const page=await browser.newPage({viewport:{width:1080,height:1000},deviceScaleFactor:2}); const errs=[]; page.on('pageerror',e=>errs.push(String(e&&e.message)));
      await page.goto(BASE+'/tests/_ml_fixture.html?'+q,{waitUntil:'networkidle'}); await page.waitForSelector('.mlb-stepbar',{timeout:15000});
      if(!(await walk(page))) problems.push(name+': never reached the practice questions by studying the steps');
      if(errs.length) problems.push(name+': '+errs[0]);
      await page.screenshot({path:path.join(OUT,'mathlab-'+name+'.png'),fullPage:true}); shots++; console.log('  📸 mathlab-'+name+'.png'); await page.close(); }
    /* The map opens ONE stage — the focus stage, the one holding the next lesson — and opening another closes it (owner). */
    { const page=await browser.newPage({viewport:{width:1080,height:1000}}); await page.goto(BASE+'/tests/_ml_fixture.html',{waitUntil:'networkidle'});
      await page.click('.mlb-navb:nth-child(2)'); await page.waitForSelector('.mlb-path',{timeout:15000});
      const st=await page.evaluate(()=>({paths:document.querySelectorAll('.mlb-path').length, open:Array.from(document.querySelectorAll('.mlb-unit.is-open .mlb-unit-t')).map(x=>x.textContent),
        focus:(document.querySelector('.mlb-unit.is-focus .mlb-unit-t')||{}).textContent, now:!!document.querySelector('.mlb-unit.is-open .mlb-node.is-now')}));
      if(st.paths!==1||st.open.length!==1||st.open[0]!==st.focus||!st.now) problems.push('map: only the focus stage should be open '+JSON.stringify(st));
      await page.click('.mlb-unit:not(.is-open) .mlb-unit-tog'); const after=await page.evaluate(()=>({paths:document.querySelectorAll('.mlb-path').length, open:document.querySelectorAll('.mlb-unit.is-open').length}));
      if(after.paths!==1||after.open!==1) problems.push('map: opening another stage must close the focus stage '+JSON.stringify(after));
      /* Map UI/UX (owner, 5 Nov 2026): every topic on the path is named, every band has a banner with
         its progress, and the jump bar opens a band's first unfinished stage — the summit in one press. */
      await page.click('.mlb-bandnav-b:first-child'); await page.waitForTimeout(300);
      const lab=await page.evaluate(()=>({labs:document.querySelectorAll('.mlb-path .mlb-node-lab').length, nodes:document.querySelectorAll('.mlb-path .mlb-node').length,
        banners:document.querySelectorAll('.mlb-bandh').length, summit:!!document.querySelector('.mlb-bandh.is-summit .ph-crown'), dots:document.querySelectorAll('.mlb-unit.is-closed .mlb-dots').length}));
      if(lab.labs!==lab.nodes||lab.labs<11||lab.banners!==6||!lab.summit||lab.dots<10) problems.push('map: labels, band banners or dots missing '+JSON.stringify(lab));
      /* "there's no logarithm": the map's search finds every log topic by name. */
      await page.fill('#mlb-mapq', 'log'); await page.waitForTimeout(200); await page.evaluate(()=>window.scrollTo(0,0));
      const hits=await page.evaluate(()=>Array.from(document.querySelectorAll('.mlb-hit-t b')).map(b=>b.textContent));
      if(!hits.some(t=>/Logarithms as inverse/.test(t))||!hits.some(t=>/Laws of logarithms/.test(t))||hits.length>4) problems.push('map: searching "log" should find the logarithm topics '+JSON.stringify(hits));
      await page.locator('.mlb-mapsearch').scrollIntoViewIfNeeded(); await page.locator('.mlb-hits').screenshot({path:path.join(OUT,'mathlab-map-search.png')}); shots++;
      await page.fill('#mlb-mapq', '');
      await page.click('.mlb-bandnav-b.is-summit'); await page.waitForTimeout(400);
      const sum=await page.evaluate(()=>(document.querySelector('.mlb-unit.is-open .mlb-unit-t')||{}).textContent);
      if(sum!=='The Theory of Numbers') problems.push('map: the summit jump should open Stage 18, opened '+sum);
      await page.screenshot({path:path.join(OUT,'mathlab-map-summit.png'),fullPage:false}); shots++;
      await page.close(); console.log('  ✓ the map opens only the focus stage; topics are named; bands jump'); }
    /* Behaviour, not only pixels: an explorer's readout follows its slider; "Why it works" walks
       one line at a time; the order exercise sends the order the learner made. */
    { const page=await browser.newPage({viewport:{width:1080,height:1000}}); const errs=[]; page.on('pageerror',e=>errs.push(String(e&&e.message)));
      await page.goto(BASE+'/tests/_ml_fixture.html?view=learn&comp=MC-077',{waitUntil:'networkidle'});
      await page.waitForSelector('.mlb-ex-out',{timeout:8000});
      const bar=await page.$$eval('.mlb-stepbar li .mlb-stepbar-l',ls=>ls.map(l=>l.innerText.trim()));
      /* No cutting corners: Continue waits for the step to be WORKED, steps ahead cannot be opened, and there is no skip. */
      const gate=await page.evaluate(()=>({cont:document.querySelector('.mlb-lesson-foot .mlb-go').disabled,
        ahead:Array.from(document.querySelectorAll('.mlb-stepbar button')).slice(1).every(b=>b.disabled), skip:/skip/i.test(document.querySelector('.mlb-learn').innerText)}));
      if(!gate.cont||!gate.ahead||gate.skip) problems.push('no cutting corners: '+JSON.stringify(gate));
      const before=await page.textContent('.mlb-ex-out'); const sl=page.locator('.mlb-sl-in').first(); await sl.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
      const after=await page.textContent('.mlb-ex-out'); const val=await sl.inputValue();
      if(before===after||!/16|5\^2|25/.test(before)) problems.push('pythagoras explorer: readout did not follow the slider (value '+val+'; '+after.slice(0,60)+')');
      if(bar.join('|')!=='Explore|Why it works|Worked example|Practise') problems.push('lesson steps: '+JSON.stringify(bar));
      if(await page.locator('.mlb-lesson-foot .mlb-go').isDisabled()) problems.push('explore: Continue stayed shut after the slider moved');
      await page.click('.mlb-lesson-foot .mlb-go'); await page.waitForSelector('.mlb-why',{timeout:4000});
      if(await page.locator('.mlb-explore').count()) problems.push('lesson steps: Explore still shown on the Why step');
      if(!(await page.locator('.mlb-lesson-foot .mlb-go').isDisabled())) problems.push('why: Continue open before the argument was read');
      const n0=await page.locator('.mlb-why-steps li').count(); await page.click('.mlb-why .stt-btn'); const n1=await page.locator('.mlb-why-steps li').count();
      await page.screenshot({path:path.join(OUT,'mathlab-learn-pythagoras-why.png'),fullPage:true}); shots++;
      if(!(n0===1&&n1===2)) problems.push('why it works: did not reveal one line at a time ('+n0+'→'+n1+')');
      if(errs.length) problems.push('learn interaction: '+errs[0]);
      await page.goto(BASE+'/tests/_ml_fixture.html?view=learn&comp=MC-002&lite=1',{waitUntil:'networkidle'});
      await page.waitForSelector('.mlb-stepbar',{timeout:8000}); await walk(page);
      await page.waitForSelector('.mlb-order-list',{timeout:8000});
      await page.click('.mlb-order-row:nth-child(2) [aria-label^="Move line 2 up"]');
      const first=await page.textContent('.mlb-order-row:first-child .mlb-order-t');
      await page.click('.mlb-q .mlb-go');
      const sent=await page.evaluate(()=>window.LAST_CHECK);
      if(!Array.isArray(sent)||sent.length!==4||sent[0]!==1||sent[1]!==0) problems.push('order exercise: sent '+JSON.stringify(sent)+' (first line now: '+first+')');
      if(!/1 \+ 1|set|Join|Counting|So/.test(first)) problems.push('order exercise: unexpected first line '+first);
      await page.close(); console.log('  ✓ explorer readout, proof walk-through and argument ordering behave'); }
  } finally { await browser.close(); srv.kill(); try{fs.unlinkSync(FIX);}catch(_){} }
  if(problems.length){problems.forEach(p=>console.log('  ✗ '+p));console.log('\n❌ MATHS LAB SHOTS: '+problems.length+' problem(s)');process.exit(1);}
  console.log('\n✅ MATHS LAB SHOTS: '+shots+' screens rendered clean into tests/screens/');
})();
