#!/usr/bin/env node
/* Math Lab — render the shipped bundle and photograph it.
   Fails on any page error, so a change that blanks the Lab fails the build.

   The fixture numbers are internally CONSISTENT on purpose. Two earlier
   screenshot fixtures in this repo shipped incoherent figures — a chess board
   captioned "You won" over a position where the player was mated, a dashboard
   headed ₦75,000 over three rows of ₦75,000 — and a picture that contradicts
   itself is worse than no picture, because it is what people quote back. So
   here: the real twenty-one-level ladder read out of the PHP that serves it,
   with progress that obeys the prerequisite graph — a level is drawn open only
   when the levels it needs are cleared — and a marked paper whose 8-of-10
   really is 80%.

   The ladder is READ FROM THE SOURCE rather than copied into this file. The
   old fixture hard-coded twelve levels and went stale the moment the ladder
   grew, so the screenshots showed a product that no longer existed. */
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const {execFileSync}=require('child_process');
const {waitForServer}=require('./_serve');
const ROOT=path.resolve(__dirname,'..'),PORT=process.env.ML_PORT||8216;
const BASE='http://127.0.0.1:'+PORT,FIX=path.join(ROOT,'tests','_ml_fixture.html');
const OUT=path.join(ROOT,'tests','screens');
function loadChromium(){for(const m of [process.env.PLAYWRIGHT_MODULE,'playwright','playwright-core'].filter(Boolean)){try{return require(m).chromium;}catch(_){}}return null;}
(async()=>{
  const chromium=loadChromium();
  if(!chromium){console.log('⏭  math lab shots: skipped (playwright not installed)');process.exit(0);}
  const exe=process.env.CHROMIUM_PATH||(fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')?'/opt/pw-browsers/chromium-1194/chrome-linux/chrome':undefined);
  fs.mkdirSync(OUT,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'dist','build-manifest.json'),'utf8'));

  /* The ladder, straight out of the domain code that serves it. */
  const LADDER=JSON.parse(execFileSync('php',['-r',
    'require "api/_lib/domain/mathlab.php";'
    +'$o=[];foreach(mathlab_levels() as $l){$o[]=["level"=>$l["level"],"name"=>$l["name"],'
    +'"band"=>$l["band"],"icon"=>$l["icon"],"strand"=>$l["strand"],'
    +'"needs"=>array_values($l["needs"]),"blurb"=>$l["blurb"],'
    +'"questions"=>$l["questions"],"seconds"=>$l["seconds"]];}'
    +'echo json_encode(["levels"=>$o,"strands"=>mathlab_strands()],JSON_UNESCAPED_UNICODE);'
  ],{cwd:ROOT,encoding:'utf8'}));

  /* A believable student: solid through JSS and early SSS algebra, started on
     data, has not touched calculus. Everything downstream — which levels read
     as open, what each shut one is waiting on, the cleared count — is DERIVED
     from this list against the real prerequisite graph, so the picture cannot
     contradict itself the way a hand-written fixture can. */
  const CLEARED=[1,2,3,4,6,14];
  const BOARD_LEVELS=LADDER.levels.map(l=>{
    const cleared=CLEARED.indexOf(l.level)>=0;
    const waitingOn=l.needs.filter(n=>CLEARED.indexOf(n)<0)
      .map(n=>LADDER.levels.find(x=>x.level===n).name);
    const best=cleared?[100,90,85,80,75,95][CLEARED.indexOf(l.level)]:0;
    return Object.assign({},l,{unlocked:waitingOn.length===0,waitingOn:waitingOn,
      cleared:cleared,bestScore:best,
      bestCorrect:cleared?Math.round(best*l.questions/100):0,
      attempts:cleared?(l.level===1?2:1):0});
  });
  const BOARD={passPct:70,strands:LADDER.strands,levels:BOARD_LEVELS,
    cleared:CLEARED.length,total:BOARD_LEVELS.length,
    open:BOARD_LEVELS.filter(l=>l.unlocked&&!l.cleared).length};
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
 var BOARD=${JSON.stringify(BOARD)};
 var PAPER={ roundId:'ML-SHOT', level:5, name:'Surds', band:'SSS 1\\u20132', seconds:330, questions:[
   {q:'Simplify \\u221a72 in the form a\\u221a2. What is a?'},
   {q:'5\\u221a3 + 4\\u221a3 = k\\u221a3. What is k?'},
   {q:'Rationalise 15/\\u221a5. The answer is a\\u221a5. What is a?'},
   {q:'(\\u221a7)\\u00b2 = ?'},
   {q:'Simplify \\u221a98 in the form a\\u221a2. What is a?'},
   {q:'8\\u221a5 + 3\\u221a5 = k\\u221a5. What is k?'},
   {q:'Rationalise 21/\\u221a7. The answer is a\\u221a7. What is a?'},
   {q:'Simplify \\u221a45 in the form a\\u221a5. What is a?'},
   {q:'(\\u221a3)\\u00b2 = ?'},
   {q:'Rationalise 12/\\u221a3. The answer is a\\u221a3. What is a?'}
 ]};
 /* 8 right out of 10 is 80%, which clears a 70% pass mark. Complex Numbers
    needs Surds AND Quadratic Equations; this student already had Quadratics,
    so clearing Surds is what opens it — one door, which is what the graph
    actually says, not a cascade invented for the screenshot.
    Every "answer" below is the true answer to the question it sits under. */
 var MARKS=[
   {ok:true, your:'6',  answer:'6'},
   {ok:true, your:'9',  answer:'9'},
   {ok:false,your:'5',  answer:'3'},
   {ok:true, your:'7',  answer:'7'},
   {ok:true, your:'7',  answer:'7'},
   {ok:true, your:'11', answer:'11'},
   {ok:true, your:'3',  answer:'3'},
   {ok:true, your:'3',  answer:'3'},
   {ok:false,your:'',   answer:'3'},
   {ok:true, your:'4',  answer:'4'}
 ];
 /* questions carried across from the paper — the marked view shows each
    question beside its mark, because a mark alone teaches nothing. */
 var OPENED=[{level:10,name:'Complex Numbers',strand:'Algebra'}];
 var RESULT={ correct:8, total:10, score:80, ms:214600, passPct:70, cleared:true, marks:MARKS,
   opened:OPENED, unlocked:OPENED[0], level:5, name:'Surds', questions:PAPER.questions };
 window.NGGApi={ member:{ mathlab:{
   board:function(){return Promise.resolve(BOARD);},
   start:function(){return Promise.resolve(PAPER);},
   submit:function(){return Promise.resolve(RESULT);}
 }, arcade:{ home:function(){return Promise.resolve({
     games:[{key:'maths',name:'Number Rush',icon:'\\u26a1',blurb:'Twenty sums against the clock.',skill:'Mental arithmetic',kind:'type',questions:20,seconds:90,best:140,plays:3,tier:2,isDaily:true}],
     daily:'maths',dailyDone:false,streak:6,stars:9,programme:'ngg',totalPlays:14});},
   board:function(){return Promise.resolve({scope:'week',game:'maths',programme:'ngg',board:[],me:null});},
   start:function(){return Promise.resolve({});}, submit:function(){return Promise.resolve({});} } } };
 var view=Q.get('view')||'ladder';
 var C = view==='paper'  ? React.createElement(MathPaper,{paper:PAPER,onMarked:function(){},onQuit:function(){}})
       : view==='marked' ? React.createElement(MathMarked,{result:RESULT,onRetry:function(){},onNext:function(){},onDone:function(){}})
       : view==='arcade' ? React.createElement(CmArcade,{auth:{member:{fullName:'Temiloluwa Adeyemi',centre:'Egbeda'}}})
       :                   React.createElement(MathLab,{onDone:function(){}});
 ReactDOM.createRoot(document.getElementById('root')).render(C);
</script></body></html>`);
  const srv=spawn('php',['-S','127.0.0.1:'+PORT,'-t',ROOT],{cwd:ROOT,stdio:'ignore'});
  const browser=await chromium.launch({executablePath:exe});
  let shots=0,problems=[];
  try{
    await waitForServer(BASE+'/tests/_ml_fixture.html');
    const shoot=async(name,query,viewport,wait)=>{
      const page=await browser.newPage({viewport,deviceScaleFactor:2});
      const errs=[]; page.on('pageerror',e=>errs.push(String(e&&e.message)));
      await page.goto(BASE+'/tests/_ml_fixture.html?'+query,{waitUntil:'networkidle'});
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
    await shoot('ladder','',{width:1080,height:1000},'.ml-ladder');
    await shoot('paper','view=paper',{width:1080,height:1000},'.ml-qs');
    await shoot('marked','view=marked',{width:1080,height:1000},'.ml-marks');
    await shoot('arcade','view=arcade',{width:1080,height:900},'.ml-teaser');
    await shoot('ladder-phone','',{width:390,height:844},'.ml-ladder');
    await shoot('paper-phone','view=paper',{width:390,height:844},'.ml-qs');
  } finally { await browser.close(); srv.kill(); try{fs.unlinkSync(FIX);}catch(_){} }
  if(problems.length){problems.forEach(p=>console.log('  ✗ '+p));console.log('\n❌ MATH LAB SHOTS: '+problems.length+' problem(s)');process.exit(1);}
  console.log('\n✅ MATH LAB SHOTS: '+shots+' screens rendered clean into tests/screens/');
})();
