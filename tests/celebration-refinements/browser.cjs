const {chromium}=require('playwright');
const fs=require('fs'),assert=require('assert/strict');
const root=require('path').resolve(__dirname,'../..');
const output=require('path').join(require('os').tmpdir(),'dinoboy-celebration-refinements');fs.mkdirSync(output,{recursive:true});
const mock=`
window.testCalls=[];
const readRows=()=>JSON.parse(localStorage.getItem('test-rows')||'[]');
const saveRows=rows=>localStorage.setItem('test-rows',JSON.stringify(rows));
window.DinoBoySupabase={client:{
 from:()=>{const q={select:()=>q,order:()=>q,limit:async()=>({data:readRows().filter(r=>r.display_publicly&&!r.is_hidden&&!r.is_deleted).map(r=>{const {email,...safe}=r;return {...safe,photo_path:r.media_approved?r.photo_path:null,photo_bucket:r.media_approved?r.photo_bucket:null,photo_mime_type:r.media_approved?r.photo_mime_type:null};})})};return q;},
 storage:{from:()=>({upload:async(path)=>({data:{path}}),createSignedUrl:async(path)=>({data:{signedUrl:'http://127.0.0.1:8765/test-media/'+path}})})},
 rpc:async(name,args)=>{
  window.testCalls.push({name,args});
  if(name==='validate_celebration_access_token')return {data:args.raw_token==='test-token'?[{access_token_id:'token-id',label:'Test'}]:[]};
  if(name==='get_public_site_settings')return {data:{}};
  if(name==='celebration_guestbook_stats')return {data:[{people_here:1,countries:1,state_regions:1,memories_shared:readRows().length}]};
  if(name==='admin_list_celebration_guestbook')return {data:readRows()};
  if(name==='admin_moderate_celebration_guestbook'||name==='admin_update_celebration_guestbook'){
   const rows=readRows();const row=rows.find(r=>r.id===args.entry_id);
   for(const [k,v] of Object.entries(args))if(k.startsWith('guest_'))row[k.slice(6)]=v;
   saveRows(rows);return {data:null};
  }
  if(name==='submit_celebration_guestbook_v2'){
   const rows=readRows();
   if(args.guest_photo_path&&rows.some(r=>r.photo_path===args.guest_photo_path))return {data:[{status:'duplicate'}]};
   const row={id:crypto.randomUUID(),created_at:new Date().toISOString(),name:args.guest_name,email:args.guest_email,city:args.guest_city,state_region:args.guest_state_region,country:args.guest_country,memory:args.guest_memory,photo_path:args.guest_photo_path,photo_bucket:args.guest_photo_bucket,photo_mime_type:args.guest_photo_mime_type,display_publicly:args.guest_display_publicly,latitude:33.4269,longitude:-117.6119,display_latitude:33.55,display_longitude:-117.7,media_approved:false,is_hidden:false,is_deleted:false};
   rows.unshift(row);saveRows(rows);
   if(window.loseResponse){window.loseResponse=false;throw new Error('Connection interrupted');}
   return {data:[{status:'success',guestbook_id:row.id}]};
  }
  return {data:[]};
 }
}};`;
(async()=>{
const b=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.hostname!=='127.0.0.1')return route.fulfill({body:'',contentType:'text/javascript'});
 if(u.pathname==='/js/supabaseClient.js')return route.fulfill({body:mock,contentType:'text/javascript'});
 if(['/js/adminReview.js','/js/adminCommunications.js','/js/adminComments.js'].includes(u.pathname))return route.fulfill({body:'',contentType:'text/javascript'});
 if(['/memories','/playlist','/five-lessons'].includes(u.pathname))return route.fulfill({body:fs.readFileSync(root+u.pathname+'.html'),contentType:'text/html'});
 return route.continue();
});
const origin='http://127.0.0.1:8765';
await p.goto(origin+'/guestbook.html');await p.locator('#guestbookGate').waitFor({state:'visible'});
await p.goto(origin+'/guestbook.html?t=test-token');
await p.locator('#guest-name').fill('Test Guest');await p.locator('#guest-email').fill('private@example.com');await p.locator('#guest-city').fill('San Clemente');await p.locator('#guest-state').fill('CA');await p.locator('#rememberGuest').check();await p.locator('#guest-memory').fill('First story');
await p.locator('#guestbookForm button[type=submit]').click();await p.locator('#returningGuest').waitFor({state:'visible'});
assert.equal(await p.locator('#add-memory').isVisible(),false);
let pin=await p.locator('.map-pin').first().getAttribute('style');await p.reload();await p.locator('#returningGuest').waitFor({state:'visible'});
assert.equal(await p.locator('.map-pin').first().getAttribute('style'),pin);
await p.locator('#addAnotherMemory').click();assert.equal(await p.locator('#guest-email').inputValue(),'private@example.com');
await p.locator('#guest-memory').fill('Second story');await p.locator('#guestbookForm button[type=submit]').click();await p.locator('#returningGuest').waitFor({state:'visible'});
await p.locator('.map-pin-group').click();await p.locator('#allMemoriesModal').waitFor({state:'visible'});assert.equal(await p.locator('#allMemoriesList button').count(),2);await p.locator('#closeMemoriesButton').click();
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'guestbook overflow');
await p.locator('#viewAllMemoriesButton').click();await p.waitForURL('**/memories?t=test-token');await p.getByText('Second story',{exact:true}).waitFor();
assert(!(await p.locator('#memoriesCollage').innerText()).includes('private@example.com'));
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'memories overflow');
await p.getByRole('link',{name:'Add Another Memory',exact:true}).click();await p.locator('#guest-photo').waitFor({state:'visible'});
assert.equal(await p.locator('#guest-email').inputValue(),'private@example.com');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
await p.locator('#guest-photo').setInputFiles([{name:'photo.png',mimeType:'image/png',buffer:png},{name:'video.mp4',mimeType:'video/mp4',buffer:Buffer.from('test')}]);
assert.equal(await p.locator('#guest-memory').inputValue(),'');await p.evaluate(()=>window.loseResponse=true);
await p.locator('#guestbookForm button[type=submit]').click();await p.getByRole('button',{name:'Retry Submission'}).waitFor();
await p.getByRole('button',{name:'Retry Submission'}).click();await p.getByText(/Your photos and videos are saved for admin approval/).waitFor();
assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('test-rows')).length),4);
await p.screenshot({path:output+'/returning-mobile.png',fullPage:true});
await p.goto(origin+'/memories');await p.getByText('Second story',{exact:true}).waitFor();assert.equal(await p.locator('.collage-card').count(),2);
await p.goto(origin+'/playlist');await p.locator('#celebrationVideo').waitFor({state:'visible'});
assert.equal(await p.locator('#celebrationVideoPlayer iframe').count(),0);
assert(await p.locator('#playlistExperience').evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('#celebrationVideo')) & Node.DOCUMENT_POSITION_FOLLOWING)));
await p.locator('#watchCelebrationVideo').click();
await p.locator('#celebrationVideoModal').waitFor({state:'visible'});
const frame=p.locator('#celebrationVideoPlayer iframe');assert.equal(await frame.getAttribute('src'),'https://www.youtube.com/embed/70u9L5ybRD4?autoplay=1');assert.equal(await frame.getAttribute('allowfullscreen'),'');
const size=await frame.evaluate(el=>({width:el.clientWidth,height:el.clientHeight}));assert(Math.abs(size.width/size.height-16/9)<.02);
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'playlist overflow');await p.screenshot({path:output+'/playlist-mobile.png',fullPage:true});
await p.keyboard.press('Escape');
await p.locator('#celebrationVideoModal').waitFor({state:'hidden'});
assert.equal(await p.locator('#celebrationVideoPlayer iframe').count(),0);
await p.goto(origin+'/admin.html');await p.evaluate(()=>{document.querySelectorAll('[hidden]').forEach(el=>el.hidden=false);document.querySelector('[data-workspace-tab="celebration"]').dispatchEvent(new Event('click'));});
await p.getByRole('button',{name:'Approve Media',exact:true}).first().click();await p.getByRole('button',{name:'Hide Media',exact:true}).waitFor();
await p.goto(origin+'/memories');await p.locator('.video-memory-label').waitFor();await p.locator('.video-memory-label').click();assert.equal(await p.locator('#memoryModal video').count(),1);
await p.evaluate(()=>{const rows=JSON.parse(localStorage.getItem('test-rows'));rows.find(r=>r.photo_mime_type==='video/mp4').is_hidden=true;localStorage.setItem('test-rows',JSON.stringify(rows));window.dispatchEvent(new Event('focus'));});await p.locator('#memoryModal').waitFor({state:'hidden'});assert.equal(await p.locator('.video-memory-label').count(),0);
await p.setViewportSize({width:1440,height:1000});await p.goto(origin+'/guestbook.html');await p.locator('#returningGuest').waitFor({state:'visible'});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:output+'/guestbook-desktop.png',fullPage:true});
await p.locator('#differentGuest').click();await p.reload();await p.locator('#guest-name').waitFor({state:'visible'});assert.equal(await p.locator('#guest-name').inputValue(),'');
assert.deepEqual(errors,[]);console.log('PASS: access gate; remembered/forgotten guest; repeat stories; persistent tappable map clusters; direct Memories navigation; private emails; optional-story photo/video batch and retry; pending-media exclusion; admin approval; hidden media removed; responsive video; mobile/desktop overflow.');await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
