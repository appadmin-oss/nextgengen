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
    'function db_row(){return null;} require "api/_lib/domain/mathslab-map.php";require "api/_lib/domain/mathslab-gen.php";require "api/_lib/domain/mathslab-gen-upper.php";require "api/_lib/domain/mathslab-why.php";require "api/_lib/domain/mathslab.php";'
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
 var view=Q.get('view')||'home';
 var C = view==='play' ? React.createElement('div',{className:'mlb'},React.createElement(MlbPlayer,{start:{mode:'practice',comp:'MC-074'},onDone:function(){},go:function(){}}))
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
    await shoot('progress','',{width:1080,height:1000},'.mlb-miss','.mlb-navb:nth-child(4)');
    await shoot('home-phone','',{width:390,height:844},'.mlb-hero',null);
    await shoot('progress-phone','',{width:390,height:844},'.mlb-miss','.mlb-navb:nth-child(4)');
    await shoot('map-phone','',{width:390,height:844},'.mlb-path','.mlb-navb:nth-child(2)');
    await shoot('learn-pythagoras','view=learn&comp=MC-077',{width:1080,height:1000},'.mlb-explore',null);
    await shoot('learn-pythagoras-why','view=learn&comp=MC-077',{width:1080,height:1000},'.mlb-why','.mlb-lesson-foot .mlb-go');
    await shoot('learn-quadratic-phone','view=learn&comp=MC-103',{width:390,height:844},'.mlb-explore',null);
    await shoot('learn-unit-circle','view=learn&comp=MC-145',{width:1080,height:1000},'.mlb-explore',null);
    await shoot('learn-derivative','view=learn&comp=MC-152',{width:1080,height:1000},'.mlb-explore',null);
    await shoot('player','view=play',{width:1080,height:900},'.mlb-q',null);
    await shoot('player-phone','view=play',{width:390,height:844},'.mlb-q',null);
    await shoot('lite-order','view=learn&comp=MC-002&lite=1',{width:1080,height:1000},'.mlb-order-list','.mlb-skip .mlb-link');
    await shoot('lite-figure','view=learn&comp=MC-074&lite=1&q=fig',{width:1080,height:1000},'.mlb-q svg.mlb-dia','.mlb-skip .mlb-link');
    /* Behaviour, not only pixels: an explorer's readout follows its slider; "Why it works" walks
       one line at a time; the order exercise sends the order the learner made. */
    { const page=await browser.newPage({viewport:{width:1080,height:1000}}); const errs=[]; page.on('pageerror',e=>errs.push(String(e&&e.message)));
      await page.goto(BASE+'/tests/_ml_fixture.html?view=learn&comp=MC-077',{waitUntil:'networkidle'});
      await page.waitForSelector('.mlb-ex-out',{timeout:8000});
      const before=await page.textContent('.mlb-ex-out'); const sl=page.locator('.mlb-sl-in').first(); await sl.focus(); await page.keyboard.press('ArrowRight');
      const after=await page.textContent('.mlb-ex-out');
      if(before===after||!/16|5\^2|25/.test(before)) problems.push('pythagoras explorer: readout did not follow the slider ('+before.slice(0,60)+')');
      const bar=await page.$$eval('.mlb-stepbar li',ls=>ls.map(l=>l.innerText.trim()));
      if(bar.join('|')!=='Explore|Why it works|Worked example|Practise') problems.push('lesson steps: '+JSON.stringify(bar));
      await page.click('.mlb-lesson-foot .mlb-go'); await page.waitForSelector('.mlb-why',{timeout:4000});
      if(await page.locator('.mlb-explore').count()) problems.push('lesson steps: Explore still shown on the Why step');
      const n0=await page.locator('.mlb-why-steps li').count(); await page.click('.mlb-why .stt-btn'); const n1=await page.locator('.mlb-why-steps li').count();
      await page.click('.mlb-skip .mlb-link'); await page.waitForSelector('.mlb-status',{timeout:4000});
      if(!(await page.locator('.mlb-status .mlb-go').count())) problems.push('lesson steps: Skip to practice did not reach Practise');
      if(!(n0===1&&n1===2)) problems.push('why it works: did not reveal one line at a time ('+n0+'→'+n1+')');
      if(errs.length) problems.push('learn interaction: '+errs[0]);
      await page.goto(BASE+'/tests/_ml_fixture.html?view=learn&comp=MC-002&lite=1',{waitUntil:'networkidle'});
      await page.waitForSelector('.mlb-skip .mlb-link',{timeout:8000}); await page.click('.mlb-skip .mlb-link');
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
