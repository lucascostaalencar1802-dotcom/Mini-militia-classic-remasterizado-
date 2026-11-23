const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const server = http.createServer((req,res)=>{
  let pathname = decodeURIComponent((req.url||'/').split('?')[0]);
  if(pathname==='/') pathname='/index.html';
  const file = path.join(ROOT, pathname);
  if(!file.startsWith(ROOT)){res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404);return res.end('Not found');}
    const ext=path.extname(file);
    res.writeHead(200,{'Content-Type':ext==='.html'?'text/html; charset=utf-8':'application/octet-stream'});
    res.end(data);
  });
});
const wss = new WebSocket.Server({server});
const players = new Map(), bullets=[];
const platforms=[
 {x:0,y:820,w:2400,h:80},{x:220,y:660,w:300,h:22},{x:650,y:560,w:280,h:22},
 {x:1050,y:690,w:310,h:22},{x:1510,y:560,w:300,h:22},{x:1900,y:680,w:300,h:22},
 {x:900,y:390,w:260,h:20},{x:1430,y:350,w:230,h:20}
];
let nextBot=0;
function send(ws,obj){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj))}
function broadcast(obj){const s=JSON.stringify(obj);for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN)ws.send(s)}
function spawn(id,name,isBot=false){return {id,name,x:120+Math.random()*180,y:760,vx:0,vy:0,hp:100,ammo:12,kills:0,facing:1,jet:false,onGround:false,isBot,lastShot:0,reloadAt:0,keys:{}}}
function collide(p){
 p.onGround=false;
 for(const q of platforms){
  if(p.x+10>q.x&&p.x-10<q.x+q.w&&p.y+28>q.y&&p.y+18<q.y+q.h&&p.vy>=0){
   p.y=q.y-28;p.vy=0;p.onGround=true;
  }
 }
 if(p.y>900){p.hp=0}
 p.x=Math.max(12,Math.min(2388,p.x));
}
function update(){
 const now=Date.now();
 // Keep a few practice bots in the arena
 const humanCount=[...players.values()].filter(p=>!p.isBot).length;
 const botCount=[...players.values()].filter(p=>p.isBot).length;
 if(humanCount>0&&botCount<3&&now-nextBot>5000){const id='bot'+(++nextBot);players.set(id,spawn(id,'BOT '+nextBot,true));nextBot=now}
 for(const p of players.values()){
  if(p.hp<=0){p.hp=100;p.x=120+Math.random()*150;p.y=760;p.vx=p.vy=0;p.ammo=12;continue}
  let k=p.keys||{};
  if(p.isBot){
   const target=[...players.values()].find(q=>!q.isBot&&q.hp>0);
   if(target){k={left:target.x<p.x-30,right:target.x>p.x+30,jump:Math.random()<.018,jet:Math.abs(target.y-p.y)>80,shoot:Math.abs(target.x-p.x)<520};p.keys=k}
  }
  const dir=(k.right?1:0)-(k.left?1:0);
  p.vx=dir*3.3;if(dir)p.facing=dir;
  if(k.jump&&p.onGround){p.vy=-9.2;p.onGround=false}
  p.jet=!!k.jet;
  if(k.jet&&p.y>80)p.vy-=.48;
  p.vy=Math.min(10,p.vy+.42);
  p.x+=p.vx;p.y+=p.vy;collide(p);
  if(k.reload&&p.ammo<12){p.ammo=12}
  if(k.shoot&&p.ammo>0&&now-p.lastShot>260){
   p.lastShot=now;p.ammo--;bullets.push({x:p.x+p.facing*20,y:p.y-12,vx:p.facing*9,owner:p.id,life:85});
  }
 }
 for(let i=bullets.length-1;i>=0;i--){
  const b=bullets[i];b.x+=b.vx;b.life--;
  let hit=false;
  for(const p of players.values()){
   if(p.id===b.owner||p.hp<=0)continue;
   if(Math.abs(p.x-b.x)<14&&Math.abs((p.y-12)-b.y)<22){
    p.hp-=22;hit=true;
    const shooter=players.get(b.owner);if(p.hp<=0&&shooter)shooter.kills++;
    const ws=[...wss.clients].find(c=>c.id===p.id);if(ws)send(ws,{type:'hit',id:p.id});
    break;
   }
  }
  if(hit||b.life<=0||b.x<0||b.x>2400)bullets.splice(i,1);
 }
}
wss.on('connection',ws=>{
 ws.id='p'+Math.random().toString(36).slice(2,10);
 ws.on('message',raw=>{
  let m;try{m=JSON.parse(raw)}catch{return}
  if(m.type==='join'){
   const p=spawn(ws.id,String(m.name||'Player').slice(0,14));players.set(ws.id,p);
   send(ws,{type:'welcome',id:ws.id,player:p});
   send(ws,{type:'notice',text:'Bem-vindo à arena!'});
  } else if(m.type==='input'){
   const p=players.get(ws.id);if(p&&m.keys&&typeof m.keys==='object')p.keys=m.keys;
  }
 });
 ws.on('close',()=>players.delete(ws.id));
});
setInterval(()=>{
 update();
 const state={type:'state',players:Object.fromEntries(players),bullets};
 broadcast(state);
},33);
server.listen(PORT, '0.0.0.0', ()=>console.log('Mini Militia Classic Remasterizado online na porta '+PORT));