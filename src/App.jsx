import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import { Heart, MessageCircle, Share2, Settings, X, Camera, Home, Plus, User, Pencil, Trash2, LogOut, Download, Sun, Moon, Check, MoreVertical, Info } from "lucide-react";

const THEMES = {
  dark: {
    bg:"#0a0f1e", panel:"#0f1729", border:"#1e2d4a",
    accent:"#00c8ff", accentDim:"#0077aa",
    text:"#e8f0ff", textDim:"#5a7090",
    point:"#00ffaa", line:"#ff6b35",
    canvas:"#050a14", uploadBg:"#0a1320",
  },
  light: {
    bg:"#f0f4f8", panel:"#ffffff", border:"#c8d8e8",
    accent:"#0077cc", accentDim:"#005599",
    text:"#1a2838", textDim:"#7090b0",
    point:"#007a50", line:"#cc4400",
    canvas:"#e4edf5", uploadBg:"#dce8f2",
  },
};
let C = THEMES.dark;

const DIVISIONS = [0, 25, 50, 75, 100];
const SNAP_THRESHOLD = 40;
const ONBOARDING_KEY = "leech_onboarding_v1";
const ADMIN_EMAIL = "nasaxajtakuji0930@gmail.com";

function getGuideY(top, bot, pct) {
  return { x: top.x + (bot.x - top.x) * pct / 100, y: top.y + (bot.y - top.y) * pct / 100 };
}
function findSnap(y, top, bot) {
  let best = null, bestDist = Infinity;
  for (const pct of DIVISIONS) {
    const d = Math.abs(y - getGuideY(top, bot, pct).y);
    if (d < SNAP_THRESHOLD && d < bestDist) { best = pct; bestDist = d; }
  }
  return best;
}
function computeMetrics(pts) {
  if (pts.length < 2) return null;
  const top = pts[0], bot = pts[pts.length - 1];
  const cl = Math.sqrt((bot.x-top.x)**2+(bot.y-top.y)**2);
  if (!cl) return null;
  const dists = pts.map(p => {
    const t = ((p.x-top.x)*(bot.x-top.x)+(p.y-top.y)*(bot.y-top.y))/cl**2;
    const cx=top.x+t*(bot.x-top.x), cy=top.y+t*(bot.y-top.y);
    return { dist: Math.sqrt((p.x-cx)**2+(p.y-cy)**2), t: Math.max(0,Math.min(1,t)) };
  });
  const mx = dists.reduce((a,b)=>a.dist>b.dist?a:b);
  const td={dx:pts[1].x-pts[0].x,dy:pts[1].y-pts[0].y};
  const bd={dx:pts[pts.length-1].x-pts[pts.length-2].x,dy:pts[pts.length-1].y-pts[pts.length-2].y};
  let tw=Math.round((Math.atan2(bd.dy,bd.dx)-Math.atan2(td.dy,td.dx))*180/Math.PI);
  if(tw>180)tw-=360; if(tw<-180)tw+=360;
  return { draftPosition: Math.round(mx.t*100), maxDraft: Math.round(mx.dist/cl*100), twist: Math.abs(tw) };
}

const today = () => new Date().toISOString().slice(0,10);
const EMPTY_COND = { boatClass:"", sailNumber:"", date:today(), location:"", windKnots:"", windDir:"", windStability:"", waveHeight:"", waveType:"", outhaul:"", cunningham:"", vang:"", comment:"" };

function mapSession(s) {
  return {
    id: s.id,
    userId: s.user_id,
    originalImageUrl: s.original_image_url,
    annotatedImageUrl: s.annotated_image_url,
    user: s.user_name,
    metrics: { draftPosition: s.draft_position, maxDraft: s.max_draft, twist: s.twist },
    cond: {
      boatClass: s.boat_class, sailNumber: s.sail_number, date: s.date, location: s.location,
      windKnots: s.wind_knots, windDir: s.wind_dir, windStability: s.wind_stability,
      waveHeight: s.wave_height, waveType: s.wave_type,
      outhaul: s.outhaul, cunningham: s.cunningham, vang: s.vang, comment: s.comment,
    },
  };
}

function exportCSV(sessions) {
  const headers = ["id","date","user","boatClass","sailNumber","location","draftPosition","maxDraft","twist","windKnots","windDir","windStability","waveHeight","waveType","outhaul","cunningham","vang","comment"];
  const rows = sessions.map(s => headers.map(h => {
    const v = ["draftPosition","maxDraft","twist"].includes(h) ? (s.metrics?.[h]??"") : h==="user" ? (s.user||"") : (s.cond?.[h]??s[h]??"");
    return `"${String(v).replace(/"/g,'""')}"`;
  }).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = `leech_log_${today()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function Chip({label,active,onClick}) {
  return <button onClick={onClick} style={{padding:"5px 11px",fontSize:10,fontFamily:"inherit",letterSpacing:"0.08em",borderRadius:20,border:`1px solid ${active?C.accent:C.border}`,background:active?"rgba(0,200,255,0.15)":"transparent",color:active?C.accent:C.textDim,cursor:"pointer"}}>{label}</button>;
}
function Field({label,children}) {
  return <div style={{display:"flex",flexDirection:"column",gap:5}}><div style={{fontSize:9,color:C.textDim,letterSpacing:"0.2em"}}>{label}</div>{children}</div>;
}
function TextIn({value,onChange,placeholder}) {
  return <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||"—"} style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 9px",color:C.text,fontSize:11,fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box"}}/>;
}
const BOAT_CLASSES=["470","SNIPE","420","FJ","Laser / ILCA 7","Laser Radial / ILCA 6","Laser 4.7 / ILCA 4","49er","29er","Finn","OK","Optimist","RS:X","J/24","505"];
function BoatClassIn({value,onChange}){
  return(
    <>
      <input value={value} onChange={e=>onChange(e.target.value)} list="boat-class-list" placeholder="艇種を選択 or 入力"
        style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 9px",color:C.text,fontSize:11,fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box"}}/>
      <datalist id="boat-class-list">
        {BOAT_CLASSES.map(b=><option key={b} value={b}/>)}
      </datalist>
    </>
  );
}
function LocationIn({value,onChange,pastLocations=[]}){
  return(
    <>
      <input value={value} onChange={e=>onChange(e.target.value)} list="location-list" placeholder="江の島, 琵琶湖..."
        style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 9px",color:C.text,fontSize:11,fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box"}}/>
      <datalist id="location-list">
        {pastLocations.map(l=><option key={l} value={l}/>)}
      </datalist>
    </>
  );
}
function Btn({children,onClick,disabled,secondary,style:sx}){
  return <button onClick={onClick} disabled={disabled} style={{background:secondary?"transparent":disabled?"#1a2a3a":C.accent,color:secondary?C.textDim:disabled?C.textDim:C.bg,border:`1px solid ${secondary?C.border:disabled?"#1a2a3a":C.accent}`,padding:"6px 12px",fontSize:11,fontFamily:"inherit",letterSpacing:"0.1em",cursor:disabled?"not-allowed":"pointer",borderRadius:4,fontWeight:700,whiteSpace:"nowrap",...sx}}>{children}</button>;
}
function Label({children}){ return <div style={{fontSize:9,color:C.textDim,letterSpacing:"0.22em",marginBottom:6}}>{children}</div>; }
function Metric({label,value,sub,active}){
  return <div><div style={{fontSize:9,color:C.textDim,letterSpacing:"0.18em",marginBottom:2}}>{label}</div><div style={{fontSize:20,fontWeight:700,color:active?C.accent:C.border,lineHeight:1,transition:"color 0.3s"}}>{value}</div><div style={{fontSize:9,color:C.textDim,marginTop:2}}>{sub}</div></div>;
}

function AuthScreen({onAuth}){
  const [isLogin,setIsLogin]=useState(true);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [err,setErr]=useState("");
  const [msg,setMsg]=useState("");
  const [loading,setLoading]=useState(false);

  const handle=async()=>{
    setErr("");setMsg("");setLoading(true);
    const{data,error}=isLogin
      ?await supabase.auth.signInWithPassword({email,password})
      :await supabase.auth.signUp({email,password});
    setLoading(false);
    if(error){setErr(error.message);return;}
    if(!isLogin&&!data.session){setMsg("確認メールを送信しました。メールを確認してからログインしてください。");return;}
    onAuth(data.session?.user??data.user);
  };

  return(
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{marginBottom:28,textAlign:"center"}}>
        <svg width="32" height="32" viewBox="0 0 28 28" fill="none" style={{marginBottom:8}}>
          <path d="M14 2 L26 24 L14 20 L2 24 Z" stroke={C.accent} strokeWidth="1.8" fill="none"/>
          <path d="M14 2 L14 20" stroke={C.accent} strokeWidth="1.2" opacity="0.5"/>
        </svg>
        <div style={{fontSize:14,fontWeight:700,letterSpacing:"0.14em",color:C.accent}}>LEECH ANALYZER</div>
        <div style={{fontSize:9,color:C.textDim,letterSpacing:"0.2em",marginTop:2}}>SAIL SHAPE LOGGER</div>
      </div>
      <div style={{width:"100%",maxWidth:340,background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:24,display:"flex",flexDirection:"column",gap:16}}>
        <div style={{display:"flex",borderRadius:4,overflow:"hidden",border:`1px solid ${C.border}`}}>
          {["ログイン","新規登録"].map((t,i)=>(
            <button key={t} onClick={()=>{setIsLogin(i===0);setErr("");setMsg("");}}
              style={{flex:1,padding:"8px",fontSize:10,fontFamily:"inherit",letterSpacing:"0.1em",border:"none",background:(isLogin?i===0:i===1)?"rgba(0,200,255,0.15)":"transparent",color:(isLogin?i===0:i===1)?C.accent:C.textDim,cursor:"pointer"}}>
              {t}
            </button>
          ))}
        </div>
        <Field label="メールアドレス"><TextIn value={email} onChange={setEmail} placeholder="sailor@example.com"/></Field>
        <Field label="パスワード">
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="8文字以上"
            style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 9px",color:C.text,fontSize:11,fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box"}}/>
        </Field>
        {err&&<div style={{fontSize:10,color:"#ff6b6b"}}>{err}</div>}
        {msg&&<div style={{fontSize:10,color:C.point,lineHeight:1.6}}>{msg}</div>}
        <button onClick={handle} disabled={loading||!email||!password}
          style={{background:loading||!email||!password?"#1a2a3a":C.accent,color:loading||!email||!password?C.textDim:C.bg,border:"none",borderRadius:4,padding:"10px",fontSize:11,fontFamily:"inherit",letterSpacing:"0.12em",fontWeight:700,cursor:loading||!email||!password?"not-allowed":"pointer"}}>
          {loading?"処理中...":(isLogin?"LOGIN →":"SIGN UP →")}
        </button>
      </div>
    </div>
  );
}

function SetupScreen({onDone}){
  const [username,setUsername]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  const handle=async()=>{
    if(!username.trim())return;
    setLoading(true);setErr("");
    const{data:{user}}=await supabase.auth.getUser();
    const{error}=await supabase.from("profiles").insert({id:user.id,username:username.trim()});
    setLoading(false);
    if(error){
      setErr(error.code==="23505"?"そのユーザー名はすでに使われています":error.message);
      return;
    }
    onDone(username.trim());
  };

  return(
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{marginBottom:28,textAlign:"center"}}>
        <svg width="32" height="32" viewBox="0 0 28 28" fill="none" style={{marginBottom:8}}>
          <path d="M14 2 L26 24 L14 20 L2 24 Z" stroke={C.accent} strokeWidth="1.8" fill="none"/>
          <path d="M14 2 L14 20" stroke={C.accent} strokeWidth="1.2" opacity="0.5"/>
        </svg>
        <div style={{fontSize:14,fontWeight:700,letterSpacing:"0.14em",color:C.accent}}>LEECH ANALYZER</div>
        <div style={{fontSize:9,color:C.textDim,letterSpacing:"0.2em",marginTop:2}}>SETUP</div>
      </div>
      <div style={{width:"100%",maxWidth:340,background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:24,display:"flex",flexDirection:"column",gap:16}}>
        <div style={{fontSize:11,color:C.text,lineHeight:1.8}}>
          ユーザー名を設定してください。<br/>フィードに表示される名前です。
        </div>
        <Field label="ユーザー名"><TextIn value={username} onChange={setUsername} placeholder="例: takuji"/></Field>
        {err&&<div style={{fontSize:10,color:"#ff6b6b"}}>{err}</div>}
        <button onClick={handle} disabled={loading||!username.trim()}
          style={{background:loading||!username.trim()?"#1a2a3a":C.accent,color:loading||!username.trim()?C.textDim:C.bg,border:"none",borderRadius:4,padding:"10px",fontSize:11,fontFamily:"inherit",letterSpacing:"0.12em",fontWeight:700,cursor:loading||!username.trim()?"not-allowed":"pointer"}}>
          {loading?"保存中...":"はじめる →"}
        </button>
      </div>
    </div>
  );
}

function Avatar({url,name,size=34}){
  return(
    <div style={{width:size,height:size,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.point})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:Math.round(size*0.4),fontWeight:700,color:C.bg,flexShrink:0,overflow:"hidden"}}>
      {url
        ?<img src={url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
        :(name||"?")[0].toUpperCase()
      }
    </div>
  );
}

function SessionCard({s,isOwn,isAdmin,onDelete,onEdit,avatarUrl,me,isFollowing,onFollow,onUnfollow}){
  const [expanded,setExpanded]=useState(false);
  const [showMenu,setShowMenu]=useState(false);
  const [confirming,setConfirming]=useState(false);
  const [likeCount,setLikeCount]=useState(0);
  const [userLiked,setUserLiked]=useState(false);
  const [showComments,setShowComments]=useState(false);
  const [comments,setComments]=useState(null);
  const [commentCount,setCommentCount]=useState(0);
  const [commentText,setCommentText]=useState("");
  const [replyingTo,setReplyingTo]=useState(null);
  const [replyText,setReplyText]=useState("");
  const [submitting,setSubmitting]=useState(false);
  const [copied,setCopied]=useState(false);

  const imgUrl=s.annotatedImageUrl||s.originalImageUrl;
  const cmt=s.cond?.comment;
  const isLong=cmt&&(cmt.length>55||cmt.includes("\n"));

  useEffect(()=>{
    supabase.from("likes").select("user_id").eq("session_id",s.id)
      .then(({data})=>{setLikeCount(data?.length||0);setUserLiked(data?.some(l=>l.user_id===me?.id)||false);});
    supabase.from("comments").select("id",{count:"exact",head:true}).eq("session_id",s.id)
      .then(({count})=>setCommentCount(count||0));
  },[s.id]);

  const handleLike=async()=>{
    if(userLiked){
      await supabase.from("likes").delete().eq("session_id",s.id).eq("user_id",me.id);
      setLikeCount(c=>c-1);setUserLiked(false);
    }else{
      await supabase.from("likes").insert({session_id:s.id,user_id:me.id});
      setLikeCount(c=>c+1);setUserLiked(true);
    }
  };

  const loadComments=async()=>{
    const{data}=await supabase.from("comments").select("*").eq("session_id",s.id).order("created_at",{ascending:true});
    setComments(data||[]);
  };

  const handleToggleComments=()=>{
    if(!showComments&&comments===null)loadComments();
    setShowComments(c=>!c);
  };

  const handleSubmitComment=async()=>{
    if(!commentText.trim()||submitting)return;
    setSubmitting(true);
    const{data,error}=await supabase.from("comments").insert({
      session_id:s.id,user_id:me.id,user_name:me.username,avatar_url:me.avatarUrl,
      body:commentText.trim(),parent_id:null,
    }).select().single();
    setSubmitting(false);
    if(error)return;
    setComments(prev=>[...(prev||[]),data]);
    setCommentCount(c=>c+1);
    setCommentText("");
  };

  const handleSubmitReply=async(parentId)=>{
    if(!replyText.trim()||submitting)return;
    setSubmitting(true);
    const{data,error}=await supabase.from("comments").insert({
      session_id:s.id,user_id:me.id,user_name:me.username,avatar_url:me.avatarUrl,
      body:replyText.trim(),parent_id:parentId,
    }).select().single();
    setSubmitting(false);
    if(error)return;
    setComments(prev=>[...(prev||[]),data]);
    setCommentCount(c=>c+1);
    setReplyText("");setReplyingTo(null);
  };

  const handleDeleteComment=async(commentId)=>{
    const toDelete=(comments||[]).filter(c=>c.id===commentId||c.parent_id===commentId);
    await supabase.from("comments").delete().eq("id",commentId);
    setComments(prev=>prev.filter(c=>c.id!==commentId&&c.parent_id!==commentId));
    setCommentCount(c=>c-toDelete.length);
  };

  const handleShare=async()=>{
    const imgUrl=s.annotatedImageUrl||s.originalImageUrl;
    const lines=[
      `${s.user||"—"} のセール形状 (${s.cond?.date||""}${s.cond?.location?` · ${s.cond.location}`:""})`,
      `Draft: ${s.metrics?.draftPosition}%  Max: ${s.metrics?.maxDraft}%  Twist: ${s.metrics?.twist}°`,
      s.cond?.windKnots?`🌬 ${s.cond.windKnots}kt${s.cond?.windDir?` · ${s.cond.windDir}`:""}`:null,
      s.cond?.comment?`"${s.cond.comment}"`:null,
      imgUrl?"— LEECH ANALYZER":null,
    ].filter(Boolean).join("\n");
    if(navigator.share){
      try{
        await navigator.share({title:"LEECH ANALYZER",text:lines,...(imgUrl?{url:imgUrl}:{})});
        return;
      }catch(e){if(e.name==="AbortError")return;}
    }
    navigator.clipboard?.writeText(lines).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)});
  };

  const topComments=(comments||[]).filter(c=>!c.parent_id);
  const getReplies=pid=>(comments||[]).filter(c=>c.parent_id===pid);

  return(
    <div style={{borderBottom:`1px solid ${C.border}`}}>
      {/* ヘッダー */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <Avatar url={avatarUrl} name={s.user}/>
          <div style={{fontSize:12,fontWeight:700,color:C.point,letterSpacing:"0.06em"}}>{s.user||"—"}</div>
          {!isOwn&&onFollow&&(
            <button onClick={()=>isFollowing?onUnfollow(s.userId):onFollow(s.userId)}
              style={{fontSize:9,padding:"2px 8px",borderRadius:10,border:`1px solid ${isFollowing?C.border:C.accent}`,background:isFollowing?"transparent":"rgba(0,200,255,0.1)",color:isFollowing?C.textDim:C.accent,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.05em",lineHeight:1.5}}>
              {isFollowing?"フォロー中":"フォロー"}
            </button>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
          <div style={{fontSize:10,color:C.textDim}}>{s.cond?.date}{s.cond?.location&&` · ${s.cond.location}`}</div>
          {(isOwn||isAdmin)&&(
            <>
              <button onClick={()=>{setShowMenu(m=>!m);setConfirming(false);}}
                style={{background:"none",border:"none",color:C.textDim,cursor:"pointer",padding:"0 4px",display:"flex",alignItems:"center"}}>
          <MoreVertical size={18} strokeWidth={1.8}/></button>
              {showMenu&&(
                <div style={{position:"absolute",top:24,right:0,background:C.panel,border:`1px solid ${C.border}`,borderRadius:6,zIndex:10,minWidth:110,boxShadow:"0 4px 16px rgba(0,0,0,0.3)",overflow:"hidden"}}>
                  {isOwn&&<><button onClick={()=>{onEdit(s);setShowMenu(false);}}
                    style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"10px 16px",background:"none",border:"none",color:C.text,fontSize:12,fontFamily:"inherit",textAlign:"left",cursor:"pointer"}}>
                    <Pencil size={14} strokeWidth={1.8}/>編集する</button>
                  <div style={{height:1,background:C.border}}/></>}
                  <button onClick={()=>{setConfirming(true);setShowMenu(false);}}
                    style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"10px 16px",background:"none",border:"none",color:"#ff6b6b",fontSize:12,fontFamily:"inherit",textAlign:"left",cursor:"pointer"}}>
                    <Trash2 size={14} strokeWidth={1.8}/>{isOwn?"削除する":"削除する（管理者）"}</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {/* 削除確認 */}
      {confirming&&(
        <div style={{padding:"8px 16px",background:"rgba(255,107,107,0.07)",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:11,color:C.textDim,flex:1}}>この投稿を削除しますか？</span>
          <button onClick={()=>{onDelete(s);setConfirming(false);}} style={{background:"#ff4444",border:"none",borderRadius:4,padding:"5px 12px",fontSize:11,color:"#fff",fontFamily:"inherit",fontWeight:700,cursor:"pointer"}}>削除</button>
          <button onClick={()=>setConfirming(false)} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 10px",fontSize:11,color:C.textDim,fontFamily:"inherit",cursor:"pointer"}}>キャンセル</button>
        </div>
      )}
      {/* 画像 */}
      {imgUrl&&<img src={imgUrl} style={{width:"100%",display:"block",maxHeight:400,objectFit:"contain",background:C.canvas}} alt="sail"/>}
      {/* メトリクス・コンディション・セールコメント */}
      <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",gap:24}}>
          {[["DRAFT",`${s.metrics?.draftPosition}%`],["MAX",`${s.metrics?.maxDraft}%`],["TWIST",`${s.metrics?.twist}°`]].map(([l,v])=>(
            <div key={l}><div style={{fontSize:8,color:C.textDim,letterSpacing:"0.15em"}}>{l}</div><div style={{fontSize:22,fontWeight:700,color:C.accent,lineHeight:1.1}}>{v}</div></div>
          ))}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {s.cond?.windKnots&&<span style={{fontSize:10,color:C.textDim}}>🌬 {s.cond.windKnots}kt{s.cond.windDir&&` · ${s.cond.windDir}`}{s.cond.windStability&&` · ${s.cond.windStability}`}</span>}
          {(s.cond?.waveHeight||s.cond?.waveType)&&<span style={{fontSize:10,color:C.textDim}}>🌊 {[s.cond.waveHeight,s.cond.waveType].filter(Boolean).join(" · ")}</span>}
        </div>
        {(s.cond?.outhaul||s.cond?.cunningham||s.cond?.vang)&&(
          <div style={{fontSize:10,color:C.textDim}}>
            {[s.cond.outhaul&&`アウト:${s.cond.outhaul}`,s.cond.cunningham&&`カニ:${s.cond.cunningham}`,s.cond.vang&&`バング:${s.cond.vang}`].filter(Boolean).join("  ·  ")}
          </div>
        )}
        {cmt&&(
          <div style={{borderLeft:`2px solid ${C.accentDim}`,paddingLeft:10,marginTop:2}}>
            <div style={{fontSize:12,color:C.text,lineHeight:1.7,overflow:"hidden",display:"-webkit-box",WebkitBoxOrient:"vertical",WebkitLineClamp:expanded?99:2}}>{cmt}</div>
            {isLong&&<button onClick={()=>setExpanded(e=>!e)} style={{background:"none",border:"none",padding:"2px 0",fontSize:11,color:C.accentDim,fontFamily:"inherit",cursor:"pointer"}}>{expanded?"閉じる":"…続きを読む"}</button>}
          </div>
        )}
      </div>
      {/* アクションバー */}
      <div style={{padding:"2px 16px 10px",display:"flex",gap:20,alignItems:"center"}}>
        <button onClick={handleLike} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:0,fontFamily:"inherit",color:userLiked?"#ff4d6d":C.textDim}}>
          <Heart size={18} strokeWidth={1.8} fill={userLiked?"currentColor":"none"}/>
          {likeCount>0&&<span style={{fontSize:12,fontWeight:700}}>{likeCount}</span>}
        </button>
        <button onClick={handleToggleComments} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:0,fontFamily:"inherit",color:C.textDim}}>
          <MessageCircle size={18} strokeWidth={1.8}/>
          {commentCount>0&&<span style={{fontSize:12,fontWeight:700}}>{commentCount}</span>}
        </button>
        <button onClick={handleShare} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:0,fontFamily:"inherit",marginLeft:"auto",color:C.textDim}}>
          {copied
            ?<span style={{fontSize:11,color:C.point,fontWeight:700}}>コピー済み ✓</span>
            :<Share2 size={18} strokeWidth={1.8}/>
          }
        </button>
      </div>
      {/* コメントセクション */}
      {showComments&&(
        <div style={{borderTop:`1px solid ${C.border}`,padding:"8px 16px 12px"}}>
          {comments===null&&<div style={{fontSize:11,color:C.textDim,padding:"6px 0"}}>読み込み中...</div>}
          {comments!==null&&(
            <>
              {topComments.length===0&&<div style={{fontSize:11,color:C.textDim,padding:"4px 0 8px"}}>まだコメントがありません</div>}
              {topComments.map(cm=>(
                <div key={cm.id} style={{marginBottom:10}}>
                  <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                    <Avatar url={cm.avatar_url} name={cm.user_name} size={28}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{background:"rgba(128,128,128,0.1)",borderRadius:12,padding:"7px 11px",display:"inline-block",maxWidth:"100%"}}>
                        <span style={{fontSize:11,fontWeight:700,color:C.point}}>{cm.user_name}</span>
                        <span style={{fontSize:12,color:C.text,marginLeft:6,wordBreak:"break-word"}}>{cm.body}</span>
                      </div>
                      <div style={{display:"flex",gap:12,marginTop:3,paddingLeft:4}}>
                        <button onClick={()=>setReplyingTo(replyingTo?.id===cm.id?null:{id:cm.id,username:cm.user_name})}
                          style={{background:"none",border:"none",fontSize:10,color:C.accentDim,cursor:"pointer",padding:0,fontFamily:"inherit"}}>返信</button>
                        {cm.user_id===me?.id&&<button onClick={()=>handleDeleteComment(cm.id)}
                          style={{background:"none",border:"none",fontSize:10,color:"#ff6b6b",cursor:"pointer",padding:0,fontFamily:"inherit"}}>削除</button>}
                      </div>
                    </div>
                  </div>
                  {getReplies(cm.id).map(rp=>(
                    <div key={rp.id} style={{display:"flex",gap:8,alignItems:"flex-start",marginTop:6,paddingLeft:36}}>
                      <Avatar url={rp.avatar_url} name={rp.user_name} size={24}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{background:"rgba(128,128,128,0.1)",borderRadius:12,padding:"6px 10px",display:"inline-block",maxWidth:"100%"}}>
                          <span style={{fontSize:11,fontWeight:700,color:C.point}}>{rp.user_name}</span>
                          <span style={{fontSize:12,color:C.text,marginLeft:6,wordBreak:"break-word"}}>{rp.body}</span>
                        </div>
                        {rp.user_id===me?.id&&<button onClick={()=>handleDeleteComment(rp.id)}
                          style={{display:"block",background:"none",border:"none",fontSize:10,color:"#ff6b6b",cursor:"pointer",padding:"2px 0",fontFamily:"inherit"}}>削除</button>}
                      </div>
                    </div>
                  ))}
                  {replyingTo?.id===cm.id&&(
                    <div style={{display:"flex",gap:8,alignItems:"center",marginTop:6,paddingLeft:36}}>
                      <input value={replyText} onChange={e=>setReplyText(e.target.value)}
                        placeholder={`@${replyingTo.username} に返信...`}
                        onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleSubmitReply(cm.id)}
                        autoFocus
                        style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${C.accent}`,borderRadius:20,padding:"6px 12px",color:C.text,fontSize:11,fontFamily:"inherit",outline:"none"}}/>
                      <button onClick={()=>handleSubmitReply(cm.id)} disabled={!replyText.trim()||submitting}
                        style={{background:replyText.trim()?C.accent:"transparent",border:`1px solid ${replyText.trim()?C.accent:C.border}`,borderRadius:4,padding:"5px 10px",fontSize:10,color:replyText.trim()?C.bg:C.textDim,fontFamily:"inherit",cursor:"pointer",fontWeight:700}}>送信</button>
                      <button onClick={()=>setReplyingTo(null)} style={{background:"none",border:"none",color:C.textDim,cursor:"pointer",padding:0,display:"flex",alignItems:"center"}}><X size={16} strokeWidth={1.8}/></button>
                    </div>
                  )}
                </div>
              ))}
              <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
                <Avatar url={me?.avatarUrl} name={me?.username} size={28}/>
                <input value={commentText} onChange={e=>setCommentText(e.target.value)}
                  placeholder="コメントを追加..."
                  onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleSubmitComment()}
                  style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:20,padding:"6px 12px",color:C.text,fontSize:11,fontFamily:"inherit",outline:"none"}}/>
                <button onClick={handleSubmitComment} disabled={!commentText.trim()||submitting}
                  style={{background:commentText.trim()?C.accent:"transparent",border:`1px solid ${commentText.trim()?C.accent:C.border}`,borderRadius:4,padding:"5px 10px",fontSize:10,color:commentText.trim()?C.bg:C.textDim,fontFamily:"inherit",cursor:"pointer",fontWeight:700}}>投稿</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EditModal({session,onSave,onClose,pastLocations=[]}){
  const [cond,setCond]=useState({...session.cond});
  const [saving,setSaving]=useState(false);

  const handleSave=async()=>{
    setSaving(true);
    const{error}=await supabase.from("sessions").update({
      boat_class:cond.boatClass, sail_number:cond.sailNumber,
      date:cond.date, location:cond.location,
      wind_knots:cond.windKnots, wind_dir:cond.windDir, wind_stability:cond.windStability,
      wave_height:cond.waveHeight, wave_type:cond.waveType,
      outhaul:cond.outhaul, cunningham:cond.cunningham, vang:cond.vang,
      comment:cond.comment,
    }).eq("id",session.id);
    setSaving(false);
    if(error){alert("保存に失敗しました");return;}
    onSave({...session,cond});
  };

  return(
    <div style={{position:"fixed",inset:0,background:C.bg,zIndex:200,display:"flex",flexDirection:"column",maxWidth:600,margin:"0 auto"}}>
      <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8,flexShrink:0,background:C.panel}}>
        <div style={{color:C.accent,fontSize:13,fontWeight:700,letterSpacing:"0.12em",flex:1}}>投稿を編集</div>
        <div style={{fontSize:10,color:C.textDim}}>{session.cond?.date}</div>
        <Btn onClick={onClose} secondary style={{padding:"5px 8px",display:"flex",alignItems:"center"}}><X size={14} strokeWidth={1.8}/></Btn>
      </div>
      <ConditionsForm cond={cond} setCond={setCond} onDone={handleSave} metrics={session.metrics} pastLocations={pastLocations} saveLabel={saving?"保存中...":"保存する ✓"}/>
    </div>
  );
}

function DeleteAccountModal({onConfirm,onClose}){
  const [deleting,setDeleting]=useState(false);
  const handle=async()=>{
    setDeleting(true);
    try{await onConfirm();}
    catch(e){alert("削除に失敗しました\n"+e.message);setDeleting(false);}
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:C.panel,border:"1px solid rgba(255,100,100,0.45)",borderRadius:12,padding:24,width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:16}}>
        <div style={{fontSize:13,fontWeight:700,color:"#ff6b6b",letterSpacing:"0.08em"}}>アカウントを削除</div>
        <div style={{fontSize:11,color:C.text,lineHeight:1.9}}>
          この操作は取り消せません。<br/>
          すべての投稿・コメント・いいね・プロフィール・画像が完全に削除されます。
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} disabled={deleting}
            style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"10px",fontSize:11,color:C.textDim,fontFamily:"inherit",cursor:deleting?"not-allowed":"pointer"}}>
            キャンセル
          </button>
          <button onClick={handle} disabled={deleting}
            style={{flex:1,background:deleting?"#661111":"#cc2222",border:"none",borderRadius:6,padding:"10px",fontSize:11,color:"#fff",fontFamily:"inherit",fontWeight:700,cursor:deleting?"not-allowed":"pointer"}}>
            {deleting?"削除中...":"削除する"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FeedPage({sessions,loading,myUserId,isAdmin,onDelete,onEdit,profileMap,me,followingIds,onFollow,onUnfollow}){
  const [search,setSearch]=useState("");
  const [showFilter,setShowFilter]=useState(false);
  const [fWind,setFWind]=useState("");
  const [fWave,setFWave]=useState("");

  const winds=[...new Set(sessions.map(s=>s.cond?.windKnots).filter(Boolean))];
  const waves=[...new Set(sessions.map(s=>s.cond?.waveHeight).filter(Boolean))];
  const hasFilter=search||fWind||fWave;

  const filtered=sessions.filter(s=>{
    const q=search.toLowerCase();
    const matchQ=!q||[s.user,s.cond?.boatClass,s.cond?.location,s.cond?.comment].some(v=>v?.toLowerCase().includes(q));
    return matchQ&&(!fWind||s.cond?.windKnots===fWind)&&(!fWave||s.cond?.waveHeight===fWave);
  });

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
      <div style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",gap:8,alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="検索..."
          style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:20,padding:"6px 12px",color:C.text,fontSize:11,fontFamily:"inherit",outline:"none"}}/>
        <button onClick={()=>setShowFilter(f=>!f)}
          style={{background:hasFilter?"rgba(0,200,255,0.15)":"transparent",border:`1px solid ${hasFilter?C.accent:C.border}`,borderRadius:20,padding:"5px 12px",fontSize:10,color:hasFilter?C.accent:C.textDim,fontFamily:"inherit",cursor:"pointer"}}>
          フィルター
        </button>
      </div>
      {showFilter&&(
        <div style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
          {winds.map(w=><Chip key={w} label={w} active={fWind===w} onClick={()=>setFWind(f=>f===w?"":w)}/>)}
          {waves.map(w=><Chip key={w} label={w} active={fWave===w} onClick={()=>setFWave(f=>f===w?"":w)}/>)}
          {hasFilter&&<button onClick={()=>{setSearch("");setFWind("");setFWave("");}}
            style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:3,padding:"3px 10px",color:C.textDim,fontSize:9,fontFamily:"inherit",cursor:"pointer"}}>
            リセット ×
          </button>}
        </div>
      )}
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        {loading&&<div style={{color:C.textDim,fontSize:11,textAlign:"center",marginTop:60}}>読み込み中...</div>}
        {!loading&&filtered.length===0&&(
          <div style={{color:C.textDim,fontSize:11,textAlign:"center",marginTop:60,lineHeight:2,padding:"0 24px"}}>
            {!isAdmin&&followingIds.size===0?"誰もフォローしていません\nフォローするとここに投稿が表示されます":"まだ投稿がありません"}
          </div>
        )}
        {filtered.map(s=><SessionCard key={s.id} s={s} isOwn={s.userId===myUserId} isAdmin={isAdmin} onDelete={onDelete} onEdit={onEdit} avatarUrl={profileMap?.[s.userId]} me={me} isFollowing={followingIds?.has(s.userId)} onFollow={onFollow} onUnfollow={onUnfollow}/>)}
      </div>
    </div>
  );
}

function MyPage({sessions,username,onUsernameChange,theme,onThemeToggle,onLogout,onExport,onDelete,onEdit,avatarUrl,onAvatarUpload,onDeleteAccount,me,followingCount,followerCount}){
  const [editing,setEditing]=useState(false);
  const [newName,setNewName]=useState(username);
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState("");
  const [showDeleteAccount,setShowDeleteAccount]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const avatarInputRef=useRef(null);

  const handleSaveName=async()=>{
    if(!newName.trim())return;
    setSaving(true);setErr("");
    const{data:{user}}=await supabase.auth.getUser();
    const{error}=await supabase.from("profiles").update({username:newName.trim()}).eq("id",user.id);
    setSaving(false);
    if(error){setErr(error.code==="23505"?"そのユーザー名はすでに使われています":error.message);return;}
    onUsernameChange(newName.trim());
    setEditing(false);
  };

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,overflowY:"auto"}}>
      <div style={{padding:"20px 16px",borderBottom:`1px solid ${C.border}`,background:C.panel,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{position:"relative",flexShrink:0,cursor:"pointer"}} onClick={()=>avatarInputRef.current?.click()}>
            <Avatar url={avatarUrl} name={username} size={52}/>
            <div style={{position:"absolute",bottom:0,right:0,width:18,height:18,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",border:`2px solid ${C.bg}`,color:C.bg}}>
              <Camera size={10} strokeWidth={2}/>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={onAvatarUpload} style={{display:"none"}}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            {!editing?(
              <>
                <div style={{fontSize:15,fontWeight:700,color:C.text}}>{username}</div>
                <div style={{fontSize:10,color:C.textDim,marginTop:2,display:"flex",gap:12}}>
                  <span>{sessions.length} セッション</span>
                  <span>{followingCount} フォロー</span>
                  <span>{followerCount} フォロワー</span>
                </div>
              </>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <input value={newName} onChange={e=>setNewName(e.target.value)}
                  style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.accent}`,borderRadius:4,padding:"6px 10px",color:C.text,fontSize:12,fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                <div style={{display:"flex",gap:8}}>
                  <Btn onClick={handleSaveName} disabled={saving||!newName.trim()} style={{fontSize:10}}>{saving?"保存中":"保存"}</Btn>
                  <Btn onClick={()=>{setEditing(false);setNewName(username);setErr("");}} secondary style={{fontSize:10}}>キャンセル</Btn>
                </div>
              </div>
            )}
            {err&&<div style={{fontSize:9,color:"#ff6b6b",marginTop:4}}>{err}</div>}
          </div>
          {!editing&&(
            <button onClick={()=>setShowSettings(true)}
              style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,color:C.textDim}}>
              <Settings size={18} strokeWidth={1.8}/>
            </button>
          )}
        </div>
      </div>
      {showDeleteAccount&&<DeleteAccountModal onConfirm={onDeleteAccount} onClose={()=>setShowDeleteAccount(false)}/>}
      {showSettings&&(
        <div style={{position:"fixed",inset:0,zIndex:200}} onClick={()=>setShowSettings(false)}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.5)"}}/>
          <div onClick={e=>e.stopPropagation()}
            style={{position:"absolute",bottom:0,left:0,right:0,maxWidth:600,margin:"0 auto",background:C.panel,borderRadius:"16px 16px 0 0",paddingBottom:"env(safe-area-inset-bottom,16px)"}}>
            <div style={{width:36,height:4,borderRadius:2,background:C.border,margin:"10px auto 4px"}}/>
            {[
              {Icon:Pencil,label:"ユーザー名を変更",action:()=>{setEditing(true);setShowSettings(false);}},
              {Icon:theme==="dark"?Sun:Moon,label:theme==="dark"?"ライトモード":"ダークモード",action:()=>{onThemeToggle();setShowSettings(false);}},
              {Icon:Download,label:"CSVエクスポート",action:()=>{onExport();setShowSettings(false);}},
            ].map(({Icon:ItemIcon,label,action})=>(
              <button key={label} onClick={action}
                style={{display:"flex",alignItems:"center",gap:14,width:"100%",padding:"14px 20px",background:"none",border:"none",borderBottom:`1px solid ${C.border}`,color:C.text,fontSize:13,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}}>
                <span style={{width:24,display:"flex",justifyContent:"center"}}><ItemIcon size={18} strokeWidth={1.8}/></span>{label}
              </button>
            ))}
            <button onClick={()=>{onLogout();setShowSettings(false);}}
              style={{display:"flex",alignItems:"center",gap:14,width:"100%",padding:"14px 20px",background:"none",border:"none",borderBottom:`1px solid ${C.border}`,color:"#ff6b6b",fontSize:13,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}}>
              <span style={{width:24,display:"flex",justifyContent:"center"}}><LogOut size={18} strokeWidth={1.8}/></span>ログアウト
            </button>
            <button onClick={()=>{setShowSettings(false);setShowDeleteAccount(true);}}
              style={{display:"flex",alignItems:"center",gap:14,width:"100%",padding:"14px 20px",background:"none",border:"none",color:"rgba(255,107,107,0.6)",fontSize:13,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}}>
              <span style={{width:24,display:"flex",justifyContent:"center"}}><Trash2 size={18} strokeWidth={1.8}/></span>アカウントを削除
            </button>
          </div>
        </div>
      )}
      <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <div style={{fontSize:9,color:C.textDim,letterSpacing:"0.2em"}}>MY SESSIONS</div>
      </div>
      {sessions.length===0&&<div style={{color:C.textDim,fontSize:11,textAlign:"center",marginTop:40}}>まだ投稿がありません</div>}
      {sessions.map(s=><SessionCard key={s.id} s={s} isOwn onDelete={onDelete} onEdit={onEdit} avatarUrl={avatarUrl} me={me}/>)}
    </div>
  );
}

function ConditionsForm({cond,setCond,onDone,metrics,pastLocations=[],saveLabel="SAVE & FINISH"}){
  const set = k => v => setCond(prev=>({...prev,[k]:v}));
  const toggle = (k,v) => setCond(prev=>({...prev,[k]:prev[k]===v?"":v}));
  return (
    <div style={{flex:1,overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:16}}>
      {metrics&&(
        <div style={{background:"rgba(0,200,255,0.05)",border:`1px solid ${C.border}`,borderRadius:6,padding:"10px 14px",display:"flex",gap:20}}>
          {[["DRAFT",`${metrics.draftPosition}%`],["MAX",`${metrics.maxDraft}%`],["TWIST",`${metrics.twist}°`]].map(([l,v])=>(
            <div key={l}><div style={{fontSize:8,color:C.textDim,letterSpacing:"0.18em"}}>{l}</div><div style={{fontSize:18,fontWeight:700,color:C.accent}}>{v}</div></div>
          ))}
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <Field label="艇種"><BoatClassIn value={cond.boatClass} onChange={set("boatClass")}/></Field>
        <Field label="艇番"><TextIn value={cond.sailNumber} onChange={set("sailNumber")} placeholder="1234"/></Field>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <Field label="日付"><input type="date" value={cond.date} onChange={e=>set("date")(e.target.value)} style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 9px",color:C.text,fontSize:11,fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box"}}/></Field>
        <Field label="場所"><LocationIn value={cond.location} onChange={set("location")} pastLocations={pastLocations}/></Field>
      </div>
      <div style={{borderTop:`1px solid ${C.border}`}}/>
      <Field label="風速 (ノット)">
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {["〜5","6〜10","11〜15","16〜20","20〜"].map(v=><Chip key={v} label={v} active={cond.windKnots===v} onClick={()=>toggle("windKnots",v)}/>)}
          <input value={/^\d/.test(cond.windKnots)?cond.windKnots:""} onChange={e=>set("windKnots")(e.target.value)} placeholder="数値" style={{width:60,background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 8px",color:C.text,fontSize:10,fontFamily:"inherit",outline:"none"}}/>
        </div>
      </Field>
      <Field label="風向">
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {["上り","クローズリーチ","ビームリーチ","ブロードリーチ","下り"].map(v=><Chip key={v} label={v} active={cond.windDir===v} onClick={()=>toggle("windDir",v)}/>)}
        </div>
      </Field>
      <Field label="風の安定性">
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {["安定","シフティ","ガスティ"].map(v=><Chip key={v} label={v} active={cond.windStability===v} onClick={()=>toggle("windStability",v)}/>)}
        </div>
      </Field>
      <div style={{borderTop:`1px solid ${C.border}`}}/>
      <Field label="波の高さ">
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {["フラット","小（〜0.3m）","中（0.3〜0.8m）","大（0.8m〜）"].map(v=><Chip key={v} label={v} active={cond.waveHeight===v} onClick={()=>toggle("waveHeight",v)}/>)}
        </div>
      </Field>
      <Field label="波質">
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {["チョッピー","うねり","混合"].map(v=><Chip key={v} label={v} active={cond.waveType===v} onClick={()=>toggle("waveType",v)}/>)}
        </div>
      </Field>
      <div style={{borderTop:`1px solid ${C.border}`}}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        <Field label="アウトホール"><TextIn value={cond.outhaul} onChange={set("outhaul")} placeholder="緩め〜"/></Field>
        <Field label="カニンガム"><TextIn value={cond.cunningham} onChange={set("cunningham")} placeholder="オフ〜"/></Field>
        <Field label="バング"><TextIn value={cond.vang} onChange={set("vang")} placeholder="緩め〜"/></Field>
      </div>
      <div style={{borderTop:`1px solid ${C.border}`}}/>
      <Field label="コメント・反省">
        <textarea value={cond.comment} onChange={e=>set("comment")(e.target.value)} placeholder="セールの形の感想、改善点など..." rows={3}
          style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:4,padding:"8px 9px",color:C.text,fontSize:11,fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box",resize:"vertical",lineHeight:1.6}}/>
      </Field>
      <button onClick={onDone} style={{background:C.point,color:C.bg,border:"none",borderRadius:4,padding:"11px",fontSize:12,fontFamily:"inherit",letterSpacing:"0.15em",fontWeight:700,cursor:"pointer"}}>{saveLabel}</button>
      <div style={{height:8}}/>
    </div>
  );
}

function OnboardingScreen({onDone}){
  const [step,setStep]=useState(0);

  const slides=[
    {
      title:"LEECH ANALYZER",
      sub:"CONCEPT",
      body:"帆の後縁（リーチ）を写真でトレースし、形状を3つの数値で記録するアプリ。\n\nコンディションと紐づけて蓄積することで、「あのときのセッティング」を再現しやすくなります。",
      diagram:(
        <svg viewBox="0 0 160 140" width="150" height="131" style={{display:"block",margin:"0 auto"}}>
          <line x1="22" y1="10" x2="22" y2="128" stroke={C.border} strokeWidth="2"/>
          <line x1="22" y1="128" x2="138" y2="128" stroke={C.border} strokeWidth="2"/>
          <path d="M22,10 Q135,10 138,10 Q152,55 145,90 Q138,118 138,128" stroke={C.accent} strokeWidth="2.5" fill="none"/>
          <path d="M22,10 L138,10 Q152,55 145,90 Q138,118 138,128 L22,128 Z" fill="rgba(0,200,255,0.05)"/>
          {[[138,10],[149,55],[147,88],[140,112],[138,128]].map(([cx,cy],i)=>(
            <circle key={i} cx={cx} cy={cy} r={i===0||i===4?4:3} fill={i===0?C.point:i===4?C.line:C.accent}/>
          ))}
          <text x="4" y="14" fill={C.point} fontSize="8" fontFamily="monospace">TOP</text>
          <text x="118" y="142" fill={C.line} fontSize="8" fontFamily="monospace">BOT</text>
          <text x="155" y="68" fill={C.accent} fontSize="8" fontFamily="monospace" writingMode="tb">LEECH</text>
        </svg>
      ),
    },
    {
      title:"DRAFT POSITION",
      sub:"ドラフト位置 (%)",
      body:"マストトップ（0%）からブームエンド（100%）の間で、リーチのたわみが最大になる点がどの高さにあるかを示す。\n\n上寄り（マストトップ側）→ パワー型セール\n下寄り（ブームエンド側）→ スピード型セール",
      diagram:(
        <svg viewBox="0 0 180 150" width="180" height="150" style={{display:"block",margin:"0 auto"}}>
          <line x1="38" y1="10" x2="38" y2="140" stroke={C.border} strokeWidth="1.5" strokeDasharray="4,3"/>
          <path d="M38,10 Q105,28 112,62 Q105,98 38,140" stroke={C.accent} strokeWidth="2" fill="none"/>
          <circle cx="38" cy="10" r="4" fill={C.point}/>
          <circle cx="38" cy="140" r="4" fill={C.line}/>
          <circle cx="112" cy="62" r="4" fill={C.accent}/>
          <line x1="38" y1="62" x2="112" y2="62" stroke={C.line} strokeWidth="1.5" strokeDasharray="3,2"/>
          <circle cx="38" cy="62" r="3" fill={C.line}/>
          <line x1="28" y1="10" x2="28" y2="62" stroke={C.accentDim} strokeWidth="2"/>
          <line x1="24" y1="10" x2="32" y2="10" stroke={C.accentDim} strokeWidth="1.5"/>
          <line x1="24" y1="62" x2="32" y2="62" stroke={C.accentDim} strokeWidth="1.5"/>
          <text x="2" y="38" fill={C.accentDim} fontSize="6.5" fontFamily="monospace">DRAFT POS</text>
          <text x="42" y="14" fill={C.point} fontSize="8" fontFamily="monospace">TOP 0%</text>
          <text x="42" y="143" fill={C.line} fontSize="8" fontFamily="monospace">BOT 100%</text>
          <text x="120" y="58" fill={C.accent} fontSize="7.5" fontFamily="monospace">最大</text>
          <text x="120" y="67" fill={C.accent} fontSize="7.5" fontFamily="monospace">たわみ点</text>
        </svg>
      ),
    },
    {
      title:"MAX DRAFT",
      sub:"最大ドラフト (%)",
      body:"コードの長さを100%としたとき、リーチの最大たわみがどれだけ深いかを表す比率。\n\n深い → 丸みが大きくパワフル\n浅い → フラットでスピード重視",
      diagram:(
        <svg viewBox="0 0 180 150" width="180" height="150" style={{display:"block",margin:"0 auto"}}>
          <line x1="38" y1="10" x2="38" y2="140" stroke={C.border} strokeWidth="1.5" strokeDasharray="4,3"/>
          <path d="M38,10 Q105,28 112,62 Q105,98 38,140" stroke={C.accent} strokeWidth="2" fill="none"/>
          <circle cx="38" cy="10" r="4" fill={C.point}/>
          <circle cx="38" cy="140" r="4" fill={C.line}/>
          <circle cx="112" cy="62" r="4" fill={C.accent}/>
          <line x1="52" y1="10" x2="52" y2="140" stroke={C.textDim} strokeWidth="1" strokeDasharray="2,2"/>
          <line x1="48" y1="10" x2="56" y2="10" stroke={C.textDim} strokeWidth="1"/>
          <line x1="48" y1="140" x2="56" y2="140" stroke={C.textDim} strokeWidth="1"/>
          <line x1="38" y1="62" x2="112" y2="62" stroke={C.line} strokeWidth="2"/>
          <line x1="38" y1="59" x2="38" y2="65" stroke={C.line} strokeWidth="2"/>
          <line x1="112" y1="59" x2="112" y2="65" stroke={C.line} strokeWidth="2"/>
          <text x="42" y="53" fill={C.line} fontSize="7" fontFamily="monospace">MAX DRAFT</text>
          <text x="42" y="74" fill={C.line} fontSize="6.5" fontFamily="monospace">この距離</text>
          <text x="57" y="91" fill={C.textDim} fontSize="6.5" fontFamily="monospace">コード長 = 100%</text>
          <text x="42" y="14" fill={C.point} fontSize="8" fontFamily="monospace">TOP</text>
          <text x="42" y="143" fill={C.line} fontSize="8" fontFamily="monospace">BOT</text>
        </svg>
      ),
    },
    {
      title:"TWIST",
      sub:"ツイスト (°)",
      body:"リーチの上端と下端の向きの角度差。上端がどれだけ風下に開いているかを表す。\n\n大きい → 上端が開く（パワーが逃げる）\n小さい → 上端が立つ（ヒールしやすい）",
      diagram:(
        <svg viewBox="0 0 180 150" width="180" height="150" style={{display:"block",margin:"0 auto"}}>
          <path d="M38,10 Q105,28 112,62 Q105,98 38,140" stroke={C.border} strokeWidth="1.5" fill="none" strokeDasharray="4,3"/>
          <circle cx="38" cy="10" r="4" fill={C.point}/>
          <circle cx="38" cy="140" r="4" fill={C.line}/>
          <line x1="38" y1="10" x2="100" y2="32" stroke={C.accent} strokeWidth="2.5"/>
          <polygon points="100,32 88,25 90,35" fill={C.accent}/>
          <line x1="38" y1="140" x2="102" y2="112" stroke={C.point} strokeWidth="2.5"/>
          <polygon points="102,112 90,118 91,108" fill={C.point}/>
          <path d="M68,36 Q88,72 70,108" stroke={C.line} strokeWidth="1.5" fill="none" strokeDasharray="3,2"/>
          <text x="104" y="30" fill={C.accent} fontSize="8" fontFamily="monospace">上端方向</text>
          <text x="104" y="115" fill={C.point} fontSize="8" fontFamily="monospace">下端方向</text>
          <text x="88" y="78" fill={C.line} fontSize="9" fontFamily="monospace">TWIST</text>
          <text x="88" y="88" fill={C.line} fontSize="8" fontFamily="monospace">= 角度差</text>
        </svg>
      ),
    },
    {
      title:"HOW TO USE",
      sub:"使い方",
      body:null,
      steps:[
        "セールの写真をアップロード",
        "マストトップをタップ → TOP を設定",
        "ブームエンドをタップ → BOT を設定",
        "ガイドに合わせてリーチを 3 点トレース（25% · 50% · 75%）",
        "ANALYZE → コンディションを記録して保存",
      ],
    },
  ];

  const s=slides[step];
  const isLast=step===slides.length-1;

  return(
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"12px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontSize:10,color:C.textDim,letterSpacing:"0.12em"}}>{step+1} / {slides.length}</div>
        <button onClick={onDone} style={{background:"none",border:"none",color:C.textDim,fontSize:11,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.08em"}}>スキップ</button>
      </div>
      <div style={{display:"flex",justifyContent:"center",gap:6,flexShrink:0,paddingBottom:10}}>
        {slides.map((_,i)=>(
          <div key={i} style={{height:4,borderRadius:2,background:i<=step?C.accent:C.border,width:i===step?24:8,transition:"all 0.25s"}}/>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"0 24px"}}>
        <div style={{maxWidth:400,margin:"0 auto",display:"flex",flexDirection:"column",alignItems:"center",gap:16,paddingBottom:24}}>
          {s.diagram&&(
            <div style={{background:`rgba(0,200,255,0.03)`,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 8px",width:"100%",display:"flex",justifyContent:"center"}}>
              {s.diagram}
            </div>
          )}
          <div style={{textAlign:"center",width:"100%"}}>
            <div style={{fontSize:16,fontWeight:700,letterSpacing:"0.12em",color:C.accent}}>{s.title}</div>
            <div style={{fontSize:9,color:C.textDim,letterSpacing:"0.2em",marginTop:4}}>{s.sub}</div>
          </div>
          {s.body&&(
            <div style={{fontSize:12,color:C.text,lineHeight:2,width:"100%",borderLeft:`2px solid ${C.accentDim}`,paddingLeft:12,whiteSpace:"pre-line"}}>{s.body}</div>
          )}
          {s.steps&&(
            <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
              {s.steps.map((text,i)=>(
                <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:C.accentDim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:C.bg,fontWeight:700,flexShrink:0}}>{i+1}</div>
                  <div style={{fontSize:12,color:C.text,lineHeight:1.8,flex:1,paddingTop:2}}>{text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{padding:"12px 24px 28px",flexShrink:0,borderTop:`1px solid ${C.border}`,background:C.panel}}>
        <button onClick={isLast?onDone:()=>setStep(s=>s+1)}
          style={{width:"100%",background:C.accent,color:C.bg,border:"none",borderRadius:6,padding:"12px",fontSize:12,fontFamily:"inherit",fontWeight:700,letterSpacing:"0.12em",cursor:"pointer"}}>
          {isLast?"はじめる →":"次へ →"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [page,setPage]=useState("feed");
  const [imgObj,setImgObj]=useState(null);
  const [points,setPoints]=useState([]);
  const [metrics,setMetrics]=useState(null);
  const [mode,setMode]=useState("upload");
  const [snapHint,setSnapHint]=useState(null);
  const [cond,setCond]=useState(EMPTY_COND);
  const [feedSessions,setFeedSessions]=useState([]);
  const [mySessions,setMySessions]=useState([]);
  const [feedLoading,setFeedLoading]=useState(true);
  const [editingSession,setEditingSession]=useState(null);
  const [profileMap,setProfileMap]=useState({});
  const [authUser,setAuthUser]=useState(null);
  const [authReady,setAuthReady]=useState(false);
  const [profileUsername,setProfileUsername]=useState(null);
  const [profileLoading,setProfileLoading]=useState(true);
  const [theme,setTheme]=useState(()=>localStorage.getItem("leech_theme")||"dark");
  const [isMobile,setIsMobile]=useState(window.innerWidth<640);
  const [showOnboarding,setShowOnboarding]=useState(false);
  const [followingIds,setFollowingIds]=useState(new Set());
  const [followerCount,setFollowerCount]=useState(0);
  C=THEMES[theme];

  const canvasRef=useRef(null);
  const wrapperRef=useRef(null);
  const snapshotRef=useRef(null);
  const originalFileRef=useRef(null);
  const stateRef=useRef({points:[],mode:"upload",imgObj:null,snapHint:null});
  useEffect(()=>{stateRef.current={points,mode,imgObj,snapHint};},[points,mode,imgObj,snapHint]);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setAuthUser(session?.user??null);
      setAuthReady(true);
    });
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      setAuthUser(session?.user??null);
    });
    return()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{localStorage.setItem("leech_theme",theme);draw();},[theme]);

  useEffect(()=>{
    const h=()=>setIsMobile(window.innerWidth<640);
    window.addEventListener("resize",h);
    return()=>window.removeEventListener("resize",h);
  },[]);

  useEffect(()=>{
    if(!authUser){setProfileUsername(null);setProfileLoading(false);return;}
    setProfileLoading(true);
    supabase.from("profiles").select("id,username,avatar_url")
      .then(({data})=>{
        if(data){
          const myProfile=data.find(p=>p.id===authUser.id);
          setProfileUsername(myProfile?.username||null);
          const map={};
          data.forEach(p=>{map[p.id]=p.avatar_url||null;});
          setProfileMap(map);
        }
        setProfileLoading(false);
      });
  },[authUser]);

  useEffect(()=>{
    if(!authUser)return;
    setFeedLoading(true);
    supabase.from("sessions").select("*").order("created_at",{ascending:false})
      .then(({data,error})=>{
        if(!error&&data)setFeedSessions(data.map(mapSession));
        setFeedLoading(false);
      });
  },[authUser]);

  useEffect(()=>{
    if(!authUser)return;
    supabase.from("sessions").select("*").eq("user_id",authUser.id).order("created_at",{ascending:false})
      .then(({data,error})=>{
        if(!error&&data)setMySessions(data.map(mapSession));
      });
  },[authUser]);

  useEffect(()=>{
    if(!authUser)return;
    supabase.from("follows").select("following_id").eq("follower_id",authUser.id)
      .then(({data})=>setFollowingIds(new Set(data?.map(f=>f.following_id)||[])));
    supabase.from("follows").select("id",{count:"exact",head:true}).eq("following_id",authUser.id)
      .then(({count})=>setFollowerCount(count||0));
  },[authUser]);

  const handleFollow=async(userId)=>{
    await supabase.from("follows").insert({follower_id:authUser.id,following_id:userId});
    setFollowingIds(prev=>new Set([...prev,userId]));
  };
  const handleUnfollow=async(userId)=>{
    await supabase.from("follows").delete().eq("follower_id",authUser.id).eq("following_id",userId);
    setFollowingIds(prev=>{const n=new Set(prev);n.delete(userId);return n;});
  };

  const draw=useCallback(()=>{
    const canvas=canvasRef.current,wrapper=wrapperRef.current;
    if(!canvas||!wrapper)return;
    const{imgObj:img,points:pts,snapHint:hint}=stateRef.current;
    if(!img)return;
    const dpr=window.devicePixelRatio||1;
    const W=wrapper.offsetWidth,H=wrapper.offsetHeight;
    if(!W||!H)return;
    if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){
      canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
      canvas.getContext("2d").setTransform(dpr,0,0,dpr,0,0);
    }
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,W,H);ctx.fillStyle=C.canvas;ctx.fillRect(0,0,W,H);
    const scale=Math.min(W/img.naturalWidth,H/img.naturalHeight);
    const dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;
    ctx.drawImage(img,(W-dw)/2,(H-dh)/2,dw,dh);
    const top=pts.find(p=>p.pct===0),bot=pts.find(p=>p.pct===100);
    if(top&&bot){
      ctx.beginPath();ctx.moveTo(top.x,top.y);ctx.lineTo(bot.x,bot.y);
      ctx.strokeStyle="rgba(0,200,255,0.12)";ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.stroke();ctx.setLineDash([]);
      DIVISIONS.forEach(pct=>{
        const g=getGuideY(top,bot,pct);
        const isPlaced=pts.some(p=>p.pct===pct),isHint=hint===pct;
        ctx.beginPath();ctx.moveTo(g.x-80,g.y);ctx.lineTo(g.x+80,g.y);
        ctx.strokeStyle=isPlaced?"rgba(0,255,170,0.55)":isHint?"rgba(0,200,255,1)":"rgba(0,200,255,0.4)";
        ctx.lineWidth=isHint?3:1.5;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
        if(isHint&&!isPlaced){ctx.beginPath();ctx.arc(g.x,g.y,20,0,Math.PI*2);ctx.fillStyle="rgba(0,200,255,0.15)";ctx.fill();ctx.strokeStyle="rgba(0,200,255,0.7)";ctx.lineWidth=1.5;ctx.stroke();}
        ctx.font="bold 12px monospace";
        ctx.fillStyle=isPlaced?"rgba(0,255,170,0.8)":isHint?C.accent:"rgba(0,200,255,0.5)";
        ctx.shadowColor="#000";ctx.shadowBlur=3;ctx.fillText(`${pct}%`,g.x+85,g.y+4);ctx.shadowBlur=0;
      });
    }
    if(pts.length>=2){
      const sorted=[...pts].sort((a,b)=>a.pct-b.pct);
      ctx.beginPath();ctx.moveTo(sorted[0].x,sorted[0].y);
      for(let i=1;i<sorted.length;i++)ctx.lineTo(sorted[i].x,sorted[i].y);
      ctx.strokeStyle=C.line;ctx.lineWidth=2.5;ctx.setLineDash([6,3]);ctx.stroke();ctx.setLineDash([]);
    }
    pts.forEach(p=>{
      ctx.beginPath();ctx.arc(p.x,p.y,9,0,Math.PI*2);
      ctx.fillStyle=p.pct===0?C.point:p.pct===100?C.line:C.accent;
      ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();
      const lbl=p.pct===0?"TOP":p.pct===100?"BOT":`${p.pct}%`;
      ctx.font="bold 12px monospace";ctx.fillStyle="#fff";
      ctx.shadowColor="#000";ctx.shadowBlur=4;ctx.fillText(lbl,p.x+13,p.y+4);ctx.shadowBlur=0;
    });
  },[]);

  useEffect(()=>{draw();},[draw,imgObj,points,snapHint]);
  useEffect(()=>{
    const wrapper=wrapperRef.current;if(!wrapper)return;
    let raf;
    const ro=new ResizeObserver(()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(draw);});
    ro.observe(wrapper);
    return()=>{ro.disconnect();cancelAnimationFrame(raf);};
  },[draw]);

  const toLogical=e=>{
    const wrapper=wrapperRef.current;
    const rect=wrapper.getBoundingClientRect();
    const src=e.changedTouches?.[0]??e.touches?.[0]??e;
    return{x:src.clientX-rect.left,y:src.clientY-rect.top};
  };

  const handleTap=e=>{
    if(e.changedTouches?.length>1)return;
    if(e.type==="touchend")e.preventDefault();
    const{x,y}=toLogical(e);
    const{points:pts,mode:m}=stateRef.current;
    const top=pts.find(p=>p.pct===0),bot=pts.find(p=>p.pct===100);
    if(m==="setTop"){setPoints([{x,y,pct:0}]);setMode("setBot");return;}
    if(m==="setBot"){setPoints(prev=>[...prev,{x,y,pct:100}]);setMode("trace");return;}
    if(m==="trace"&&top&&bot){
      const sp=findSnap(y,top,bot);
      if(sp!==null&&!pts.some(p=>p.pct===sp)){
        const g=getGuideY(top,bot,sp);
        setPoints(prev=>[...prev,{x,y:g.y,pct:sp}]);setSnapHint(null);
      }
    }
  };

  const handleMove=e=>{
    if(e.touches?.length>1)return;
    const{points:pts,mode:m}=stateRef.current;
    const top=pts.find(p=>p.pct===0),bot=pts.find(p=>p.pct===100);
    if(m!=="trace"||!top||!bot)return;
    const{y}=toLogical(e);
    const s=findSnap(y,top,bot);
    setSnapHint(s!==null&&!pts.some(p=>p.pct===s)?s:null);
  };

  const handleFile=file=>{
    if(!file)return;
    originalFileRef.current=file;
    const reader=new FileReader();
    reader.onload=ev=>{
      const img=new Image();
      img.onload=()=>{setImgObj(img);setPoints([]);setMetrics(null);setMode("setTop");setCond(prev=>({...prev,date:today()}));};
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleGoConditions=()=>{
    const m=computeMetrics([...points].sort((a,b)=>a.pct-b.pct));
    setMetrics(m);
    snapshotRef.current=canvasRef.current?.toDataURL("image/jpeg",0.7)||null;
    setMode("conditions");
  };

  const handleSave=async()=>{
    if(!metrics)return;
    const ts=Date.now();
    const uid=authUser?.id;

    const uploadFile=async(file,path)=>{
      const{error}=await supabase.storage.from("sail-images").upload(path,file);
      if(error)throw error;
      return supabase.storage.from("sail-images").getPublicUrl(path).data.publicUrl;
    };
    const dataURLtoBlob=dataURL=>{
      const[header,b64]=dataURL.split(",");
      const mime=header.match(/:(.*?);/)[1];
      const binary=atob(b64);
      const arr=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)arr[i]=binary.charCodeAt(i);
      return new Blob([arr],{type:mime});
    };
    const compressImage=(file,maxDim=1920,quality=0.82)=>new Promise(resolve=>{
      const img=new Image();
      const url=URL.createObjectURL(file);
      img.onload=()=>{
        URL.revokeObjectURL(url);
        const scale=Math.min(1,maxDim/Math.max(img.naturalWidth,img.naturalHeight));
        const w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale);
        const c=document.createElement("canvas");
        c.width=w;c.height=h;
        c.getContext("2d").drawImage(img,0,0,w,h);
        c.toBlob(resolve,"image/jpeg",quality);
      };
      img.src=url;
    });

    let originalUrl=null,annotatedUrl=null;
    try{
      if(originalFileRef.current){
        const compressed=await compressImage(originalFileRef.current);
        originalUrl=await uploadFile(compressed,`${uid}/${ts}_original.jpg`);
      }
      if(snapshotRef.current){
        const blob=dataURLtoBlob(snapshotRef.current);
        annotatedUrl=await uploadFile(blob,`${uid}/${ts}_annotated.jpg`);
      }
    }catch(e){console.error("画像アップロードエラー:",e);alert("画像のアップロードに失敗しました\n"+e.message);return;}

    const{data,error}=await supabase.from("sessions").insert({
      user_id:uid, user_name:profileUsername,
      boat_class:cond.boatClass, sail_number:cond.sailNumber,
      date:cond.date, location:cond.location,
      draft_position:metrics.draftPosition, max_draft:metrics.maxDraft, twist:metrics.twist,
      wind_knots:cond.windKnots, wind_dir:cond.windDir, wind_stability:cond.windStability,
      wave_height:cond.waveHeight, wave_type:cond.waveType,
      outhaul:cond.outhaul, cunningham:cond.cunningham, vang:cond.vang,
      comment:cond.comment,
      original_image_url:originalUrl,
      annotated_image_url:annotatedUrl,
    }).select().single();
    if(error){console.error("保存エラー:",error);alert("保存に失敗しました");return;}

    const newSession=mapSession(data);
    setFeedSessions(prev=>[newSession,...prev]);
    setMySessions(prev=>[newSession,...prev]);
    setMode("upload");setImgObj(null);setPoints([]);setMetrics(null);setCond(EMPTY_COND);
    originalFileRef.current=null;
    setPage("feed");
  };

  const handleDeleteAccount=async()=>{
    const extractPath=url=>{
      if(!url)return null;
      const m=url.indexOf("/sail-images/");
      return m>=0?url.slice(m+"/sail-images/".length).split("?")[0]:null;
    };
    const paths=[
      ...mySessions.flatMap(s=>[extractPath(s.originalImageUrl),extractPath(s.annotatedImageUrl)]),
      extractPath(profileMap[authUser.id]),
    ].filter(Boolean);
    if(paths.length>0)await supabase.storage.from("sail-images").remove(paths);
    const{error}=await supabase.rpc("delete_user");
    if(error)throw error;
    setAuthUser(null);setFeedSessions([]);setMySessions([]);setProfileUsername(null);setProfileMap({});
  };

  const handleAvatarUpload=async(e)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    const uid=authUser.id;
    const compressAvatar=f=>new Promise(resolve=>{
      const img=new Image();
      const url=URL.createObjectURL(f);
      img.onload=()=>{
        URL.revokeObjectURL(url);
        const s=Math.min(img.naturalWidth,img.naturalHeight);
        const size=Math.min(400,s);
        const c=document.createElement("canvas");
        c.width=size;c.height=size;
        const ox=(img.naturalWidth-s)/2,oy=(img.naturalHeight-s)/2;
        c.getContext("2d").drawImage(img,ox,oy,s,s,0,0,size,size);
        c.toBlob(resolve,"image/jpeg",0.85);
      };
      img.src=url;
    });
    const compressed=await compressAvatar(file);
    if(!compressed){alert("画像の圧縮に失敗しました");return;}
    const oldUrl=profileMap[uid];
    if(oldUrl){
      const marker="/sail-images/";
      const idx=oldUrl.indexOf(marker);
      if(idx>=0){
        const oldPath=oldUrl.slice(idx+marker.length).split("?")[0];
        await supabase.storage.from("sail-images").remove([oldPath]);
      }
    }
    const path=`avatars/${uid}_${Date.now()}.jpg`;
    const{error}=await supabase.storage.from("sail-images").upload(path,compressed);
    if(error){console.error("Storage error:",error);alert("アップロードに失敗しました\n"+error.message);return;}
    const{data:{publicUrl}}=supabase.storage.from("sail-images").getPublicUrl(path);
    const avatarUrl=publicUrl;
    await supabase.from("profiles").update({avatar_url:avatarUrl}).eq("id",uid);
    setProfileMap(prev=>({...prev,[uid]:avatarUrl}));
    e.target.value="";
  };

  const handleEditSave=(updated)=>{
    setFeedSessions(prev=>prev.map(s=>s.id===updated.id?updated:s));
    setMySessions(prev=>prev.map(s=>s.id===updated.id?updated:s));
    setEditingSession(null);
  };

  const handleDelete=async(session)=>{
    const{error}=await supabase.from("sessions").delete().eq("id",session.id);
    if(error){alert("削除に失敗しました");return;}
    const paths=[session.originalImageUrl,session.annotatedImageUrl].map(url=>{
      if(!url)return null;
      const m=url.indexOf("/sail-images/");
      return m>=0?url.slice(m+"/sail-images/".length):null;
    }).filter(Boolean);
    if(paths.length>0)await supabase.storage.from("sail-images").remove(paths);
    setFeedSessions(prev=>prev.filter(s=>s.id!==session.id));
    setMySessions(prev=>prev.filter(s=>s.id!==session.id));
  };

  const top=points.find(p=>p.pct===0)||null;
  const bot=points.find(p=>p.pct===100)||null;
  const missing=top&&bot?DIVISIONS.filter(pct=>pct!==0&&pct!==100&&!points.some(p=>p.pct===pct)):[];
  const allPlaced=top&&bot&&missing.length===0;
  const isCanvasMode=["setTop","setBot","trace"].includes(mode);

  const instr={
    upload:"PHOTOをアップロード",setTop:"① マストトップをタップ",setBot:"② ブームエンドをタップ",
    trace:missing.length>0?`③ ガイド付近をタップ（残り ${missing.map(p=>p+"%").join(", ")}）`:"✓ 全完了！ANALYZEを押してね",
    conditions:"コンディションを入力（すべて任意）",
  }[mode]||"";

  if(!authReady||profileLoading)
    return <div style={{height:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:C.textDim,fontSize:11,letterSpacing:"0.15em"}}>LOADING...</div></div>;
  if(!authUser) return <AuthScreen onAuth={u=>setAuthUser(u)}/>;
  if(profileUsername===null) return <SetupScreen onDone={name=>{setProfileUsername(name);if(!localStorage.getItem(ONBOARDING_KEY))setShowOnboarding(true);}}/>;
  if(showOnboarding) return <OnboardingScreen onDone={()=>{localStorage.setItem(ONBOARDING_KEY,"1");setShowOnboarding(false);}}/>;


  const me={id:authUser.id,username:profileUsername,avatarUrl:profileMap[authUser.id]||null};

  const navItems=[
    {id:"feed",label:"フィード",Icon:Home},
    {id:"analyze",label:"投稿",Icon:Plus},
    {id:"mypage",label:"マイページ",Icon:User},
  ];

  return (
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* ヘッダー */}
      <div style={{borderBottom:`1px solid ${C.border}`,padding:"9px 16px",display:"flex",alignItems:"center",gap:12,background:C.panel,flexShrink:0}}>
        <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
          <path d="M14 2 L26 24 L14 20 L2 24 Z" stroke={C.accent} strokeWidth="1.8" fill="none"/>
          <path d="M14 2 L14 20" stroke={C.accent} strokeWidth="1.2" opacity="0.5"/>
        </svg>
        <div>
          <div style={{fontSize:12,fontWeight:700,letterSpacing:"0.12em",color:C.accent}}>LEECH ANALYZER</div>
          <div style={{fontSize:8,color:C.textDim,letterSpacing:"0.18em"}}>SAIL SHAPE v1.3</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:11,color:C.point,fontWeight:700,letterSpacing:"0.06em"}}>{profileUsername}</div>
          <button onClick={()=>setShowOnboarding(true)} style={{background:"none",border:"none",color:C.textDim,cursor:"pointer",padding:0,display:"flex",alignItems:"center"}}>
            <Info size={16} strokeWidth={1.8}/>
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>

        {page==="feed"&&<FeedPage
            sessions={authUser.email===ADMIN_EMAIL?feedSessions:feedSessions.filter(s=>s.userId===authUser.id||followingIds.has(s.userId))}
            loading={feedLoading} myUserId={authUser.id} isAdmin={authUser.email===ADMIN_EMAIL}
            onDelete={handleDelete} onEdit={setEditingSession} profileMap={profileMap} me={me}
            followingIds={followingIds} onFollow={handleFollow} onUnfollow={handleUnfollow}/>}

        {page==="analyze"&&(
          <>
            <div style={{height:34,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,200,255,0.05)",borderBottom:`1px solid ${C.border}`,fontSize:11,color:mode==="conditions"?C.point:C.accent,padding:"0 12px",textAlign:"center"}}>
              {instr}
            </div>
            <div style={{display:"flex",flex:1,minHeight:0}}>
              <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,minHeight:0}}>
                {(isCanvasMode||mode==="upload")&&(
                  <div ref={wrapperRef} style={{flex:1,position:"relative",minHeight:0,overflow:"hidden",background:C.canvas}}>
                    {mode==="upload"?(
                      <label onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files?.[0]);}} onDragOver={e=>e.preventDefault()}
                        style={{position:"absolute",inset:8,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",gap:12,background:C.uploadBg,border:`2px dashed ${C.accentDim}`,borderRadius:8}}>
                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M24 4 L44 40 L24 34 L4 40 Z" stroke={C.accentDim} strokeWidth="2" fill="none"/></svg>
                        <div style={{color:C.textDim,fontSize:12,textAlign:"center"}}>
                          <div style={{color:C.accent,marginBottom:4}}>PHOTO をドロップ</div>
                          またはタップして選択
                        </div>
                        <input type="file" accept="image/*" onChange={e=>handleFile(e.target.files?.[0])} style={{display:"none"}}/>
                      </label>
                    ):(
                      <canvas ref={canvasRef} onClick={handleTap} onTouchEnd={handleTap} onMouseMove={handleMove} onTouchMove={handleMove} onMouseLeave={()=>setSnapHint(null)}
                        style={{position:"absolute",inset:0,width:"100%",height:"100%",cursor:"crosshair",display:"block"}}/>
                    )}
                  </div>
                )}
                {mode==="conditions"&&(
                  <ConditionsForm cond={cond} setCond={setCond} onDone={handleSave} metrics={metrics} pastLocations={[...new Set(mySessions.map(s=>s.cond?.location).filter(Boolean))]}/>
                )}
                {(isCanvasMode||mode==="upload")&&(
                  <div style={{height:52,flexShrink:0,display:"flex",alignItems:"center",gap:8,padding:"0 12px",borderTop:`1px solid ${C.border}`}}>
                    {isCanvasMode&&<Btn onClick={()=>{setPoints([]);setMetrics(null);setMode("setTop");}} secondary>RESET</Btn>}
                    {isCanvasMode&&points.length>0&&<Btn onClick={()=>{
                      setPoints(p=>{
                        const next=p.slice(0,-1);
                        const hasTop=next.some(pt=>pt.pct===0);
                        const hasBot=next.some(pt=>pt.pct===100);
                        if(!hasTop) setMode("setTop");
                        else if(!hasBot) setMode("setBot");
                        else setMode("trace");
                        return next;
                      });
                    }} secondary>UNDO</Btn>}
                    {isCanvasMode&&<Btn onClick={handleGoConditions} disabled={!allPlaced}>ANALYZE →</Btn>}
                  </div>
                )}
              </div>
              {!isMobile&&(
                <div style={{width:185,flexShrink:0,borderLeft:`1px solid ${C.border}`,background:C.panel,padding:13,display:"flex",flexDirection:"column",gap:13,overflowY:"auto"}}>
                  <div>
                    <Label>STATUS</Label>
                    <div style={{fontSize:10,letterSpacing:"0.1em",color:mode==="conditions"?C.point:C.accent}}>
                      {mode==="upload"&&<span style={{color:C.textDim}}>WAITING</span>}
                      {mode==="setTop"&&"SET TOP"}{mode==="setBot"&&"SET BOT"}
                      {mode==="trace"&&(missing.length>0?`${3-missing.length}/3 MID`:"READY ✓")}
                      {mode==="conditions"&&"LOGGING"}
                    </div>
                  </div>
                  <div style={{borderTop:`1px solid ${C.border}`}}/>
                  <div>
                    <Label>GUIDE POINTS</Label>
                    <div style={{display:"flex",flexDirection:"column",gap:7}}>
                      {DIVISIONS.map(pct=>{
                        const placed=points.some(p=>p.pct===pct),isHint=snapHint===pct;
                        return(
                          <div key={pct} style={{display:"flex",alignItems:"center",gap:7,fontSize:11}}>
                            <span style={{width:14,height:14,borderRadius:3,border:`1px solid ${placed?C.point:isHint?C.accent:C.border}`,background:placed?C.point:isHint?"rgba(0,200,255,0.2)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",color:C.bg,flexShrink:0}}>
                              {placed&&<Check size={9} strokeWidth={2.5}/>}
                            </span>
                            <span style={{color:placed?C.text:isHint?C.accent:C.textDim}}>{pct===0?"TOP":pct===100?"BOT":`${pct}%`}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{borderTop:`1px solid ${C.border}`}}/>
                  <div>
                    <Label>METRICS</Label>
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      <Metric label="DRAFT POS" value={metrics?`${metrics.draftPosition}%`:"—"} sub="from top" active={!!metrics}/>
                      <Metric label="MAX DRAFT" value={metrics?`${metrics.maxDraft}%`:"—"} sub="of chord" active={!!metrics}/>
                      <Metric label="TWIST" value={metrics?`${metrics.twist}°`:"—"} sub="top vs bot" active={!!metrics}/>
                    </div>
                  </div>
                  {metrics&&(
                    <>
                      <div style={{borderTop:`1px solid ${C.border}`}}/>
                      <div>
                        <Label>RESULT</Label>
                        <div style={{fontSize:10,color:C.textDim,lineHeight:1.9}}>
                          {metrics.draftPosition<35&&<div>⚠ ドラフト前寄り</div>}
                          {metrics.draftPosition>55&&<div>⚠ ドラフト後ろ寄り</div>}
                          {metrics.draftPosition>=35&&metrics.draftPosition<=55&&<div style={{color:C.point}}>✓ ドラフト標準</div>}
                          {metrics.twist>20&&<div>⚠ ツイスト大きい</div>}
                          {metrics.twist<=10&&<div>⚠ ツイスト小さい</div>}
                          {metrics.twist>10&&metrics.twist<=20&&<div style={{color:C.point}}>✓ ツイスト標準</div>}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {page==="mypage"&&(
          <MyPage
            sessions={mySessions}
            username={profileUsername}
            onUsernameChange={name=>{
              setProfileUsername(name);
              setFeedSessions(prev=>prev.map(s=>s.user===profileUsername?{...s,user:name}:s));
              setMySessions(prev=>prev.map(s=>({...s,user:name})));
            }}
            theme={theme}
            onThemeToggle={()=>setTheme(t=>t==="dark"?"light":"dark")}
            onLogout={async()=>{await supabase.auth.signOut();setAuthUser(null);setFeedSessions([]);setMySessions([]);}}
            onExport={()=>exportCSV(mySessions)}
            onDelete={handleDelete}
            onEdit={setEditingSession}
            avatarUrl={profileMap[authUser.id]}
            onAvatarUpload={handleAvatarUpload}
            onDeleteAccount={handleDeleteAccount}
            me={me}
            followingCount={followingIds.size}
            followerCount={followerCount}
          />
        )}
      </div>

      {editingSession&&<EditModal session={editingSession} onSave={handleEditSave} onClose={()=>setEditingSession(null)} pastLocations={[...new Set(mySessions.map(s=>s.cond?.location).filter(Boolean))]}/>}

      {/* ボトムナビ */}
      <div style={{height:56,flexShrink:0,borderTop:`1px solid ${C.border}`,background:C.panel,display:"flex",alignItems:"stretch"}}>
        {navItems.map(item=>(
          <button key={item.id}
            onClick={()=>{
              setPage(item.id);
              if(item.id==="analyze"){setMode("upload");setImgObj(null);setPoints([]);setMetrics(null);}
            }}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,background:"transparent",border:"none",cursor:"pointer",color:page===item.id?C.accent:C.textDim,borderTop:page===item.id?`2px solid ${C.accent}`:"2px solid transparent",transition:"color 0.15s"}}>
            <item.Icon size={22} strokeWidth={1.8}/>
            <span style={{fontSize:9,fontFamily:"inherit",letterSpacing:"0.06em"}}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
