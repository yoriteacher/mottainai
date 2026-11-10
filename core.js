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
var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
             (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
var SECURE = (location.protocol === "https:" || location.hostname === "localhost");
var CAN_MIC = !!SR && SECURE;
var CAN_REC = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
                 window.MediaRecorder && SECURE);

/* ── 소리 내기 ───────────────────────────── */
var VOICE = null;
/* 도쿄(공통어) 악센트 음성을 이름으로 먼저 고른다.
   Web Speech API에는 방언 설정이 없고, 악센트는 음성 엔진이 정한다.
   아래는 모두 표준어(도쿄 악센트) 음성이다 — 윈도우/맥/안드로이드/크롬 순.
   그다음은 기기 내장(localService) — 네트워크를 안 거쳠서 빠르다. */
var JA_STD = ["haruka","ayumi","ichiro","sayaka","nanami","keita",
              "kyoko","otoya","o-ren","hattori",
              "google 日本語","japanese japan"];
function pickVoice(){
  if (!window.speechSynthesis) return null;
  var vs = speechSynthesis.getVoices() || [];
  if (!vs.length) return null;
  var ja = vs.filter(function(v){ return /^ja/i.test(v.lang); });
  if (!ja.length) { VOICE = null; return null; }
  var named = null;
  for (var i = 0; i < JA_STD.length && !named; i++)
    named = ja.filter(function(v){
      return String(v.name).toLowerCase().indexOf(JA_STD[i]) > -1;
    })[0] || null;
  VOICE = named || ja.filter(function(v){ return v.localService; })[0] || ja[0];
  return VOICE;
}
pickVoice();
if (window.speechSynthesis && speechSynthesis.onvoiceschanged !== undefined)
  speechSynthesis.onvoiceschanged = pickVoice;

var SPEAK_T = null, SPEAK_KEEP = null;
function stopSpeak(){
  if (!window.speechSynthesis) return;
  if (SPEAK_T){ clearTimeout(SPEAK_T); SPEAK_T = null; }
  if (SPEAK_KEEP){ clearInterval(SPEAK_KEEP); SPEAK_KEEP = null; }
  try { speechSynthesis.cancel(); } catch(e){}
}
/* 【】 화면에는 띄어쓰기를 남기고, 소리낼 때만 공백을 버린다.
   일본어 TTS는 공백을 끊어 읽기로 보아, 「わたしたちの スローガンです」처럼
   중간에 공백이 있으면 뚝 끊기고 악센트가 평평해진다. */
function sayText(t){
  return String(t).replace(/[ 　]+/g, "");
}
function speak(t, slow){
  if (!window.speechSynthesis) return;
  t = sayText(t);
  if (!t) return;
  if (MIC_BUSY) return;                 /* 마이크가 켜져 있으면 소리를 내지 않는다 */
  var busy = speechSynthesis.speaking || speechSynthesis.pending;
  stopSpeak();
  if (!VOICE) pickVoice();
  function go(){
    SPEAK_T = null;
    var u = new SpeechSynthesisUtterance(t);
    u.lang = "ja-JP"; u.rate = slow ? 0.6 : 0.85;
    if (VOICE) u.voice = VOICE;
    u.onend = u.onerror = function(){
      if (SPEAK_KEEP){ clearInterval(SPEAK_KEEP); SPEAK_KEEP = null; }
    };
    /* 크롬은 긴 문장을 15초쯤에서 스스로 멈춘다. 깨워 둔다.
       다만 아이폰에서는 pause()/resume()를 걸면 읽던 것이 그 자리에서 끊긴다.
       아이폰은 스스로 멈추지도 않으니 깨울 까닭도 없다. */
    if (!IS_IOS){
      SPEAK_KEEP = setInterval(function(){
        if (!speechSynthesis.speaking){ clearInterval(SPEAK_KEEP); SPEAK_KEEP = null; return; }
        speechSynthesis.pause(); speechSynthesis.resume();
      }, 9000);
    }
    speechSynthesis.speak(u);
  }
  /* cancel() 직후에 바로 speak()하면 크롬 음성 엔진이 먹통해진다. 한 박자 쉬다. */
  if (busy) SPEAK_T = setTimeout(go, 120); else go();
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
  stopSpeak();
  var rec = new SR();
  rec.lang = "ja-JP"; rec.interimResults = false;
  /* 아이폰은 대안을 여러 개 달라고 하면 아무것도 안 돌려주는 일이 있다 */
  rec.maxAlternatives = IS_IOS ? 1 : 5;
  var label = btn.innerHTML;
  var 열렸나 = false, 깨우기 = null, 안전 = null, 끝났나 = false;
  btn.classList.add("rec"); btn.textContent = "듣는 중…";
  box.className = "result on";
  box.innerHTML = '<p class="dim">지금 말해 보세요.</p>';

  function 마치기(){
    if (끝났나) return; 끝났나 = true;
    clearTimeout(깨우기); clearTimeout(안전);
    MIC_BUSY = false;
    btn.classList.remove("rec"); btn.innerHTML = label;
  }
  function 열림(){ 열렸나 = true; clearTimeout(깨우기); 깨우기 = null; }
  rec.onstart = 열림;
  rec.onaudiostart = 열림;

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
    var 아이폰안내 =
      '마이크를 쓸 수 없습니다. ① 주소창 왼쪽 <b>ᴬA</b> → <b>웹사이트 설정</b>에서 마이크 허용, ' +
      '② <b>설정 → 일반 → 키보드 → 받아쓰기 켜기</b>를 확인해 주세요.';
    box.innerHTML = '<p class="err">' +
      ((e.error==="not-allowed" || e.error==="service-not-allowed")
         ? (IS_IOS ? 아이폰안내 : "마이크가 막혀 있습니다. 주소창 옆에서 허용해 주세요.")
       : e.error==="audio-capture" ? "마이크를 찾지 못했습니다. 이어폰을 뺐다 꽂거나 다른 앱(통화·녹음)을 닫고 다시 해 주세요."
       : e.error==="no-speech" ? "소리가 들리지 않았습니다. 조금 더 크게 말해 보세요."
       : e.error==="aborted" ? "그만두었습니다. 다시 눌러 주세요."
       : "잠깐 문제가 있었습니다. 다시 눌러 주세요.") + '</p>';
    마치기();
  };
  rec.onend = 마치기;

  try { rec.start(); }
  catch(err){
    /* 앞의 인식이 아직 안 끝난 경우 — 새로 만들어 한 번 더 */
    try { rec.abort(); } catch(e2){}
    box.innerHTML = '<p class="err">마이크를 열지 못했습니다. 잠시 뒤 다시 눌러 주세요.</p>';
    마치기(); return;
  }

  /* 아이폰은 받아쓰기가 꺼져 있으면 오류도 없이 조용하다. 2초 뒤에 확인한다. */
  깨우기 = setTimeout(function(){
    깨우기 = null;
    if (!끝났나 && !열렸나 && IS_IOS)
      box.innerHTML = '<p class="err">마이크가 열리지 않았습니다. ' +
        '<b>설정 → 일반 → 키보드 → 받아쓰기 켜기</b>를 켜고 다시 눌러 주세요.</p>';
  }, 2000);

  /* 아무 소식 없이 버튼이 「듣는 중…」에 멈춰 있지 않도록 */
  안전 = setTimeout(function(){
    if (!끝났나){ try { rec.stop(); } catch(e3){} }
    setTimeout(마치기, 1500);
  }, IS_IOS ? 12000 : 9000);
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
/* 아이폰은 화면이 잠기거나 다른 앱으로 넘어가면 보내던 것이 중간에 끊긴다.
   그래서 ① 세 번까지 다시 보내고 ② 그래도 안 되면 기기에 적어 두었다가
   다시 연결되면 저절로 보낸다. (녹음은 너무 커서 적어 두지 못한다) */
var 밀린열쇠 = "mottainai_못보낸";
function 한번보내기(payload){
  return fetch(HOOK, { method:"POST", mode:"no-cors",
    headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(payload) });
}
function 밀린것읽기(){
  try { return JSON.parse(localStorage.getItem(밀린열쇠)) || []; } catch(e){ return []; }
}
function 밀린것담기(p){
  try {
    var ㄴ = 밀린것읽기(), 가벼운 = {};
    for (var k in p) if (k !== "audio") 가벼운[k] = p[k];
    가벼운.녹음빠짐 = !!p.audio;          /* 녹음은 다시 받아야 한다 */
    ㄴ.push(가벼운);
    localStorage.setItem(밀린열쇠, JSON.stringify(ㄴ.slice(-20)));
  } catch(e){}
}
function 밀린것보내기(){
  if (navigator.onLine === false) return;
  var ㄴ = 밀린것읽기(); if (!ㄴ.length) return;
  try { localStorage.setItem(밀린열쇠, "[]"); } catch(e){}
  ㄴ.forEach(function(p){ 한번보내기(p).catch(function(){ 밀린것담기(p); }); });
}
window.addEventListener("online", 밀린것보내기);
document.addEventListener("visibilitychange", function(){
  if (document.visibilityState === "visible") 밀린것보내기();
});
setTimeout(밀린것보내기, 2500);

function submit(payload){
  payload.code = CODE;
  var 남은시도 = 3;
  function 다시(){
    return 한번보내기(payload).catch(function(err){
      남은시도--;
      if (남은시도 <= 0){ 밀린것담기(payload); throw err; }
      return new Promise(function(r){ setTimeout(r, 1200); }).then(다시);
    });
  }
  return 다시();
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

/* 저장해 둔 명단이 있으면 그것으로 바로 그리고,
   새 명단은 뒤에서 받아 옵니다. 선생님이 명단을 고치셔도 따라옵니다.
   onFresh(R) — 뒤에서 받은 명단이 저장된 것과 다를 때만 부릅니다. */
function fetchRoster(onFresh){
  if (window.ROSTER) return Promise.resolve(window.ROSTER);   // 로컬 시험용 roster.js

  var 저장된 = null, 저장글 = "";
  try {
    저장글 = localStorage.getItem("mottainai_roster") || "";
    저장된 = 저장글 ? JSON.parse(저장글) : null;
  } catch(e){}

  if (!CODE) return Promise.resolve(저장된);

  var 새로 = checkCode(CODE).then(function(R){
    // 선생님이 번호를 바꾸셨다면 지워서 다시 묻게 합니다
    if (R === "틀림"){ clearCode(); return null; }
    if (!R) return null;
    var 글 = JSON.stringify(R);
    try { localStorage.setItem("mottainai_roster", 글); } catch(e){}
    if (저장된 && 글 !== 저장글 && onFresh) onFresh(R);        // 바뀌었으면 다시 그리도록
    return R;
  });

  return 저장된 ? Promise.resolve(저장된) : 새로;
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
