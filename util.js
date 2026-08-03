/* 文字列と人名の処理。DOM に触れない純粋な関数だけを置く */

const isCJK = s => /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(s || "");
const stripTags = s => (s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const esc = s => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dash = s => (s || "").replace(/\s*[-–—]\s*/g, "–");

function initials(given){
  if(!given) return "";
  return given.trim().split(/\s+/).map(part =>
    part.split("-").map(p => {
      const c = p.replace(/[.\s]/g, "").charAt(0);
      return c ? c.toUpperCase() + "." : "";
    }).filter(Boolean).join("-")
  ).filter(Boolean).join(" ");
}

function looksTitleCase(s){
  const w = s.split(/\s+/).filter(x => x.length > 3);
  if(w.length < 3) return false;
  return w.filter(x => /^[A-Z]/.test(x)).length / w.length > 0.6;
}

/* sentence case: 固有名詞を壊さないよう「小文字にしてよい語」を判定する。
   判定順 = 頭字語 → 文頭 → 固有名詞リスト → 地名語（直前が固有名詞のとき） → 一般語 → 接尾辞 → 残りは大文字のまま */
const COMMON = new Set(("a an the and or but not no nor of in on at by for with from to into onto upon "+
"as is are was were be been being do does did has have had can could may might must shall should will would "+
"this that these those it its their his her our your my we they he she you i "+
"about above across after against along among around before behind below beneath beside besides between beyond "+
"during except inside outside over through throughout toward towards under underneath until up via within without "+
"more most less least many much few several such same other others another each every both all any some none "+
"new old first second third early late later recent current future past present initial final "+
"case cases study studies research analysis analyses review overview survey report reports paper papers article "+
"approach approaches method methods methodology framework model models theory theories concept concepts "+
"effect effects impact impacts influence outcome outcomes result results finding findings evidence "+
"factor factors role roles use uses using used application applications practice practices process processes "+
"system systems network networks structure structures pattern patterns trend trends change changes "+
"development developments growth decline increase decrease reduction improvement "+
"management planning policy policies strategy strategies governance decision decisions "+
"community communities society social economic economy economics political culture cultural "+
"population populations resident residents people person household households citizen citizens "+
"health healthcare medical clinical mental physical wellbeing risk risks safety exposure dose "+
"radiation nuclear radioactive contamination decontamination emission emissions pollution "+
"disaster disasters earthquake tsunami flood flooding typhoon hazard hazards emergency crisis "+
"evacuation evacuees recovery reconstruction rehabilitation resilience vulnerability preparedness mitigation "+
"tourism tourist tourists travel visitor visitors heritage destination destinations hospitality "+
"region regional local national international global rural urban coastal inland "+
"land landscape environment environmental ecological ecosystem climate weather energy water soil air forest "+
"data dataset information knowledge evidence indicator indicators index measurement assessment evaluation "+
"education educational learning teaching training school schools student students "+
"industry industries agriculture agricultural fishery fisheries manufacturing business businesses market markets "+
"transport transportation infrastructure housing building buildings facility facilities service services "+
"migration mobility depopulation aging ageing demographic demography age gender women men children youth elderly "+
"public private government governmental municipal administrative institutional "+
"design designed development based driven led oriented related associated compared comparative "+
"analysis empirical quantitative qualitative statistical spatial temporal experimental theoretical "+
"between within across toward lessons lesson perspective perspectives implication implications challenge challenges "+
"role importance significance relationship relationships difference differences similarity "+
"quality quantity level levels rate rates scale scales size number amount "+
"toward evidence potential possible necessary important major minor main key core "+
"long short term terms year years month months day days time times period stage stages phase phases "+
"life living work working home place places space spaces area areas site sites zone zones "+
"support recovery response responses reaction adaptation adaptive sustainable sustainability "+
"question questions issue issues problem problems solution solutions "+
"introduction conclusion discussion background context overview summary "+
"accident accidents incident incidents damage damages loss losses death deaths injury injuries victim victims "+
"post pre non anti inter intra multi sub trans cross self semi mid co re counter over under").split(/\s+/));

const GEO = new Set(("city town village ward district prefecture province county state region island islands "+
"bay river valley mountain mountains peninsula coast basin plain lake sea gulf strait canal "+
"university institute college school hospital museum station port airport temple shrine park "+
"government ministry agency bureau department center centre street road bridge dam plant").split(" "));

const PROPER = new Set(("january february march april may june july august september october november december "+
"monday tuesday wednesday thursday friday saturday sunday "+
"beijing nanjing chongqing kunming wyoming reading hastings bath nice mobile turkey jordan chad mali china "+
"cologne florence naples").split(/\s+/));

const SUFFIX = /(tion|sion|ment|ness|ance|ence|ity|ism|ology|ography|graphy|ship|ships|able|ible|ical|less|ful|ous|ive|ives)$/;

function sentenceCase(str){
  const s = stripTags(str);
  if(!s || isCJK(s) || !looksTitleCase(s)) return s;
  let capNext = true, prevKeptCap = false;
  return s.split(/(\s+)/).map(w => {
    if(!w.trim()) return w;
    const endsSentence = /[.:?!]["')\]]*$/.test(w);
    let keptCap = false;
    const out = w.split("-").map((p, i) => {
      const core = p.replace(/[^A-Za-z']/g, "");
      if(!core) return p;
      const lower = core.toLowerCase();
      if(core.length > 1 && core === core.toUpperCase()){ keptCap = true; return p; }
      if(/[a-z][A-Z]/.test(p)){ keptCap = true; return p; }
      if(!/^[A-Z]/.test(p)) return p;
      if(capNext && i === 0) return p;
      if(PROPER.has(lower)){ keptCap = true; return p; }
      if(GEO.has(lower) && (prevKeptCap || keptCap)){ keptCap = true; return p; }
      if(COMMON.has(lower) || SUFFIX.test(lower)) return p.charAt(0).toLowerCase() + p.slice(1);
      keptCap = true;
      return p;
    }).join("-");
    prevKeptCap = keptCap;
    capNext = endsSentence;
    return out;
  }).join("");
}

function parsePeople(text){
  return (text || "").split(/[\n;]/).map(line => {
    const t = line.trim();
    if(!t) return null;
    if(t.includes(",")){
      const [family, ...rest] = t.split(",");
      return {family: family.trim(), given: rest.join(",").trim()};
    }
    if(isCJK(t)) return {family: t, given: ""};
    const parts = t.split(/\s+/);
    if(parts.length === 1) return {family: t, given: ""};
    return {family: parts.pop(), given: parts.join(" ")};
  }).filter(Boolean);
}
const peopleToText = list => list.map(a => a.given ? `${a.family}, ${a.given}` : a.family).join("\n");
const isOrg = a => !a.given && /\s/.test(a.family) && !isCJK(a.family);

function nameInverted(a){
  if(isCJK(a.family + a.given)) return (a.family + (a.given ? " " + a.given : "")).trim();
  if(isOrg(a)) return a.family;
  const ini = initials(a.given);
  return ini ? `${a.family}, ${ini}` : a.family;
}
function nameForward(a){
  if(isCJK(a.family + a.given) || isOrg(a)) return (a.family + (a.given ? " " + a.given : "")).trim();
  const ini = initials(a.given);
  return ini ? `${ini} ${a.family}` : a.family;
}
function joinAuthors(list){
  const n = list.map(nameInverted);
  if(!n.length) return "";
  if(n.length === 1) return n[0];
  if(n.length === 2) return `${n[0]}, & ${n[1]}`;
  if(n.length <= 20) return `${n.slice(0, -1).join(", ")}, & ${n[n.length - 1]}`;
  return `${n.slice(0, 19).join(", ")}, . . . ${n[n.length - 1]}`;
}
function joinEditors(list){
  const n = list.map(nameForward);
  if(!n.length) return "";
  if(n.length === 1) return n[0];
  if(n.length === 2) return `${n[0]} & ${n[1]}`;
  return `${n.slice(0, -1).join(", ")}, & ${n[n.length - 1]}`;
}

function linkOf(e){
  const d = (e.doi || "").trim();
  if(!d) return "";
  const m = d.match(/10\.\d{4,9}\/[^\s"<>]+/);
  if(m) return "https://doi.org/" + m[0].replace(/[.,;)\]]+$/, "");
  return d;
}

/* タグを外し、esc() が入れた実体参照を戻す */
export const toPlain = html => String(html)
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#0?39;/g, "'")
  .replace(/&amp;/g, "&");

/* innerHTML に入れる直前の最終防衛線: <em> と </em> 以外のタグを削除する */
export const sanitize = html => String(html).replace(/<(?!\/?em>)[^>]*>/gi, "");

export { isCJK, stripTags, esc, dash, initials, looksTitleCase, sentenceCase,
  parsePeople, peopleToText, isOrg, nameInverted, nameForward,
  joinAuthors, joinEditors, linkOf };
