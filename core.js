/* 못타이나이 9차시 — 공통 엔진
   차시 화면(lesson.html)과 홈(index.html)이 함께 씁니다. */
"use strict";

var HOOK =
  "https://script.google.com/macros/s/AKfycbxAcwPN1WwC6bSQhGwQGH9i-ecfE2NHcDrlFQyWtcv-2e_nVId37g0SQC7nlZ0Lc2Tm9A/exec";
try { HOOK = localStorage.getItem("mottainai_hook") || HOOK; } catch(e){}

var $  = function(s, r){ return (r||document).querySelector(s); };
var $$ = function(s, r){ return [].slice.call((r||document).querySelectorAll(s)); };
var esc = function(s){ return String(s==null?"":s)
  .replace(/[&<>"]/g, function(c){ return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]; }); };

/* ── 인증번호 ──────────────────────────────────────────────── */
/* 선생님이 수업 시간에 알려 주시는 번호입니다.
   맞는지는 선생님 스크립트가 확인합니다. 이 파일에는 번호가 들어 있지 않습니다. */
var CODE = "";
try { CODE = localStorage.getItem("mottainai_code") || ""; } catch(e){}
function saveCode(c){ CODE = c; try { localStorage.setItem("mottainai_code", c); } catch(e){} }
function clearCode(){ CODE = "";
  try { localStorage.removeItem("mottainai_code"); localStorage.removeItem("mottainai_roster"); } catch(e){} }

/* ── 학생 정보 ─────────────────────────────────────────────── */
var ME = { cls:"", no:"", name:"" };
try { ME = JSON.parse(localStorage.getItem("mottainai_me")) || ME; } catch(e){}
function saveMe(){ try { localStorage.setItem("mottainai_me", JSON.stringify(ME)); } catch(e){} }
function meOk(){ return !!(CODE && ME.name && String(ME.name).trim()); }
function meLabel(){ return (ME.cls||"?") + "반 " + (ME.no||"?") + "번 " + (ME.name||""); }

/* 조사 골라 넣기 — {을}/{은}/{이}/{와} 자리에 받침에 맞는 것을 넣습니다 */
var JOSA = { "을":["을","를"], "은":["은","는"], "이":["이","가"], "와":["과","와"] };
function josa(word, tmpl){
  return String(tmpl).replace(/\{(을|은|이|와)\}/g, function(_, k){
    var last = String(word).replace(/[\s·]+$/, "").slice(-1);
    var c = last.charCodeAt(0);
    var hasBatchim = (c >= 0xAC00 && c <= 0xD7A3) ? ((c - 0xAC00) % 28 !== 0) : true;
    return JOSA[k][hasBatchim ? 0 : 1];
  });
}

/* ── 환경 ──────────────────────────────────────────────────── */
var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
var SECURE = (location.protocol === "https:" || location.hostname === "localhost");
var CAN_MIC = !!SR && SECURE;
var CAN_REC = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
                 window.MediaRecorder && SECURE);

/* ── 소리 내기 ─────────────────────────────────────────────── */
var VOICE = null;
function pickVoice(){
  var vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  VOICE = vs.filter(function(v){ return /^ja/i.test(v.lang); })[0] || null;
}
pickVoice();
if (window.speechSynthesis && speechSynthesis.onvoiceschanged !== undefined)
  speechSynthesis.onvoiceschanged = pickVoice;
function speak(t, slow){
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(t);
  u.lang = "ja-JP"; u.rate = slow ? 0.6 : 0.85;
  if (VOICE) u.voice = VOICE;
  speechSynthesis.speak(u);
}

/* ── 발음 채점 ─────────────────────────────────────────────── */
function norm(s){
  return String(s).replace(/[。、．，,.!?！？\s　]/g, "")
    .replace(/[ァ-ヶ]/g, function(c){ return String.fromCharCode(c.charCodeAt(0)-0x60); });
}
function lev(a,b){
  var m=a.length,n=b.length,i,j,prev=[],cur=[];
  if(!m) return n; if(!n) return m;
  for(j=0;j<=n;j++) prev[j]=j;
  for(i=1;i<=m;i++){ cur[0]=i;
    for(j=1;j<=n;j++) cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=cur.slice(); }
  return prev[n];
}
function match(said, targets){
  var s=norm(said), best=0, bt=targets[0];
  targets.forEach(function(t){
    var g=norm(t), v=1-lev(s,g)/Math.max(s.length,g.length,1);
    if(v>best){ best=v; bt=t; }
  });
  return { score:Math.max(0,Math.round(best*100)), target:bt };
}
function mark(said, target){
  var s=norm(said), g=norm(target), o="";
  for(var i=0;i<s.length;i++)
    o += (g.indexOf(s[i])>-1) ? '<span class="ok">'+esc(s[i])+'</span>'
                              : '<span class="no">'+esc(s[i])+'</span>';
  return o || '<span class="no">(들리지 않았습니다)</span>';
}
function hints(item, said){
  var s = norm(said);
  if (/[一-龯]/.test(s)) return [];
  return (item.check||[]).filter(function(c){ return s.indexOf(c[0]) === -1; })
                         .map(function(c){ return c[1]; });
}

/* 말하기 한 번 — 끝나면 cb({score, said, target, hints}) */
var MIC_BUSY = false;
function listen(item, btn, box, cb){
  if (MIC_BUSY || !CAN_MIC) return;
  MIC_BUSY = true;
  if (window.speechSynthesis) speechSynthesis.cancel();
  var rec = new SR();
  rec.lang = "ja-JP"; rec.interimResults = false; rec.maxAlternatives = 5;
  var label = btn.innerHTML;
  btn.classList.add("rec"); btn.textContent = "듣는 중…";
  box.className = "result on";
  box.innerHTML = '<p class="dim">지금 말해 보세요.</p>';
  rec.onresult = function(e){
    var best=0, said="", target=item.alt[0];
    for (var k=0;k<e.results[0].length;k++){
      var c=e.results[0][k].transcript, r=match(c, item.alt);
      if (r.score>best){ best=r.score; said=c; target=r.target; }
    }
    var hs = hints(item, said);
    var msg = hs.length ? "소리 하나만 더 살펴봐요"
            : best>=90 ? "아주 좋아요" : best>=70 ? "좋아요"
            : best>=50 ? "조금만 더 또박또박" : "다시 한 번 들어 볼까요";
    box.innerHTML =
      '<div class="dim">이렇게 들렸어요</div>' +
      '<div class="heard">' + mark(said, target) + '</div>' +
      '<div class="bar"><i style="width:'+best+'%"></i></div>' +
      '<div class="score"><span>'+msg+'</span><b>'+best+'점</b></div>' +
      hs.map(function(t){ return '<p class="tip block">'+esc(t)+'</p>'; }).join("");
    cb && cb({score:best, said:said});
  };
  rec.onerror = function(e){
    box.innerHTML = '<p class="err">' +
      (e.error==="not-allowed" ? "마이크가 막혀 있습니다. 주소창 옆에서 허용해 주세요."
       : e.error==="no-speech" ? "소리가 들리지 않았습니다. 조금 더 크게 말해 보세요."
       : "잠깐 문제가 있었습니다. 다시 눌러 주세요.") + '</p>';
  };
  rec.onend = function(){ MIC_BUSY=false; btn.classList.remove("rec"); btn.innerHTML=label; };
  try { rec.start(); } catch(err){ MIC_BUSY=false; btn.classList.remove("rec"); btn.innerHTML=label; }
}

/* ── 녹음 ──────────────────────────────────────────────────── */
function pickMime(){
  var c = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/aac"];
  for (var i=0;i<c.length;i++)
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c[i])) return c[i];
  return "";
}
function blobToBase64(b){
  return new Promise(function(res, rej){
    var r = new FileReader();
    r.onload = function(){ res(String(r.result).split(",")[1] || ""); };
    r.onerror = rej; r.readAsDataURL(b);
  });
}

/* ── 서버 ──────────────────────────────────────────────────── */
function submit(payload){
  payload.code = CODE;
  return fetch(HOOK, { method:"POST", mode:"no-cors",
    headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(payload) });
}
function fetchMine(){
  if (!meOk()) return Promise.resolve([]);
  var u = HOOK + "?cls=" + encodeURIComponent(ME.cls) +
          "&no=" + encodeURIComponent(ME.no) + "&name=" + encodeURIComponent(ME.name) +
          "&code=" + encodeURIComponent(CODE) +
          "&_=" + Date.now();
  return fetch(u, {cache:"no-store"})
    .then(function(r){ return r.json(); })
    .then(function(j){ return (j && j.rows) || []; })
    .catch(function(){ return null; });   // null = 못 불러옴(인터넷 문제 등)
}

/* 명단은 깃허브에 올리지 않고 선생님 스크립트에서 받아옵니다.
   (학생 이름이 공개 저장소에 남지 않도록) */
/* 인증번호가 맞는지 물어보고, 맞으면 명단을 함께 받아 옵니다.
   돌려주는 값 — 명단 객체 = 통과 / "틀림" = 번호가 다름 / null = 연결 실패 */
function checkCode(code){
  return fetch(HOOK + "?roster=1&code=" + encodeURIComponent(code) + "&_=" + Date.now(),
               {cache:"no-store"})
    .then(function(r){ return r.json(); })
    .then(function(j){
      if (j && j.roster) return j.roster;
      if (j && j.ok === false) return "틀림";
      return null;
    })
    .catch(function(){ return null; });
}

function fetchRoster(){
  if (window.ROSTER) return Promise.resolve(window.ROSTER);   // 로컬 시험용 roster.js
  try {
    var c = JSON.parse(localStorage.getItem("mottainai_roster"));
    if (c) return Promise.resolve(c);        // 이 기기에는 한 번만 받아 옵니다
  } catch(e){}
  if (!CODE) return Promise.resolve(null);
  return checkCode(CODE).then(function(R){
    // 선생님이 번호를 바꾸셨다면 지워서 다시 묻게 합니다
    if (R === "틀림"){ clearCode(); return null; }
    if (!R) return null;
    try { localStorage.setItem("mottainai_roster", JSON.stringify(R)); } catch(e){}
    return R;
  });
}

/* 내가 낸 것 기억해 두기 (인터넷이 끊겨도 홈에서 보이도록) */
function localDone(){
  try { return JSON.parse(localStorage.getItem("mottainai_done")) || {}; } catch(e){ return {}; }
}
function markDone(n, score){
  var d = localDone();
  d[n] = { at: Date.now(), score: (score==null?"":score) };
  try { localStorage.setItem("mottainai_done", JSON.stringify(d)); } catch(e){}
}

/* ── 아이콘 ────────────────────────────────────────────────── */
var IC = {
  play:'<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  slow:'<svg viewBox="0 0 24 24"><path d="M4 5v14l9-7zM15 5v14l2 0V5zM19 5v14l2 0V5z"/></svg>',
  mic :'<svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z"/></svg>',
  stop:'<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>',
  send:'<svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>',
  keep:'<svg viewBox="0 0 24 24"><path d="M17 3H5a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z"/></svg>'
};
