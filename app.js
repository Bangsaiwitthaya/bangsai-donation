/* GitHub Pages Public UI. Never put API secrets or admin passwords here. */
const SETTINGS={
  WORKER_URL:'https://bangsai-donation-api.academicbangsaiwit.workers.dev',
  ADMIN_APP_URL:'' // Optional: Existing Apps Script /exec URL, for school staff only
};
const $=id=>document.getElementById(id);
let typingTimer=0,searchSequence=0;
function busy(on,msg='กำลังดำเนินการ...'){$('overlay').classList.toggle('show',on);$('overlayText').textContent=msg}
function message(id,txt,error=false){const e=$(id);e.className='message show'+(error?' error':'');e.textContent=txt}
async function api(action,payload={}){
 if(!SETTINGS.WORKER_URL.startsWith('https://'))throw new Error('ยังไม่ได้ตั้งค่า WORKER_URL ใน app.js');
 let response;
 try{response=await fetch(SETTINGS.WORKER_URL,{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})})}
 catch(e){throw new Error('เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบ Worker URL และการตั้งค่า CORS')}
 const out=await response.json();if(!response.ok||!out.ok)throw new Error(out.error||'ไม่สามารถดำเนินการได้');return out.data;
}
function download(data,name){const a=document.createElement('a');a.href=data;a.download=name;document.body.append(a);a.click();a.remove()}
function cleanAmount(v){v=String(v).replace(/[^0-9.]/g,'');const first=v.indexOf('.');if(first!==-1)v=v.slice(0,first+1)+v.slice(first+1).replace(/\./g,'').slice(0,2);return v}
function fileData(file){return new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=()=>reject(new Error('ไม่สามารถอ่านไฟล์ได้'));f.readAsDataURL(file)})}
function img(uri){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('เปิดรูปไม่ได้'));i.src=uri})}
async function heicToJpeg(f){
 if(typeof window.heic2any!=='function'){
   await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('โหลดตัวแปลง HEIC ไม่สำเร็จ'));document.head.append(s)});
 }
 const b=await window.heic2any({blob:f,toType:'image/jpeg',quality:.88});return Array.isArray(b)?b[0]:b;
}
async function processImage(file){
 if(!file)return null;
 const isHeic=/\.(heic|heif)$/i.test(file.name)||/image\/(heic|heif)/i.test(file.type);
 let f=isHeic?await heicToJpeg(file):file;
 if(!/^image\/(jpeg|png|webp)$/i.test(f.type))throw new Error('รองรับ JPG PNG WEBP และ HEIC/HEIF');
 if(f.size>6*1024*1024||isHeic){
  const original=await img(await fileData(f)),scale=Math.min(1,2200/Math.max(original.naturalWidth,original.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.round(original.naturalWidth*scale);canvas.height=Math.round(original.naturalHeight*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(original,0,0,canvas.width,canvas.height);
  let uri=canvas.toDataURL('image/jpeg',.85);
  if(uri.length>7_500_000)uri=canvas.toDataURL('image/jpeg',.66);
  if(uri.length>7_500_000)throw new Error('รูปใหญ่เกินไป กรุณาใช้รูปขนาดเล็กลง');return uri;
 }
 return fileData(f);
}
async function submit(e){
 e.preventDefault();const amount=cleanAmount($('amount').value);$('amount').value=amount;
 if(!/^\d+(?:\.\d{1,2})?$/.test(amount)||Number(amount)<=0)return message('submitMessage','กรุณากรอกจำนวนเงินเป็นตัวเลขที่มากกว่า 0 เท่านั้น',true);
 if(!$('consent').checked)return message('submitMessage','กรุณายืนยันความยินยอม',true);
 $('submitBtn').disabled=true;busy(true,'กำลังเตรียมรูปภาพและส่งข้อมูล...');
 try{
  const payload={name:$('name').value.trim(),amount,type:$('type').value,consent:true,showAmount:$('showAmount').checked,
   photo:await processImage($('photo').files[0]),slip:await processImage($('slip').files[0])};
  if(!payload.slip)throw new Error('กรุณาแนบหลักฐานการโอนเงิน');
  const r=await api('submit',payload);
  message('submitMessage','ส่งข้อมูลสำเร็จ เลขรายการ '+r.id+' — รหัสติดตาม: '+r.trackingToken+' (กรุณาบันทึกรหัสนี้ไว้)');
  $('donorForm').reset();
 }catch(e){message('submitMessage',e.message,true)}finally{$('submitBtn').disabled=false;busy(false)}
}
function statusThai(s){return {PENDING:'รอตรวจสอบ',APPROVED:'อนุมัติแล้ว',REJECTED:'ไม่ผ่านการตรวจสอบ'}[s]||s}
function addResult(root,r){
 const div=document.createElement('div');div.className='result';const meta=document.createElement('div');
 const name=document.createElement('b');name.textContent=r.name;meta.append(name);
 const small=document.createElement('small');small.textContent=statusThai(r.status)+(r.hasCard?' • บัตรพร้อมแล้ว':' • ยังไม่มีบัตร');meta.append(small);
 const btn=document.createElement('button');btn.textContent=r.hasCard?'ดาวน์โหลดบัตร':'ยังไม่พร้อม';btn.disabled=!r.hasCard;
 btn.addEventListener('click',()=>getCard(r.id));div.append(meta,btn);root.append(div);
}
async function search(){const term=$('searchName').value.trim(),seq=++searchSequence;const root=$('results');root.replaceChildren();
 if(term.length<2){root.textContent='พิมพ์ชื่ออย่างน้อย 2 ตัวอักษร';return}
 root.textContent='กำลังค้นหา...';try{const list=await api('search',{term});if(seq!==searchSequence)return;root.replaceChildren();if(!list.length)root.textContent='ไม่พบชื่อที่ค้นหา';else list.forEach(r=>addResult(root,r))}
 catch(e){if(seq===searchSequence)root.textContent=e.message}
}
async function getCard(id){busy(true,'กำลังดาวน์โหลดบัตรขอบคุณ');try{const res=await api('card',{id});download(res.data,'CARD_'+res.id+'.png')}catch(e){alert(e.message)}finally{busy(false)}}
async function track(){busy(true,'กำลังค้นหาข้อมูล');try{const token=$('trackCode').value.trim(),r=await api('track',{token});message('trackResult',`${r.id} — ${r.name} — ${statusThai(r.status)}${r.hasCard?' — บัตรพร้อมแล้ว':' — รอจัดทำบัตร'}`);
 if(r.hasCard){const b=document.createElement('button');b.className='btn';b.textContent='ดาวน์โหลดบัตรของฉัน';b.onclick=async()=>{busy(true,'กำลังดาวน์โหลด');try{const v=await api('myCard',{token});download(v.data,'CARD_'+v.id+'.png')}catch(e){alert(e.message)}finally{busy(false)}};$('trackResult').append(document.createElement('br'),b)}}catch(e){message('trackResult',e.message,true)}finally{busy(false)}}
window.addEventListener('DOMContentLoaded',()=>{
 $('amount').addEventListener('input',e=>{e.target.value=cleanAmount(e.target.value)});
 $('donorForm').addEventListener('submit',submit);
 $('searchName').addEventListener('input',()=>{clearTimeout(typingTimer);typingTimer=setTimeout(search,320)});
 $('trackBtn').addEventListener('click',track);
 $('saveQr').addEventListener('click',()=>{const a=document.createElement('a');a.href='assets/edonation-qr.png';a.download='eDonation_Bangsaiwitthaya.png';a.click()});
 if(SETTINGS.ADMIN_APP_URL){const a=document.createElement('a');a.href=SETTINGS.ADMIN_APP_URL;a.target='_blank';a.rel='noopener noreferrer';a.textContent='เข้าสู่ระบบสำหรับเจ้าหน้าที่';$('adminLink').append(a)}
});
