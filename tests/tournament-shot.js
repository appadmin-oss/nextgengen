#!/usr/bin/env node
/* Tournaments console — render the shipped bundle and photograph it.
   Fails on any page error, so a change that blanks the console fails the build. */
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const {waitForServer}=require('./_serve');
const ROOT=path.resolve(__dirname,'..'),PORT=process.env.TRN_PORT||8215;
const BASE='http://127.0.0.1:'+PORT,FIX=path.join(ROOT,'tests','_trn_fixture.html');
const OUT=path.join(ROOT,'tests','screens');
function loadChromium(){for(const m of [process.env.PLAYWRIGHT_MODULE,'playwright','playwright-core'].filter(Boolean)){try{return require(m).chromium;}catch(_){}}return null;}
(async()=>{
  const chromium=loadChromium();
  if(!chromium){console.log('⏭  tournament shots: skipped (playwright not installed)');process.exit(0);}
  const exe=process.env.CHROMIUM_PATH||(fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')?'/opt/pw-browsers/chromium-1194/chrome-linux/chrome':undefined);
  fs.mkdirSync(OUT,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'dist','build-manifest.json'),'utf8'));
  fs.writeFileSync(FIX,`<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#f6f7fb;padding:20px;}</style>
</head><body><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
 var Q=new URLSearchParams(location.search);
 var LIST={ tournaments:[
   { tournamentId:'TRN-A1B2C3', name:'NGG Chess Cup 2026', game:'chess', programme:'ngg',
     status:'running', stage:'centre', round:2, entrants:7, live:4, openMatches:1, winnerName:'' },
   { tournamentId:'TRN-D4E5F6', name:'Summer Blitz', game:'chess', programme:'summer',
     status:'open', stage:'centre', round:0, entrants:3, live:3, openMatches:0, winnerName:'' },
   { tournamentId:'TRN-G7H8I9', name:'Founders Cup 2025', game:'chess', programme:'ngg',
     status:'complete', stage:'done', round:4, entrants:12, live:1, openMatches:0, winnerName:'Temiloluwa A.' }
 ]};
 var BRACKET={ tournament:{ tournamentId:'TRN-A1B2C3', name:'NGG Chess Cup 2026', game:'chess',
     programme:'ngg', status:'running', stage:'centre', round:2, winnerId:'', winnerName:'' },
   centres:{
     Egbeda:[
       {playerId:'E1',name:'Ade One',status:'active',stage:'centre',centreChampion:false,eliminatedRound:0},
       {playerId:'E2',name:'Bola Two',status:'active',stage:'centre',centreChampion:false,eliminatedRound:0},
       {playerId:'E3',name:'Chi Three',status:'eliminated',stage:'centre',centreChampion:false,eliminatedRound:1},
       {playerId:'E4',name:'Dele Four',status:'eliminated',stage:'centre',centreChampion:false,eliminatedRound:1},
       {playerId:'E5',name:'Eze Five',status:'active',stage:'centre',centreChampion:false,eliminatedRound:0}
     ],
     Ayobo:[
       {playerId:'A1',name:'Fola Six',status:'active',stage:'centre',centreChampion:true,eliminatedRound:0},
       {playerId:'A2',name:'Gani Seven',status:'eliminated',stage:'centre',centreChampion:false,eliminatedRound:1}
     ]},
   rounds:{
     'centre-1':[
       {matchId:'M1',centre:'Egbeda',stage:'centre',round:1,a:{id:'E1',name:'Ade One'},b:{id:'E3',name:'Chi Three'},status:'complete',result:'win',winnerId:'E1',reason:'checkmate',ply:41},
       {matchId:'M2',centre:'Egbeda',stage:'centre',round:1,a:{id:'E2',name:'Bola Two'},b:{id:'E4',name:'Dele Four'},status:'complete',result:'win',winnerId:'E2',reason:'resignation',ply:22},
       {matchId:'M3',centre:'Ayobo',stage:'centre',round:1,a:{id:'A1',name:'Fola Six'},b:{id:'A2',name:'Gani Seven'},status:'complete',result:'win',winnerId:'A1',reason:'checkmate',ply:33}
     ],
     'centre-2':[
       {matchId:'M4',centre:'Egbeda',stage:'centre',round:2,a:{id:'E1',name:'Ade One'},b:{id:'E2',name:'Bola Two'},status:'active',result:'',winnerId:'',reason:'',ply:9},
       {matchId:'M5',centre:'Egbeda',stage:'centre',round:2,a:{id:'E5',name:'Eze Five'},b:{id:'E1',name:'Ade One'},status:'complete',result:'draw',winnerId:'',reason:'threefold',ply:88}
     ]}};
 window.NGGApi={ admin:{ tournaments:{
   list:function(){return Promise.resolve(LIST);},
   bracket:function(){return Promise.resolve(BRACKET);},
   /* The control room renders the standings and pairings tables from the same
      components the members' screen uses, so the shot needs them too. */
   standings:function(){return Promise.resolve({tournament:{tournamentId:'TRN-1',name:'Egbeda Centre Cup',
       format:'centre',formatName:'Centre cup',status:'running',round:2,totalRounds:0,tiebreak:'buchholz'},
     standings:[
       {rank:1,playerId:'E1',name:'Ade One',centre:'Egbeda',kind:'member',score:2.5,played:3,
        wins:2,draws:1,losses:0,buchholz:5.5,sonneborn:4.25,performance:1310,rating:1240,status:'active'},
       {rank:2,playerId:'E5',name:'Eze Five',centre:'Egbeda',kind:'student',score:2,played:3,
        wins:2,draws:0,losses:1,buchholz:5,sonneborn:3,performance:1255,rating:1190,status:'active'},
       {rank:3,playerId:'E2',name:'Bola Two',centre:'Ayobo',kind:'volunteer',score:1,played:3,
        wins:1,draws:0,losses:2,buchholz:4.5,sonneborn:1.5,performance:1105,rating:1160,status:'eliminated'}
     ]});},
   rounds:function(){return Promise.resolve({rounds:[
     {round:1,boards:[
       {board:1,centre:'Egbeda',white:{id:'E1',name:'Ade One'},black:{id:'E5',name:'Eze Five'},
        matchId:'M1',isBye:false,result:'1-0',status:'complete',ply:44,isMine:false,clock:null},
       {board:2,centre:'Egbeda',white:{id:'E2',name:'Bola Two'},black:{id:'',name:''},
        matchId:'',isBye:true,result:'bye',status:'bye',ply:0,isMine:false,clock:null}
     ]},
     {round:2,boards:[
       {board:1,centre:'Egbeda',white:{id:'E1',name:'Ade One'},black:{id:'E2',name:'Bola Two'},
        matchId:'M4',isBye:false,result:'',status:'active',ply:9,isMine:false,clock:null}
     ]}
   ]});},
   create:function(){return Promise.resolve({tournamentId:'TRN-NEW'});},
   enter:function(){return Promise.resolve({ok:true});},
   withdraw:function(){return Promise.resolve({ok:true});},
   advance:function(){return Promise.resolve({ok:true});},
   replay:function(){return Promise.resolve({ok:true});},
   cancel:function(){return Promise.resolve({ok:true});}
 }, members:{ list:function(){return Promise.resolve({members:[
   {memberId:'E9',fullName:'Halima Nine',centre:'Egbeda'},
   {memberId:'E10',fullName:'Ibrahim Ten',centre:'Ayobo'}]});} } } };
 var C = Q.get('view')==='bracket' ? React.createElement(AdminTournamentBracket,{tournamentId:'TRN-A1B2C3',onBack:function(){}})
       : React.createElement(AdminTournaments,null);
 ReactDOM.createRoot(document.getElementById('root')).render(C);
</script></body></html>`);
  const srv=spawn('php',['-S','127.0.0.1:'+PORT,'-t',ROOT],{cwd:ROOT,stdio:'ignore'});
  const browser=await chromium.launch({executablePath:exe});
  let shots=0,problems=[];
  try{
    await waitForServer(BASE+'/tests/_trn_fixture.html');
    const shoot=async(name,query,viewport)=>{
      const page=await browser.newPage({viewport,deviceScaleFactor:2});
      const errs=[]; page.on('pageerror',e=>errs.push(String(e&&e.message)));
      await page.goto(BASE+'/tests/_trn_fixture.html?'+query,{waitUntil:'networkidle'});
      await page.waitForTimeout(400);
      const text=await page.evaluate(()=>document.body.innerText.trim());
      if(!text) problems.push(name+': rendered nothing');
      if(errs.length) problems.push(name+': '+errs[0]);
      await page.screenshot({path:path.join(OUT,'tournament-'+name+'.png'),fullPage:true});
      shots++;
      console.log('  📸 tournament-'+name+'.png  ('+viewport.width+'×'+viewport.height+')'+(errs.length?'  ⚠ '+errs[0]:''));
      await page.close();
    };
    await shoot('list','',{width:1180,height:800});
    await shoot('bracket','view=bracket',{width:1180,height:1000});
    await shoot('bracket-phone','view=bracket',{width:390,height:844});
  } finally { await browser.close(); srv.kill(); try{fs.unlinkSync(FIX);}catch(_){} }
  if(problems.length){problems.forEach(p=>console.log('  ✗ '+p));console.log('\n❌ TOURNAMENT SHOTS: '+problems.length+' problem(s)');process.exit(1);}
  console.log('\n✅ TOURNAMENT SHOTS: '+shots+' screens rendered clean into tests/screens/');
})();
