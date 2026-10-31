import { fetchFile } from 'https://esm.sh/@ffmpeg/util@0.12.1';
import { callHook, getWorkspaceToken, workspaceFetch } from '../workspace';
import { runFfmpegJob } from '../ffmpeg-runtime';
import type { ActorBlueprint } from '../../apps/UGCStudio/actorCatalog';
import { UGC_RUNWAY_CREDITS_PER_SECOND } from '../regions';
import { authorizeCredits, newChargeKey, refundCreditsStrict } from '../credits';

export type UgcMode = 'actor-speaks' | 'voiceover';
export type UgcFormat = 'talking-camera' | 'demo' | 'unboxing' | 'before-after' | 'problem-solution';
export type UgcClip = { id: string; role: 'hook'|'demo'|'cta'|'closeup'; duration: number; line: string; setting: string; stillId: string; stillUrl: string; status?: string; videoUrl?: string; error?: string };
export type UgcActor = ActorBlueprint & { actor_key?: string; region_id?: string; age_range?: string; sheet_url?: string; stills?: Array<{id:string;url:string;setting:string;outfit:string;pose:string}>; voice_sample_url?: string; status?: string; owner_email?: string|null };
export type UgcPlan = { clips: UgcClip[]; totalDuration: number; language: string; format: UgcFormat; mode: UgcMode };

function errorFrom(data: any, fallback: string): string { return String(data?.error?.message || data?.error || data?.message || fallback); }
export function wordCount(value: string): number { return String(value || '').trim().split(/\s+/).filter(Boolean).length; }
export function speechBudget(duration: number, language: string): number { return Math.max(4, Math.floor(duration * (language.startsWith('hi') ? 2.25 : 2.45))); }
export function vvCreditsForDuration(seconds: number): number { return Math.ceil(Math.max(0, seconds) * UGC_RUNWAY_CREDITS_PER_SECOND); }

export async function seedAndLoadActors(blueprints: ActorBlueprint[]): Promise<{actors:UgcActor[];customLimit:number;customCount:number;plan:string}> {
  await callHook('ugc-actors', { op: 'seed', actors: blueprints });
  const result = await callHook<any>('ugc-actors', { op: 'list' });
  return { actors: Array.isArray(result?.actors) ? result.actors : [], customLimit:Number(result?.customLimit)||0, customCount:Number(result?.customCount)||0, plan:String(result?.plan||'free') };
}

export async function planScript(input: { brand?: unknown; product: string; format: UgcFormat; length: number; language: string; actor: UgcActor; mode: UgcMode }): Promise<UgcPlan> {
  const token = await getWorkspaceToken();
  if (!token) throw new Error('Workspace authentication is required to plan the script.');
  const clipCount = input.length <= 15 ? 1 : input.length <= 23 ? 2 : 3;
  const durations = Array.from({ length: clipCount }, (_, index) => {
    const left = input.length - Math.floor(input.length / clipCount) * index;
    return index === clipCount - 1 ? left : Math.floor(input.length / clipCount);
  }).map((d) => Math.max(4, Math.min(15, d)));
  const response = await fetch('/proxy/openai/v1/chat/completions', {
    method:'POST', headers:{'Content-Type':'application/json','X-Workspace-DB-Token':token},
    body:JSON.stringify({ model:'gpt-6.1-sol', reasoning_effort:'medium', max_completion_tokens:6000, response_format:{type:'json_object'}, messages:[{role:'system',content:'You plan truthful UGC-style product presenter ads. The presenter is synthetic and may demonstrate or explain, but must never claim to be a real customer or claim personal results. Use only claims present in the supplied brand/product context. Return JSON only.'},{role:'user',content:JSON.stringify({ task:'Write one editable line and physical action per clip.', product:input.product, brand:input.brand||null, format:input.format, language:input.language, mode:input.mode, actor:{persona:input.actor.persona,look:input.actor.look}, durations, requirements:['Natural spoken language','No captions, logos, or on-screen text','Each line must fit its clip','Use Roman Hinglish for hi-Latn and Devanagari for hi-Deva'], schema:{clips:[{role:'hook|demo|cta',line:'string',action:'string',delivery:'warm|energetic|calm'}]}})}] })
  });
  const data = await response.json().catch(()=>null); if(!response.ok) throw new Error(errorFrom(data,'Script planning failed.'));
  const raw = data?.choices?.[0]?.message?.content; const parsed = typeof raw==='string'?JSON.parse(raw):raw;
  const source = Array.isArray(parsed?.clips)?parsed.clips:[];
  const stills = Array.isArray(input.actor.stills)?input.actor.stills:[];
  const clips = durations.map((duration,index)=>{ const item=source[index]||{}; const still=stills[index%Math.max(1,stills.length)]||{id:`${input.actor.id||input.actor.actor_key}-sheet`,url:input.actor.sheet_url||input.actor.sheetUrl||'',setting:input.actor.settings[index%input.actor.settings.length]}; return { id:`clip-${index+1}`, role:(index===0?'hook':index===durations.length-1?'cta':'demo') as UgcClip['role'], duration, line:String(item.line||''), setting:String(still.setting||input.actor.settings[index%input.actor.settings.length]||'bright home'), stillId:String(still.id||`still-${index+1}`), stillUrl:String(still.url||''), action:String(item.action||'demonstrates the product') } as UgcClip & {action:string}; });
  return { clips, totalDuration:durations.reduce((a,b)=>a+b,0), language:input.language, format:input.format, mode:input.mode };
}

export function buildUserConcept(clip: UgcClip & {action?:string}, language: string, mode: UgcMode, delivery='warm'): string {
  const speech = language==='hi-Latn'?'natural Hinglish (Hindi-English mix) in Roman script':language==='hi-Deva'?'natural Hindi in Devanagari':language;
  if(mode==='voiceover') return `${clip.setting}. The same actor ${clip.action||'shows and uses the product'} and reacts naturally without talking to camera. Voiceover line: "${clip.line}". Delivery: ${delivery}. No captions, no logos, no on-screen text.`;
  return `${clip.setting}. The same actor ${clip.action||'shows and uses the product'}. Exact spoken line: "${clip.line}". Speaks in ${speech}. Delivery: ${delivery}. No captions, no logos, no on-screen text.`;
}

export async function quoteUgc(input:{actorId:string;productImageUrl:string;language:string;mode:UgcMode;clips:UgcClip[]}):Promise<any>{
  return callHook('ugc-studio-runway',{op:'quote',actor_id:input.actorId,product_image_url:input.productImageUrl,language:input.language,audio:input.mode==='actor-speaks',ratio:'720:1280',clips:input.clips.map(c=>({...c,userConcept:buildUserConcept(c,input.language,input.mode)}))});
}
export async function startUgc(input:{actorId:string;productImageUrl:string;language:string;mode:UgcMode;clips:UgcClip[];quote:any;sourceBlueprint?:unknown}):Promise<any>{
  const seconds = input.clips.reduce((sum, clip) => sum + Math.max(0, Number(clip.duration) || 0), 0);
  const entryKey = newChargeKey('ugc');
  await authorizeCredits({ seconds, entryKey, source: 'ugc-runway', note: `UGC Studio · ${seconds}s` });
  try {
    const result = await callHook<any>('ugc-studio-runway',{op:'start',actor_id:input.actorId,product_image_url:input.productImageUrl,language:input.language,audio:input.mode==='actor-speaks',ratio:'720:1280',clips:input.clips.map(c=>({...c,userConcept:buildUserConcept(c,input.language,input.mode)})),approved:true,approved_vidverge_credits:Number(input.quote?.vidvergeCredits),quote_fingerprint:String(input.quote?.fingerprint||''),credit_entry_key:entryKey,source_blueprint:input.sourceBlueprint||null});
    if (result?.refunded === true) {
      await refundCreditsStrict(entryKey, 'UGC provider work did not start');
    }
    return result;
  } catch (error: any) {
    const status = Math.round(Number(error?.status) || 0);
    // Refund only a confirmed client rejection. A network-uncertain request may
    // already have created the email-owned durable job, so it must stay charged
    // until that job's provider outcome reconciles it.
    if (status >= 400 && status < 500) {
      await refundCreditsStrict(entryKey, 'UGC provider work did not start').catch(() => undefined);
    }
    throw error;
  }
}
export async function startOmniByChoice(jobId:number, seconds:number):Promise<any>{
  const entryKey = newChargeKey('ugc-omni');
  await authorizeCredits({ seconds, entryKey, source: 'ugc-omni', note: `UGC Studio Omni alternative · ${seconds}s` });
  try {
    const result = await callHook<any>('ugc-studio-runway',{op:'omni_start',job_id:jobId,approved:true,credit_entry_key:entryKey});
    if (result?.success === false) await refundCreditsStrict(entryKey, 'UGC Omni alternative did not start');
    return result;
  } catch (error: any) {
    const status = Math.round(Number(error?.status) || 0);
    if (status >= 400 && status < 500) {
      await refundCreditsStrict(entryKey, 'UGC Omni alternative was rejected before submission').catch(() => undefined);
    }
    throw error;
  }
}
export async function loadUgcJob(jobId:number,resume=true):Promise<any>{ return callHook('ugc-studio-runway',{op:'status',job_id:jobId,resume}); }
export async function listUgcJobs():Promise<any[]>{ const data=await callHook<any>('ugc-studio-runway',{op:'list'}); return Array.isArray(data?.jobs)?data.jobs:[]; }

async function uploadVideo(blob:Blob):Promise<string>{ const form=new FormData(); form.append('file',new File([blob],`ugc-${Date.now()}.mp4`,{type:'video/mp4'})); form.append('folder','ugc-studio'); const response=await workspaceFetch('/api/upload/file',{method:'POST',body:form}); const data=await response.json().catch(()=>null); if(!response.ok||!data?.url) throw new Error(errorFrom(data,'Final video upload failed.')); return String(data.url); }
async function dimensions(blob:Blob):Promise<{width:number;height:number}>{ return new Promise((resolve,reject)=>{ const url=URL.createObjectURL(blob); const video=document.createElement('video'); video.preload='metadata'; video.onloadedmetadata=()=>{const result={width:video.videoWidth,height:video.videoHeight};URL.revokeObjectURL(url);resolve(result)}; video.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not verify final video geometry.'))}; video.src=url; }); }

export async function assemblePortraitClips(jobId:number, clips:Array<{url:string;duration:number}>, voiceovers:string[]=[]):Promise<{url:string;width:number;height:number,bytes:number}>{
  if(!clips.length) throw new Error('No completed clips are available to join.');
  return runFfmpegJob(async(ff)=>{ const inputs:string[]=[]; const cleanup:string[]=[];
    for(let i=0;i<clips.length;i+=1){const name=`clip_${i}.mp4`;await ff.writeFile(name,await fetchFile(clips[i].url));inputs.push('-i',name);cleanup.push(name);if(voiceovers[i]){const audio=`voice_${i}.mp3`;await ff.writeFile(audio,await fetchFile(voiceovers[i]));inputs.push('-i',audio);cleanup.push(audio)}}
    const videoLabels=clips.map((_,i)=>`[${voiceovers.length?i*2:i}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30[v${i}]`).join(';');
    const videoConcat=clips.map((_,i)=>`[v${i}]`).join('')+`concat=n=${clips.length}:v=1:a=0[vout]`;
    let audioFilter=''; let audioMap:string[]=[];
    if(voiceovers.length===clips.length){ const audioIndexes=clips.map((_,i)=>i*2+1); audioFilter=audioIndexes.map((idx,i)=>`[${idx}:a]loudnorm=I=-16:TP=-1.5:LRA=11[a${i}]`).join(';'); let current='a0'; for(let i=1;i<audioIndexes.length;i+=1){const out=`ax${i}`;audioFilter+=`;[${current}][a${i}]acrossfade=d=0.2:c1=tri:c2=tri[${out}]`;current=out} audioMap=['-map',`[${current}]`]; }
    else { const audioIndexes=clips.map((_,i)=>i); audioFilter=audioIndexes.map((idx,i)=>`[${idx}:a]loudnorm=I=-16:TP=-1.5:LRA=11[a${i}]`).join(';'); let current='a0'; for(let i=1;i<audioIndexes.length;i+=1){const out=`ax${i}`;audioFilter+=`;[${current}][a${i}]acrossfade=d=0.2:c1=tri:c2=tri[${out}]`;current=out} audioMap=['-map',`[${current}]`]; }
    const filter=[videoLabels,videoConcat,audioFilter].filter(Boolean).join(';'); const rc=await ff.exec([...inputs,'-filter_complex',filter,'-map','[vout]',...audioMap,'-c:v','libx264','-preset','ultrafast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','final.mp4']); if(rc!==0) throw new Error('Portrait assembly failed. Your completed clips are still available.');
    const bytes=await ff.readFile('final.mp4'); const blob=new Blob([bytes],{type:'video/mp4'}); const size=await dimensions(blob); if(size.height<=size.width) throw new Error(`Final geometry was ${size.width}×${size.height}; portrait delivery was blocked.`); const url=await uploadVideo(blob); await callHook('ugc-studio-runway',{op:'complete_assembly',job_id:jobId,video_url:url,width:size.width,height:size.height}); for(const name of cleanup)try{await ff.deleteFile(name)}catch{}; return {url,width:size.width,height:size.height,bytes:blob.size};
  },{label:'UGC portrait assembly',timeoutMs:8*60_000,cleanup:['final.mp4']});
}

export async function generateActorFaceOptions(description:string):Promise<string[]>{
  await callHook('ugc-actors',{op:'custom_prepare',description}); const token=await getWorkspaceToken(); if(!token) throw new Error('Workspace authentication is required.'); const urls:string[]=[];
  for(let i=0;i<4;i+=1){const response=await fetch('/api/generate/image',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-DB-Token':token},body:JSON.stringify({prompt:`Create option ${i+1} of a photorealistic fictional synthetic UGC actor. ${description}. Head and upper body, natural daylight, neutral background, natural hands, no text, no watermark, no logo, and must not resemble a public figure.`,aspectRatio:'3:4',quality:'standard'})});const data=await response.json().catch(()=>null);if(!response.ok||!data?.imageUrl)throw new Error(errorFrom(data,'Actor face generation failed.'));urls.push(String(data.imageUrl));}
  return urls;
}
