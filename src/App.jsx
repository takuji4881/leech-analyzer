import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const C = {
  bg: "#0a0f1e", panel: "#0f1729", border: "#1e2d4a",
  accent: "#00c8ff", accentDim: "#0077aa",
  text: "#e8f0ff", textDim: "#5a7090",
  point: "#00ffaa", line: "#ff6b35",
};

const DIVISIONS = [0, 25, 50, 75, 100];
const SNAP_THRESHOLD = 40;
const LS_KEY = "leech_sessions";
const LS_USER = "leech_username";

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

function loadSessions() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } }
function saveSessions(arr) { try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {} }

function exportCSV(sessions) {
  const headers = ["id","date","user","boatClass","sailNumber","location","draftPosition","maxDraft","twist","windKnots","windDir","windStability","waveHeight","waveType","outhaul","cunningham","vang","comment"];
  const rows = sessions.map(s => headers.map(h => {
    const v = ["draftPosition","maxDraft","twist"].includes(h) ? (s.metrics?.[h]??"") : h==="user" ? (s.user||"") : (s.cond?.[h]??s[h]??"");
    return `"${String(v).replace(/"/g,'""')}"`;
  }).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const dataUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  const a = document.createElement("a"); a.href=dataUri; a.download=`leech_log_${today()}.csv`;
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
function Btn({children,onClick,disabled,secondary,as,style:sx}){
  const T=as||"button";
  return <T onClick={onClick} disabled={disabled} style={{background:secondary?"transparent":disabled?"#1a2a3a":C.accent,color:secondary?C.textDim:disabled?C.textDim:C.bg,border:`1px solid ${secondary?C.border:disabled?"#1a2a3a":C.accent}`,padding:"6px 12px",fontSize:11,fontFamily:"inherit",letterSpacing:"0.1em",cursor:disabled?"not-allowed":"pointer",borderRadius:4,fontWeight:700,whiteSpace:"nowrap",...sx}}>{children}</T>;
}
function Label({children}){ return <div style={{fontSize:9,color:C.textDim,letterSpacing:"0.22em",marginBottom:6}}>{children}</div>; }
function Metric({label,value,sub,active}){
  return <div><div style={{fontSize:9,color:C.textDim,letterSpacing:"0.18em",marginBottom:2}}>{label}</div><div style={{fontSize:20,fontWeight:700,color:active?C.accent:C.border,lineHeight:1,transition:"color 0.3s"}}>{value}</div><div style={{fontSize:9,color:C.textDim,marginTop:2}}>{sub}</div></div>;
}

function ConditionsForm({cond,setCond,user,setUser,onDone,metrics}) {
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
      <Field label="ユーザー名（あなたの名前）">
        <TextIn value={user} onChange={setUser} placeholder="例: 太郎"/>
      </Field>
      <div style={{borderTop:`1px solid ${C.border}`}}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <Field label="艇種"><TextIn value={cond.boatClass} onChange={set("boatClass")} placeholder="470, Laser..."/></Field>
        <Field label="艇番"><TextIn value={cond.sailNumber} onChange={set("sailNumber")} placeholder="1234"/></Field>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <Field label="日付"><input type="date" value={cond.date} onChange={e=>set("date")(e.target.value)} style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 9px",color:C.text,fontSize:11,fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box"}}/></Field>
        <Field label="場所"><TextIn value={cond.location} onChange={set("location")} placeholder="江の島, 琵琶湖..."/></Field>
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
      <button onClick={onDone} style={{background:C.point,color:C.bg,border:"none",borderRadius:4,padding:"11px",fontSize:12,fontFamily:"inherit",letterSpacing:"0.15em",fontWeight:700,cursor:"pointer"}}>SAVE & FINISH</button>
      <div style={{height:8}}/>
    </div>
  );
}

function LogModal({saved,onClose,onExport}) {
  const [expanded,setExpanded]=useState(null);
  const [search,setSearch]=useState("");
  const [fUser,setFUser]=useState("");
  const [fWind,setFWind]=useState("");
  const [fWave,setFWave]=useState("");

  const users=[...new Set(saved.map(s=>s.user).filter(Boolean))];
  const winds=[...new Set(saved.map(s=>s.cond?.windKnots).filter(Boolean))];
  const waves=[...new Set(saved.map(s=>s.cond?.waveHeight).filter(Boolean))];

  const filtered=[...saved].reverse().filter(s=>{
    const q=search.toLowerCase();
    const matchQ=!q||[s.user,s.cond?.boatClass,s.cond?.sailNumber,s.cond?.location,s.cond?.windDir,s.cond?.comment].some(v=>v?.toLowerCase().includes(q));
    return matchQ&&(!fUser||s.user===fUser)&&(!fWind||s.cond?.windKnots===fWind)&&(!fWave||s.cond?.waveHeight===fWave);
  });

  const hasFilter=search||fUser||fWind||fWave;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(10,15,30,0.98)",zIndex:100,display:"flex",flexDirection:"column"}}>
      {/* Modal header */}
      <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8,flexShrink:0,background:C.panel}}>
        <div style={{color:C.accent,fontSize:13,fontWeight:700,letterSpacing:"0.12em"}}>SESSION LOG</div>
        <div style={{fontSize:10,color:C.textDim}}>{filtered.length} / {saved.length} 件</div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <Btn onClick={onExport} secondary style={{fontSize:10}}>CSV ↓</Btn>
          <Btn onClick={onClose} secondary style={{fontSize:10}}>CLOSE</Btn>
        </div>
      </div>

      {/* Search & filter */}
      <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8,flexShrink:0,background:"rgba(15,23,41,0.95)"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  名前・艇種・場所・コメントで検索..."
          style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:4,padding:"7px 11px",color:C.text,fontSize:11,fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {users.length>0&&<><span style={{fontSize:9,color:C.textDim,letterSpacing:"0.15em"}}>USER</span>
            {users.map(u=><Chip key={u} label={u} active={fUser===u} onClick={()=>setFUser(f=>f===u?"":u)}/>)}
            <span style={{fontSize:9,color:C.border}}>|</span></>}
          {winds.length>0&&<><span style={{fontSize:9,color:C.textDim,letterSpacing:"0.15em"}}>風速</span>
            {winds.map(w=><Chip key={w} label={w} active={fWind===w} onClick={()=>setFWind(f=>f===w?"":w)}/>)}
            <span style={{fontSize:9,color:C.border}}>|</span></>}
          {waves.length>0&&<><span style={{fontSize:9,color:C.textDim,letterSpacing:"0.15em"}}>波</span>
            {waves.map(w=><Chip key={w} label={w} active={fWave===w} onClick={()=>setFWave(f=>f===w?"":w)}/>)}</>}
        </div>
        {hasFilter&&(
          <button onClick={()=>{setSearch("");setFUser("");setFWind("");setFWave("");}}
            style={{alignSelf:"flex-start",background:"transparent",border:`1px solid ${C.border}`,borderRadius:3,padding:"2px 10px",color:C.textDim,fontSize:9,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.1em"}}>
            フィルタをリセット ×
          </button>
        )}
      </div>

      {/* List */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>
        {filtered.length===0&&<div style={{color:C.textDim,fontSize:11,textAlign:"center",marginTop:40}}>条件に一致するセッションがありません</div>}
        {filtered.map(s=>(
          <div key={s.id} style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:6,overflow:"hidden"}}>
            <div style={{display:"flex",gap:12,padding:"12px 14px",alignItems:"flex-start"}}>
              {(s.annotatedImageUrl||s.originalImageUrl)&&(
                <img src={s.annotatedImageUrl||s.originalImageUrl} onClick={()=>setExpanded(expanded===s.id?null:s.id)}
                  style={{width:72,height:72,objectFit:"cover",borderRadius:4,border:`1px solid ${C.border}`,cursor:"pointer",flexShrink:0}} alt="sail"/>
              )}
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:5,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                  <div style={{minWidth:0}}>
                    {s.user&&<span style={{fontSize:10,color:C.point,marginRight:7,letterSpacing:"0.08em"}}>{s.user}</span>}
                    <span style={{fontSize:11,color:C.accent}}>
                      {s.cond?.boatClass&&`${s.cond.boatClass} `}{s.cond?.sailNumber&&`#${s.cond.sailNumber}`}
                      {!s.cond?.boatClass&&!s.cond?.sailNumber&&<span style={{color:C.textDim}}>—</span>}
                    </span>
                  </div>
                  <div style={{fontSize:9,color:C.textDim,flexShrink:0}}>{s.cond?.date}</div>
                </div>
                <div style={{display:"flex",gap:14}}>
                  {[["DRAFT",`${s.metrics?.draftPosition}%`],["MAX",`${s.metrics?.maxDraft}%`],["TWIST",`${s.metrics?.twist}°`]].map(([l,v])=>(
                    <div key={l}><div style={{fontSize:8,color:C.textDim}}>{l}</div><div style={{fontSize:16,fontWeight:700,color:C.accent}}>{v}</div></div>
                  ))}
                </div>
                {(s.cond?.windKnots||s.cond?.windDir||s.cond?.windStability)&&(
                  <div style={{fontSize:10,color:C.textDim}}>🌬 {[s.cond.windKnots&&`${s.cond.windKnots}kt`,s.cond.windDir,s.cond.windStability].filter(Boolean).join(" · ")}</div>
                )}
                {(s.cond?.waveHeight||s.cond?.waveType)&&(
                  <div style={{fontSize:10,color:C.textDim}}>🌊 {[s.cond.waveHeight,s.cond.waveType].filter(Boolean).join(" · ")}</div>
                )}
                {s.cond?.location&&<div style={{fontSize:10,color:C.textDim}}>📍 {s.cond.location}</div>}
                {s.cond?.comment&&<div style={{fontSize:10,color:C.textDim,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{s.cond.comment}"</div>}
              </div>
            </div>
            {expanded===s.id&&(s.annotatedImageUrl||s.originalImageUrl)&&(
              <img src={s.annotatedImageUrl||s.originalImageUrl} style={{width:"100%",display:"block",maxHeight:360,objectFit:"contain",background:"#050a14"}} alt="sail full"/>
            )}
          </div>
        ))}
      </div>
    </div>
  );
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
        <Field label="メールアドレス">
          <TextIn value={email} onChange={setEmail} placeholder="sailor@example.com"/>
        </Field>
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

export default function App() {
  const [imgObj,setImgObj]=useState(null);
  const [points,setPoints]=useState([]);
  const [metrics,setMetrics]=useState(null);
  const [mode,setMode]=useState("upload");
  const [snapHint,setSnapHint]=useState(null);
  const [cond,setCond]=useState(EMPTY_COND);
  const [user,setUser]=useState(()=>localStorage.getItem(LS_USER)||"");
  const [saved,setSaved]=useState([]);
  const [showLog,setShowLog]=useState(false);
  const [authUser,setAuthUser]=useState(null);
  const [authReady,setAuthReady]=useState(false);
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

  useEffect(()=>{localStorage.setItem(LS_USER,user);},[user]);
  useEffect(()=>{
    if(!authUser)return;
    const fetchSessions=async()=>{
      const{data,error}=await supabase.from("sessions").select("*").eq("user_id",authUser.id).order("created_at",{ascending:false});
      if(!error&&data){
        setSaved(data.map(s=>({
          id:s.id,originalImageUrl:s.original_image_url,annotatedImageUrl:s.annotated_image_url,user:s.user_name,
          metrics:{draftPosition:s.draft_position,maxDraft:s.max_draft,twist:s.twist},
          cond:{boatClass:s.boat_class,sailNumber:s.sail_number,date:s.date,location:s.location,
            windKnots:s.wind_knots,windDir:s.wind_dir,windStability:s.wind_stability,
            waveHeight:s.wave_height,waveType:s.wave_type,outhaul:s.outhaul,
            cunningham:s.cunningham,vang:s.vang,comment:s.comment},
        })));
      }
    };
    fetchSessions();
  },[authUser]);

  const draw=useCallback(()=>{
    const canvas=canvasRef.current,wrapper=wrapperRef.current;
    if(!canvas||!wrapper) return;
    const {imgObj:img,points:pts,snapHint:hint}=stateRef.current;
    if(!img) return;
    const dpr=window.devicePixelRatio||1;
    const W=wrapper.offsetWidth,H=wrapper.offsetHeight;
    if(!W||!H) return;
    if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){
      canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
      canvas.getContext("2d").setTransform(dpr,0,0,dpr,0,0);
    }
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,W,H);ctx.fillStyle="#050a14";ctx.fillRect(0,0,W,H);
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
    reader.onload=ev=>{const img=new Image();img.onload=()=>{setImgObj(img);setPoints([]);setMetrics(null);setMode("setTop");setCond(prev=>({...prev,date:today()}));};img.src=ev.target.result;};
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
      user_id:uid,user_name:user,boat_class:cond.boatClass,sail_number:cond.sailNumber,
      date:cond.date,location:cond.location,
      draft_position:metrics.draftPosition,max_draft:metrics.maxDraft,twist:metrics.twist,
      wind_knots:cond.windKnots,wind_dir:cond.windDir,wind_stability:cond.windStability,
      wave_height:cond.waveHeight,wave_type:cond.waveType,
      outhaul:cond.outhaul,cunningham:cond.cunningham,vang:cond.vang,
      comment:cond.comment,
      original_image_url:originalUrl,
      annotated_image_url:annotatedUrl,
    }).select().single();
    if(error){console.error("保存エラー:",error);alert("保存に失敗しました");return;}
    if(user)localStorage.setItem(LS_USER,user);
    setSaved(prev=>[{
      id:data.id,
      originalImageUrl:data.original_image_url,
      annotatedImageUrl:data.annotated_image_url,
      user:data.user_name,
      metrics:{draftPosition:data.draft_position,maxDraft:data.max_draft,twist:data.twist},
      cond:{boatClass:data.boat_class,sailNumber:data.sail_number,date:data.date,location:data.location,
        windKnots:data.wind_knots,windDir:data.wind_dir,windStability:data.wind_stability,
        waveHeight:data.wave_height,waveType:data.wave_type,outhaul:data.outhaul,
        cunningham:data.cunningham,vang:data.vang,comment:data.comment},
    },...prev]);
    setMode("upload");setImgObj(null);setPoints([]);setMetrics(null);setCond(EMPTY_COND);
    originalFileRef.current=null;
  };

  const [isMobile,setIsMobile]=useState(window.innerWidth<640);
  useEffect(()=>{
    const h=()=>setIsMobile(window.innerWidth<640);
    window.addEventListener("resize",h);
    return()=>window.removeEventListener("resize",h);
  },[]);

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

  if(!authReady) return <div style={{height:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:C.textDim,fontSize:11,letterSpacing:"0.15em"}}>LOADING...</div></div>;
  if(!authUser) return <AuthScreen onAuth={u=>setAuthUser(u)}/>;

  return (
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{borderBottom:`1px solid ${C.border}`,padding:"9px 16px",display:"flex",alignItems:"center",gap:12,background:C.panel,flexShrink:0}}>
        <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
          <path d="M14 2 L26 24 L14 20 L2 24 Z" stroke={C.accent} strokeWidth="1.8" fill="none"/>
          <path d="M14 2 L14 20" stroke={C.accent} strokeWidth="1.2" opacity="0.5"/>
        </svg>
        <div>
          <div style={{fontSize:12,fontWeight:700,letterSpacing:"0.12em",color:C.accent}}>LEECH ANALYZER</div>
          <div style={{fontSize:8,color:C.textDim,letterSpacing:"0.18em"}}>SAIL SHAPE v0.9</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>setShowLog(true)} style={{background:"transparent",border:`1px solid ${saved.length>0?C.accentDim:C.border}`,borderRadius:3,padding:"3px 10px",fontSize:10,color:saved.length>0?C.accent:C.textDim,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.1em",fontWeight:saved.length>0?700:400}}>
            LOG {saved.length>0?`(${saved.length})`:""}
          </button>
          <div style={{fontSize:9,color:C.textDim,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:3,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={authUser?.email}>{authUser?.email?.split("@")[0]}</div>
          <button onClick={async()=>{await supabase.auth.signOut();setAuthUser(null);setSaved([]);}}
            style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:3,padding:"2px 8px",fontSize:9,color:C.textDim,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.1em"}}>
            LOGOUT
          </button>
        </div>
      </div>

      <div style={{height:34,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,200,255,0.05)",borderBottom:`1px solid ${C.border}`,fontSize:11,color:mode==="conditions"?C.point:C.accent,padding:"0 12px",textAlign:"center"}}>
        {instr}
      </div>

      <div style={{display:"flex",flex:1,minHeight:0}}>
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,minHeight:0}}>
          {(isCanvasMode||mode==="upload")&&(
            <div ref={wrapperRef} style={{flex:1,position:"relative",minHeight:0,overflow:"hidden",background:"#050a14"}}>
              {mode==="upload"?(
                <label onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files?.[0]);}} onDragOver={e=>e.preventDefault()}
                  style={{position:"absolute",inset:8,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",gap:12,background:"#0a1320",border:`2px dashed ${C.accentDim}`,borderRadius:8}}>
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
            <ConditionsForm cond={cond} setCond={setCond} user={user} setUser={setUser} onDone={handleSave} metrics={metrics}/>
          )}

          {(isCanvasMode||mode==="upload")&&(
            <div style={{height:52,flexShrink:0,display:"flex",alignItems:"center",gap:8,padding:"0 12px",borderTop:`1px solid ${C.border}`}}>
              {isCanvasMode&&<Btn onClick={()=>{setPoints([]);setMetrics(null);setMode("setTop");}} secondary>RESET</Btn>}
              {isCanvasMode&&points.length>0&&<Btn onClick={()=>{
                setPoints(p=>{
                  const next=p.slice(0,-1);
                  // revert mode based on remaining points
                  const hasTop=next.some(pt=>pt.pct===0);
                  const hasBot=next.some(pt=>pt.pct===100);
                  if(!hasTop) setMode("setTop");
                  else if(!hasBot) setMode("setBot");
                  else setMode("trace");
                  return next;
                });
              }} secondary>UNDO</Btn>}
              {isCanvasMode&&<Btn onClick={handleGoConditions} disabled={!allPlaced}>ANALYZE →</Btn>}
              {mode==="upload"&&saved.length>0&&<div style={{marginLeft:"auto",fontSize:10,color:C.textDim}}>{saved.length}件のセッションが保存済み</div>}
            </div>
          )}
        </div>

        {!isMobile&&<div style={{width:185,flexShrink:0,borderLeft:`1px solid ${C.border}`,background:C.panel,padding:13,display:"flex",flexDirection:"column",gap:13,overflowY:"auto"}}>
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
                    <span style={{width:14,height:14,borderRadius:3,border:`1px solid ${placed?C.point:isHint?C.accent:C.border}`,background:placed?C.point:isHint?"rgba(0,200,255,0.2)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:C.bg,fontWeight:700,flexShrink:0}}>
                      {placed?"✓":""}
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
        </div>}
      </div>

      {showLog&&<LogModal saved={saved} onClose={()=>setShowLog(false)} onExport={()=>exportCSV(saved)}/>}
    </div>
  );
}
