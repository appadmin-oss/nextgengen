#!/usr/bin/env node
/* Math Lab — render the shipped bundle and photograph it.
   Fails on any page error, so a change that blanks the Lab fails the build.

   The fixture numbers are internally CONSISTENT on purpose. Two earlier
   screenshot fixtures in this repo shipped incoherent figures — a chess board
   captioned "You won" over a position where the player was mated, a dashboard
   headed ₦75,000 over three rows of ₦75,000 — and a picture that contradicts
   itself is worse than no picture, because it is what people quote back. So
   here: three levels cleared out of twelve, the fourth open and the fifth shut
   behind it, and a marked paper whose 8-of-10 really is 80%. */
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
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
 var LEVELS=[
  {level:1,name:'Number & Numeration',band:'JSS 1\\u20132',icon:'\\u2460',blurb:'Factors, multiples, fractions, percentages and sharing in a ratio.',questions:12,seconds:300,bestScore:100,bestCorrect:12,attempts:2},
  {level:2,name:'Algebraic Processes',band:'JSS 3',icon:'\\u2461',blurb:'Expanding, factorising, solving and changing the subject.',questions:12,seconds:330,bestScore:92,bestCorrect:11,attempts:3},
  {level:3,name:'Indices & Logarithms',band:'SSS 1',icon:'\\u2462',blurb:'The laws of indices, and logarithms as their mirror.',questions:12,seconds:330,bestScore:75,bestCorrect:9,attempts:2},
  {level:4,name:'Surds',band:'SSS 1\\u20132',icon:'\\u2463',blurb:'Simplifying, and rationalising a denominator.',questions:10,seconds:330,bestScore:60,bestCorrect:6,attempts:1},
  {level:5,name:'Quadratic Equations',band:'SSS 2',icon:'\\u2464',blurb:'Roots, the discriminant, and the sum and product of roots.',questions:12,seconds:360,bestScore:0,bestCorrect:0,attempts:0},
  {level:6,name:'Sequences & Series',band:'SSS 2',icon:'\\u2465',blurb:'A.P. and G.P. \\u2014 nth terms, sums, and a sum to infinity.',questions:12,seconds:360,bestScore:0,bestCorrect:0,attempts:0},
  {level:7,name:'Trigonometry',band:'SSS 2\\u20133',icon:'\\u2466',blurb:'Exact ratios, the sine and cosine rules, and simple equations.',questions:10,seconds:360,bestScore:0,bestCorrect:0,attempts:0},
  {level:8,name:'Binomial & Counting',band:'Further Maths',icon:'\\u2467',blurb:'Permutations, combinations and the binomial expansion.',questions:10,seconds:360,bestScore:0,bestCorrect:0,attempts:0},
  {level:9,name:'Matrices',band:'Further Maths',icon:'\\u2468',blurb:'Determinants, inverses and multiplication.',questions:10,seconds:360,bestScore:0,bestCorrect:0,attempts:0},
  {level:10,name:'Differentiation',band:'Further Maths / A-level',icon:'\\u2469',blurb:'Gradients, turning points, and the product and quotient rules.',questions:10,seconds:420,bestScore:0,bestCorrect:0,attempts:0},
  {level:11,name:'Integration',band:'Further Maths / A-level',icon:'\\u246a',blurb:'Definite integrals and the area under a curve.',questions:10,seconds:420,bestScore:0,bestCorrect:0,attempts:0},
  {level:12,name:'Coordinate Geometry & Vectors',band:'Further Maths / A-level',icon:'\\u246b',blurb:'Lines, distances, magnitudes and the scalar product.',questions:10,seconds:420,bestScore:0,bestCorrect:0,attempts:0}
 ];
 /* Three cleared, the fourth open because the third was cleared, everything
    from the fifth up shut. bestScore >= 70 exactly where cleared is true. */
 var BOARD={ passPct:70, cleared:3, total:12,
   levels:LEVELS.map(function(l,i){ return Object.assign({},l,{unlocked:i<=3,cleared:i<=2}); }) };
 var PAPER={ roundId:'ML-SHOT', level:4, name:'Surds', band:'SSS 1\\u20132', seconds:330, questions:[
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
 /* 8 right out of 10 is 80%, which clears a 70% pass mark and opens level 5.
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
 var RESULT={ correct:8, total:10, score:80, ms:214600, passPct:70, cleared:true, marks:MARKS,
   unlocked:{level:5,name:'Quadratic Equations'}, level:4, name:'Surds', questions:PAPER.questions };
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
