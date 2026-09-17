#!/usr/bin/env node
/* The Mentor Portal — render the shipped bundle and photograph it.
   Fails on any page error, so a change that blanks the portal fails the build.

   The fixture is internally consistent: three cleared weeks out of eight in the
   V3 strip really are three rated entries, and the child shown really is one of
   the two mentees the roster claims. Two earlier screenshot fixtures in this
   repo shipped numbers that contradicted their own captions. */
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const {waitForServer}=require('./_serve');
const ROOT=path.resolve(__dirname,'..'),PORT=process.env.MTR_PORT||8217;
const BASE='http://127.0.0.1:'+PORT,FIX=path.join(ROOT,'tests','_mtr_fixture.html');
const OUT=path.join(ROOT,'tests','screens');
function loadChromium(){for(const m of [process.env.PLAYWRIGHT_MODULE,'playwright','playwright-core'].filter(Boolean)){try{return require(m).chromium;}catch(_){}}return null;}
(async()=>{
  const chromium=loadChromium();
  if(!chromium){console.log('⏭  mentor shots: skipped (playwright not installed)');process.exit(0);}
  const exe=process.env.CHROMIUM_PATH||(fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')?'/opt/pw-browsers/chromium-1194/chrome-linux/chrome':undefined);
  fs.mkdirSync(OUT,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'dist','build-manifest.json'),'utf8'));
  fs.writeFileSync(FIX,`<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;}</style>
</head><body><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
 var Q=new URLSearchParams(location.search);
 window.useAuth=function(){return {isSignedIn:true, openSignIn:function(){}};};
 var MTR_MINE=[
  {studentId:'NGG-KID-1',kind:'member',fullName:'Adaeze Okonkwo',track:'Robotics',photoUrl:'',starredToday:3,note:'Led the group',byMe:true,v3:{verbal:5,vocal:4,visual:4,note:''}},
  {studentId:'NGG-KID-2',kind:'member',fullName:'Bolanle Adeyemi',track:'Design',photoUrl:'',starredToday:0,note:'',byMe:false,v3:null}
 ];
 var MTR_ALL=MTR_MINE.concat([
  {studentId:'NGG-KID-3',kind:'member',fullName:'Chidera Nwosu',track:'Robotics',photoUrl:'',starredToday:2,note:'',byMe:false,v3:{verbal:3,vocal:3,visual:4,note:''}},
  {studentId:'NGG-KID-4',kind:'member',fullName:'Damilola Bakare',track:'Coding',photoUrl:'',starredToday:0,note:'',byMe:false,v3:null},
  {studentId:'NGG-KID-6',kind:'member',fullName:'Emeka Obi',track:'Design',photoUrl:'',starredToday:0,note:'',byMe:false,v3:null}
 ]);
 /* Eight weeks, three of them rated. The gaps are the point: a trend that
    silently dropped the unrated weeks would read as steady attention. */
 var MTR_WEEKS=['2026-W27','2026-W28','2026-W29','2026-W30','2026-W31','2026-W32','2026-W33','2026-W34'];
 var MTR_RATED={'2026-W30':[3,3,2],'2026-W32':[4,3,4],'2026-W34':[5,4,4]};
 var MTR_V3=MTR_WEEKS.map(function(p){ var r=MTR_RATED[p];
   return r? {period:p,rated:true,verbal:r[0],vocal:r[1],visual:r[2],note:''}
           : {period:p,rated:false,verbal:0,vocal:0,visual:0,note:''}; });
 var MTR_CHILD={ subject:{subjectId:'NGG-KID-1',kind:'member',fullName:'Adaeze Okonkwo',centre:'Egbeda',track:'Robotics',photoUrl:'',status:'active'},
   mentor:{mentorId:'MEN-NGG-1',name:'Nkechi Mentor',isMine:true},
   stars:{total:24,recent:[{date:'2026-08-18',stars:3,category:'discipline',note:'Led the group',givenById:'NGG-MENT-1'}]},
   v3:MTR_V3,
   attendance:{total:41,last90:22,lastSeen:'2026-08-15'},
   meetings:[
     {id:2,metOn:'2026-08-11',kind:'guardian',discussed:'Guardian says she has not been sleeping well since the move.',agreed:'Check in every Monday for a month.',concern:true,mentorId:'NGG-MENT-1',mentorName:'Nkechi Mentor',mine:true,createdAt:''},
     {id:1,metOn:'2026-07-28',kind:'one-to-one',discussed:'Wants to lead the robotics demo at the showcase but says the older boys talk over her.',agreed:'She opens the demo; I will chair the practice.',concern:false,mentorId:'NGG-MENT-1',mentorName:'Nkechi Mentor',mine:true,createdAt:''}
   ],
   goals:[
     {id:1,goal:'Open the robotics demo at the centre showcase.',dueOn:'2026-09-12',status:'open',closedOn:'',setById:'NGG-MENT-1',setByName:'Nkechi Mentor',overdue:false,createdAt:''},
     {id:2,goal:'Read one book a fortnight and tell me about it.',dueOn:'2026-08-01',status:'open',closedOn:'',setById:'NGG-MENT-1',setByName:'Nkechi Mentor',overdue:true,createdAt:''},
     {id:3,goal:'Join the Tuesday coding club.',dueOn:'2026-06-30',status:'done',closedOn:'2026-06-24',setById:'NGG-MENT-1',setByName:'Nkechi Mentor',overdue:false,createdAt:''}
   ],
   kinds:['one-to-one','group','call','guardian','check-in'],
   /* The Courage Index (brief §14). Four marks so the trend is allowed to
      appear at all — under four the server withholds the direction, and a
      fixture that skipped that would photograph a state the product never
      shows. The current value is the mean of the four, as the server
      computes it. (No backticks in here: this whole fixture lives inside a
      template literal.) */
   courage:{ current:3.8, rung:{score:4,label:'Takes responsibility voluntarily'}, direction:'rising',
     inWindow:4, total:4, windowDays:120, marks:[
       {id:4,score:5,prompt:'Did they defend someone being treated unfairly?',evidence:'Told the older boys to stop mocking the new JSS1 boy, in front of everyone.',markedById:'NGG-MENT-1',markedByName:'Nkechi Mentor',observedOn:'2026-08-15'},
       {id:3,score:4,prompt:'Did they admit failure?',evidence:'Said out loud that the demo failed because she had not practised the wiring.',markedById:'NGG-MENT-1',markedByName:'Nkechi Mentor',observedOn:'2026-08-08'},
       {id:2,score:3,prompt:'Did they attempt something difficult?',evidence:'Tried the harder build after the first one collapsed twice.',markedById:'NGG-MENT-1',markedByName:'Nkechi Mentor',observedOn:'2026-07-30'},
       {id:1,score:3,prompt:'',evidence:'Asked the question the whole room clearly had and nobody else would ask.',markedById:'NGG-MENT-1',markedByName:'Nkechi Mentor',observedOn:'2026-07-21'}
     ] },
   courageLadder:[{score:1,label:'Avoids responsibility'},{score:2,label:'Acts only when instructed'},
     {score:3,label:'Attempts difficult things'},{score:4,label:'Takes responsibility voluntarily'},
     {score:5,label:'Acts courageously for the good of others'}],
   couragePrompts:['Did they speak the truth when lying would have been easier?','Did they apologize when wrong?',
     'Did they attempt something difficult?','Did they defend someone being treated unfairly?',
     'Did they ask questions when confused?','Did they accept correction?','Did they admit failure?',
     'Did they volunteer for responsibility?','Did they challenge an idea respectfully?','Did they continue after failure?'],
   canWrite:true, role:'mentor', rank:'mentor', sessionId:'S-2026' };
 window.NGGApi={ member:{
   mentorRoster:function(centre,scope){ var mine=(scope||'mine')==='mine';
     return Promise.resolve({ today:'2026-08-18', period:'2026-W34', categories:['discipline','teamwork','effort'],
       presets:[], role:'mentor', rank:'mentor', centre:'Egbeda', centres:['Egbeda'], needsCentre:false,
       scope: mine?'mine':'centre', mineCount:2,
       mentor:{name:'Nkechi Mentor',centre:'Egbeda',department:'',programmes:['ngg']},
       students: mine?MTR_MINE:MTR_ALL }); },
   mentorChild:function(){ return Promise.resolve(MTR_CHILD); },
   mentorMeeting:function(){ return Promise.resolve({id:3}); },
   mentorMeetingDelete:function(){ return Promise.resolve({}); },
   mentorGoal:function(){ return Promise.resolve({id:4}); },
   mentorGoalStatus:function(){ return Promise.resolve({}); },
   courageMark:function(){ return Promise.resolve({ok:true,courage:MTR_CHILD.courage}); },
   mentorAttention:function(){ return Promise.resolve({concerns:[],overdue:[],centres:['Egbeda'],centre:''}); }
 } };
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(MentorPortal,null));
 if(Q.get('child')==='1'){ window.__openChild=true; }
</script></body></html>`);
  const srv=spawn('php',['-S','127.0.0.1:'+PORT,'-t',ROOT],{cwd:ROOT,stdio:'ignore'});
  const browser=await chromium.launch({executablePath:exe});
  let shots=0,problems=[];
  try{
    await waitForServer(BASE+'/tests/_mtr_fixture.html');
    const shoot=async(name,query,viewport,openChild,tab)=>{
      const page=await browser.newPage({viewport,deviceScaleFactor:2});
      const errs=[]; page.on('pageerror',e=>errs.push(String(e&&e.message)));
      await page.goto(BASE+'/tests/_mtr_fixture.html?'+query,{waitUntil:'networkidle'});
      try{ await page.waitForSelector('.dash-spinner',{state:'detached',timeout:8000}); }catch(_){}
      await page.waitForTimeout(400);
      if(openChild){
        await page.evaluate(()=>{
          const b=Array.from(document.querySelectorAll('button')).find(x=>/Open the record for/.test(x.getAttribute('aria-label')||''));
          if(b) b.click();
        });
        try{ await page.waitForSelector('[role="dialog"]',{timeout:8000}); }catch(_){ problems.push(name+': the record never opened'); }
        await page.waitForTimeout(500);
        if(tab){
          await page.evaluate((t)=>{
            const b=Array.from(document.querySelectorAll('[role="tab"]')).find(x=>new RegExp(t,'i').test(x.textContent||''));
            if(b) b.click();
          },tab);
          await page.waitForTimeout(300);
        }
      }
      const text=await page.evaluate(()=>document.body.innerText.trim());
      if(!text) problems.push(name+': rendered nothing');
      if(errs.length) problems.push(name+': '+errs[0]);
      await page.screenshot({path:path.join(OUT,'mentor-'+name+'.png'),fullPage:true});
      shots++;
      console.log('  📸 mentor-'+name+'.png  ('+viewport.width+'×'+viewport.height+')'+(errs.length?'  ⚠ '+errs[0]:''));
      await page.close();
    };
    await shoot('roster','',{width:900,height:800},false);
    await shoot('record','',{width:900,height:1100},true);
    await shoot('goals','',{width:900,height:900},true,'Goals');
    await shoot('courage','',{width:900,height:1400},true,'Courage');
    await shoot('roster-phone','',{width:390,height:844},false);
    await shoot('record-phone','',{width:390,height:844},true);
    await shoot('courage-phone','',{width:390,height:844},true,'Courage');
  } finally { await browser.close(); srv.kill(); try{fs.unlinkSync(FIX);}catch(_){} }
  if(problems.length){problems.forEach(p=>console.log('  ✗ '+p));console.log('\n❌ MENTOR SHOTS: '+problems.length+' problem(s)');process.exit(1);}
  console.log('\n✅ MENTOR SHOTS: '+shots+' screens rendered clean into tests/screens/');
})();
