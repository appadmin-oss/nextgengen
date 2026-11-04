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
    'require "api/_lib/domain/mathslab-map.php";require "api/_lib/domain/mathslab-gen.php";require "api/_lib/domain/mathslab.php";'
    +'$st=[];foreach(mlb_stages() as $n=>$s){$st[]=["n"=>$n,"title"=>$s["title"],"strand"=>$s["strand"],"available"=>mlb_stage_available($n),'
    +'"comps"=>array_map(fn($id)=>["id"=>$id,"title"=>mlb_comp($id)["title"],"available"=>mlb_available($id)],$s["comps"])];}'
    +'echo json_encode(["stages"=>$st,"total"=>count(mlb_competencies())],JSON_UNESCAPED_UNICODE);'
  ],{cwd:ROOT,encoding:'utf8'}));
  const open=[];SRC.stages.forEach(s=>s.comps.forEach(c=>{if(c.available)open.push(c.id);}));
  const MASTERED=open.slice(0,12),LEARNING=open.slice(12,15);
  const stateOf=c=>!c.available?'soon':MASTERED.indexOf(c.id)>=0?'mastered':LEARNING.indexOf(c.id)>=0?'practising':'open';
  const MAP={ok:true,member:true,stages:SRC.stages.map(s=>{const comps=s.comps.map(c=>({id:c.id,title:c.title,state:stateOf(c)}));
    return {n:s.n,title:s.title,strand:s.strand,available:s.available,comps:comps,boss:false,
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
  fs.writeFileSync(FIX,`<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
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
 var HOME=${JSON.stringify(HOME)}, MAP=${JSON.stringify(MAP)};
 window.NGGApi=window.NGGApi||{}; window.NGGApi.member=window.NGGApi.member||{};
 window.NGGApi.member.mathslab={ home:function(){return Promise.resolve(HOME);}, map:function(){return Promise.resolve(MAP);} };
 window.NGGApi.member.arcade={ home:function(){return Promise.resolve({
     games:[{key:'maths',name:'Number Rush',icon:'\\u26a1',blurb:'Twenty sums against the clock.',skill:'Mental arithmetic',kind:'type',questions:20,seconds:90,best:140,plays:3,tier:2,isDaily:true}],
     daily:'maths',dailyDone:false,streak:6,stars:9,programme:'ngg',totalPlays:14});},
   board:function(){return Promise.resolve({scope:'week',game:'maths',programme:'ngg',board:[],me:null});},
   start:function(){return Promise.resolve({});}, submit:function(){return Promise.resolve({});} };
 var view=Q.get('view')||'home';
 var C = view==='arcade' ? React.createElement(CmArcade,{auth:{member:{fullName:'Temiloluwa Adeyemi',centre:'Egbeda'}}})
       :                   React.createElement(MathsLab,{me:{phase:'ok',member:{fullName:'Temiloluwa Adeyemi'}}});
 ReactDOM.createRoot(document.getElementById('root')).render(C);
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
    await shoot('map','',{width:1080,height:1000},'.mlb-stars','.mlb-navb:nth-child(2)');
    await shoot('home-phone','',{width:390,height:844},'.mlb-hero',null);
    await shoot('map-phone','',{width:390,height:844},'.mlb-stars','.mlb-navb:nth-child(2)');
  } finally { await browser.close(); srv.kill(); try{fs.unlinkSync(FIX);}catch(_){} }
  if(problems.length){problems.forEach(p=>console.log('  ✗ '+p));console.log('\n❌ MATHS LAB SHOTS: '+problems.length+' problem(s)');process.exit(1);}
  console.log('\n✅ MATHS LAB SHOTS: '+shots+' screens rendered clean into tests/screens/');
})();
