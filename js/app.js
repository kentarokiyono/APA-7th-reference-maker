/* 画面との接続。状態はここだけが持つ */
import { TYPES, ALL_FIELDS, BASE_LABELS, blank } from "./types.js";
import { stripTags, peopleToText, parsePeople, linkOf, toPlain, sanitize } from "./util.js";
import { buildHTML, inText, suffixesFor, checkEntry } from "./format.js";
import { net, validMail, getJSON, extractDOI, lookupDOI, lookupPMID,
         fetchWebpage, multiSearch, dedupe, fromGoogleBooks, fromOpenLibrary } from "./sources.js";
import { parseAny, toBibTeX } from "./importers.js";
import { saveState, loadState } from "./store.js";

const $ = id => document.getElementById(id);

let entry = blank();
let saved = [];
let candidates = [];

/* ============ 資料タイプの選択肢 ============ */
Object.entries(TYPES).forEach(([k, v]) => {
  const o = document.createElement("option");
  o.value = k; o.textContent = v.ja;
  $("f-type").appendChild(o);
});

/* ============ 出力の設定 ============ */
const opts = () => ({
  sentence: $("sentence").checked,
  jpNote: $("jp-note").checked,
  noDoi: $("no-doi").checked
});

/* 同一著者・同一年の a / b を、リスト全体を見て決める */
function suffixMap(){
  const sfx = suffixesFor(saved.map(s => s.entry));
  const m = new Map();
  saved.forEach((s, i) => m.set(s, sfx[i]));
  return m;
}
function currentSuffix(){
  const others = saved.map(s => s.entry).filter(x => !sameWork(x, entry));
  const list = others.concat([entry]);
  return suffixesFor(list)[list.length - 1];
}

/* 同じ文献かどうか: DOI が両方あれば DOI、無ければ題名と年 */
function sameWork(a, b){
  const doi = x => (linkOf(x).match(/10\.\d{4,9}\/\S+/) || [""])[0].toLowerCase();
  const da = doi(a), db = doi(b);
  if(da && db) return da === db;
  const norm = x => stripTags(x.title).toLowerCase().replace(/[^a-z0-9\u3040-\u9fff]/g, "").slice(0, 60);
  const na = norm(a);
  return !!na && na === norm(b) && (a.year || "").slice(0, 4) === (b.year || "").slice(0, 4);
}

/* ============ フォーム ============ */
function applyTypeUI(){
  const t = TYPES[$("f-type").value] || TYPES.other;
  ALL_FIELDS.forEach(f => {
    const w = $("w-" + f);
    const on = t.show.includes(f);
    w.hidden = !on;
    if(on) w.querySelector("label").textContent = (t.labels && t.labels[f]) || BASE_LABELS[f];
  });
  $("w-retrieved").hidden = !["webpage", "statistics", "news_web", "other"].includes($("f-type").value);
}

const FORM_FIELDS = ["type","year","authors","title","translated","container","volume","issue",
  "pages","number","edition","publisher","editors","location","descriptor","retrieved","doi","original"];

function fillForm(){
  $("f-type").value = TYPES[entry.type] ? entry.type : "other";
  $("f-year").value = entry.year;
  $("f-authors").value = peopleToText(entry.authors);
  $("f-title").value = stripTags(entry.title);
  $("f-translated").value = entry.translated;
  $("f-container").value = entry.container;
  $("f-volume").value = entry.volume;
  $("f-issue").value = entry.issue;
  $("f-pages").value = entry.pages;
  $("f-number").value = entry.number;
  $("f-edition").value = entry.edition;
  $("f-publisher").value = entry.publisher;
  $("f-editors").value = peopleToText(entry.editors);
  $("f-location").value = entry.location;
  $("f-descriptor").value = entry.descriptor;
  $("f-retrieved").value = entry.retrieved;
  $("f-doi").value = entry.doi;
  $("f-original").value = entry.original || "";
  applyTypeUI();
  render();
}

function readForm(){
  entry.type = $("f-type").value;
  entry.year = $("f-year").value;
  entry.authors = parsePeople($("f-authors").value);
  entry.title = $("f-title").value;
  entry.translated = $("f-translated").value;
  entry.container = $("f-container").value;
  entry.volume = $("f-volume").value;
  entry.issue = $("f-issue").value;
  entry.pages = $("f-pages").value;
  entry.number = $("f-number").value;
  entry.edition = $("f-edition").value;
  entry.publisher = $("f-publisher").value;
  entry.editors = parsePeople($("f-editors").value);
  entry.location = $("f-location").value;
  entry.descriptor = $("f-descriptor").value;
  entry.retrieved = $("f-retrieved").value;
  entry.doi = $("f-doi").value;
  entry.original = $("f-original").value;
  render();
}

FORM_FIELDS.forEach(f => {
  const el = $("f-" + f);
  el.addEventListener("input", readForm);
  el.addEventListener("change", () => { if(f === "type") applyTypeUI(); readForm(); });
});
["sentence","jp-note"].forEach(id => $(id).addEventListener("change", render));
$("no-doi").addEventListener("change", () => { render(); drawList(); });

function render(){
  const html = buildHTML(entry, Object.assign(opts(), {suffix: currentSuffix()}));
  if(html.trim()) $("out").innerHTML = sanitize(html);
  else $("out").textContent = "まだ何も選ばれていません。";
  const it = inText(entry, currentSuffix());
  $("intext-p").textContent = it.paren;
  $("intext-n").textContent = it.narrative;
  drawIssues();
}

/* 入力の抜けを静かに指摘する */
function drawIssues(){
  const box = $("issues");
  const msgs = (stripTags(entry.title) || entry.authors.length) ? checkEntry(entry) : [];
  box.innerHTML = "";
  box.hidden = !msgs.length;
  msgs.forEach(m => {
    const li = document.createElement("li");
    li.textContent = m;
    box.appendChild(li);
  });
}

/* ============ 通信の設定 ============ */
function status(msg, isErr){
  const el = $("status");
  el.hidden = !msg;
  el.textContent = msg || "";
  el.className = "status" + (isErr ? " err" : "");
}

function showMailState(){
  const el = $("mailto-state");
  if(!net.mailto) el.textContent = "未設定：匿名プールで検索します。";
  else if(!validMail(net.mailto)) el.textContent = "メールアドレスの形式が不正です。匿名プールで検索します。";
  else el.textContent = "polite pool を使用中。";
}
$("mailto").addEventListener("input", e => { net.mailto = e.target.value.trim(); showMailState(); persist(); });
$("use-proxy").addEventListener("change", e => { net.proxy = e.target.checked; persist(); });
$("jp-src").addEventListener("change", e => { net.japanese = e.target.checked; persist(); });

/* ============ 検索 ============ */
function showResults(items){
  candidates = items;
  const ul = $("results");
  ul.innerHTML = "";
  items.forEach((e, i) => {
    const li = document.createElement("li");
    li.tabIndex = 0;
    const names = e.authors.map(a => a.family).slice(0, 3).join(", ") + (e.authors.length > 3 ? " ほか" : "");
    const t = document.createElement("div");
    t.className = "r-title";
    t.textContent = stripTags(e.title) || "(タイトルなし)";
    const m = document.createElement("div");
    m.className = "r-meta";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = (TYPES[e.type] || {}).ja || e.type;
    m.appendChild(tag);
    m.appendChild(document.createTextNode(
      [names.trim(), e.year, stripTags(e.container), e.source].filter(Boolean).join(" · ")));
    li.appendChild(t);
    li.appendChild(m);
    const pick = () => {
      entry = Object.assign(blank(), items[i]);
      fillForm();
      $("out").scrollIntoView({block:"center", behavior:"smooth"});
    };
    li.addEventListener("click", pick);
    li.addEventListener("keydown", ev => {
      if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); pick(); return; }
      if(ev.key === "ArrowDown" || ev.key === "ArrowUp"){
        ev.preventDefault();
        const next = ev.key === "ArrowDown" ? li.nextElementSibling : li.previousElementSibling;
        if(next) next.focus();
        else if(ev.key === "ArrowUp") $("q").focus();
      }
    });
    ul.appendChild(li);
  });
}

async function search(){
  const q = $("q").value.trim();
  if(!q) return;
  $("results").innerHTML = "";
  status("検索中…");
  $("go").disabled = true;
  try{
    const doi = extractDOI(q);
    const arxiv = q.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})/i) || q.match(/^arxiv:\s*([0-9]{4}\.[0-9]{4,5})/i);
    const isbn = q.replace(/[-\s]/g, "").match(/^(?:97[89])?\d{9}[\dXx]$/);
    const pmid = q.match(/^(?:pmid:?\s*)?(\d{7,8})$/i);

    if(doi || arxiv){
      const e = await lookupDOI(doi || "10.48550/arXiv." + arxiv[1]);
      showResults([e]); entry = e; fillForm(); status("");
    }else if(pmid){
      const e = await lookupPMID(pmid[1]);
      showResults([e]); entry = e; fillForm(); status("");
    }else if(isbn){
      const n = q.replace(/[-\s]/g, "");
      const [g, o] = await Promise.allSettled([
        getJSON("https://www.googleapis.com/books/v1/volumes?q=isbn:" + n, true),
        getJSON("https://openlibrary.org/search.json?limit=3&fields=title,author_name,first_publish_year,publisher,key&q=" + n, true)
      ]);
      let items = [];
      if(g.status === "fulfilled") items = items.concat((g.value.items || []).map(fromGoogleBooks));
      if(o.status === "fulfilled") items = items.concat((o.value.docs || []).map(fromOpenLibrary));
      items = dedupe(items);
      if(!items.length) throw new Error("該当なし");
      showResults(items); entry = Object.assign(blank(), items[0]); fillForm(); status("");
    }else if(/^https?:\/\//i.test(q)){
      status("ページを読み込み中…");
      const e = await fetchWebpage(q);
      showResults([e]); entry = e; fillForm();
      status(e.source === "PDF"
        ? "PDFは中身を読めないため、URLと種類だけ入れました。表紙の情報を見てタイトル・発行機関・発行年を入力してください。"
        : "ページから取得しました。著者・日付・種類は必ず確認してください（自動判定です）。");
    }else{
      const {items, failed, total} = await multiSearch(q);
      if(!items.length) throw new Error("該当なし");
      showResults(items);
      status(`${items.length}件（${total - failed}/${total}のデータベースが応答）。該当するものを選んでください。`);
    }
  }catch(err){
    const msg = err.message || "";
    if(msg === "proxy-off" || err.name === "AbortError"){
      status(err.name === "AbortError"
        ? "時間内に応答がありませんでした。もう一度試すか、下のフォームに直接入力してください。"
        : "この取得先はCORSを許可していないため、中継サーバーが必要です。上の「中継サーバーの使用を許可する」をオンにするか、下のフォームに直接入力してください。", true);
      return;
    }
    const blocked = /Load failed|Failed to fetch|NetworkError|CORS/i.test(msg);
    status(blocked
      ? "外部への通信がブロックされています。file:// で開いている場合は、GitHub Pages 等に置いて実行してください。下のフォームへの直接入力は使えます。"
      : "取得できませんでした（" + msg + "）。下のフォームに直接入力すれば整形できます。", true);
  }finally{
    $("go").disabled = false;
  }
}
$("go").addEventListener("click", search);
$("q").addEventListener("keydown", e => {
  if(e.key === "Enter") search();
  if(e.key === "ArrowDown"){
    const first = $("results").firstElementChild;
    if(first){ e.preventDefault(); first.focus(); }
  }
});

/* ============ コピー ============ */
async function copy(html, text){
  try{
    if(navigator.clipboard && window.ClipboardItem && window.isSecureContext){
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], {type:"text/html"}),
        "text/plain": new Blob([text], {type:"text/plain"})
      })]);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  }catch(e){
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove();
    return ok;
  }
}
function flash(btn, msg){
  const old = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = old; }, 1400);
}
const wrapFont = html => `<span style="font-family:'Times New Roman',serif">${html}</span>`;

$("copy").addEventListener("click", async e => {
  const html = buildHTML(entry, Object.assign(opts(), {suffix: currentSuffix()}));
  if(!toPlain(html).trim()) return;
  await copy(wrapFont(sanitize(html)), toPlain(html));
  flash(e.target, "コピーしました");
});
$("copy-in").addEventListener("click", async e => {
  const it = inText(entry, currentSuffix());
  await copy(wrapFont(it.paren), it.paren);
  flash(e.target, "コピーしました");
});
$("reset").addEventListener("click", () => { entry = blank(); fillForm(); });

/* ============ リスト ============ */
function addEntry(e, silent){
  const src = e || entry;
  if(!toPlain(buildHTML(src, opts())).trim()) return false;
  if(saved.some(s => sameWork(s.entry, src))){
    if(silent) return false;
    if(!confirm("同じ文献が既にリストにあります。それでも追加しますか？")) return false;
  }
  const first = src.authors[0];
  const key = (first ? first.family : (stripTags(src.container) || stripTags(src.title))).toLowerCase();
  saved.push({
    entry: JSON.parse(JSON.stringify(src)),
    sentence: $("sentence").checked,
    jpNote: $("jp-note").checked,
    key
  });
  drawList();
  render();
  persist();
  return true;
}
$("add").addEventListener("click", e => { if(addEntry()) flash(e.target, "追加しました"); });

const renderSaved = (item, map) => buildHTML(item.entry, {
  sentence: item.sentence, jpNote: item.jpNote,
  noDoi: $("no-doi").checked, suffix: (map || suffixMap()).get(item) || ""
});

const sortedSaved = () => saved.slice().sort((a, b) => a.key.localeCompare(b.key, "en"));

function drawList(){
  const ul = $("list");
  const map = suffixMap();
  ul.innerHTML = "";
  $("count").textContent = saved.length + "件";
  if(!saved.length){
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "まだ何もありません。";
    ul.appendChild(li);
    return;
  }
  sortedSaved().forEach(item => {
    const li = document.createElement("li");
    li.innerHTML = sanitize(renderSaved(item, map));
    const edit = document.createElement("button");
    edit.className = "ghost small edit";
    edit.textContent = "編集";
    edit.addEventListener("click", () => {
      entry = JSON.parse(JSON.stringify(item.entry));
      $("sentence").checked = item.sentence;
      $("jp-note").checked = item.jpNote;
      saved.splice(saved.indexOf(item), 1);
      drawList(); fillForm(); persist();
      $("out").scrollIntoView({block:"center", behavior:"smooth"});
    });
    const del = document.createElement("button");
    del.className = "ghost small del";
    del.textContent = "削除";
    del.addEventListener("click", () => {
      saved.splice(saved.indexOf(item), 1);
      drawList(); render(); persist();
    });
    li.appendChild(edit);
    li.appendChild(del);
    ul.appendChild(li);
  });
}

$("copy-all").addEventListener("click", async e => {
  if(!saved.length) return;
  const map = suffixMap();
  const html = wrapFont(sortedSaved().map(s =>
    `<p style="text-indent:-2em;padding-left:2em;margin:0 0 .6em">${sanitize(renderSaved(s, map))}</p>`).join(""));
  const text = sortedSaved().map(s => toPlain(renderSaved(s, map))).join("\n\n");
  await copy(html, text);
  flash(e.target, "コピーしました");
});

function download(name, text, mime){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], {type: (mime || "text/plain") + ";charset=utf-8"}));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
$("download").addEventListener("click", () => {
  if(!saved.length) return;
  const map = suffixMap();
  download("references.txt", "References\n\n" + sortedSaved().map(s => toPlain(renderSaved(s, map))).join("\n\n"));
});
$("export-bib").addEventListener("click", () => {
  if(!saved.length) return;
  download("references.bib", sortedSaved().map((s, i) => toBibTeX(s.entry, i)).join("\n\n"), "application/x-bibtex");
});
$("clear").addEventListener("click", () => {
  if(saved.length && confirm("リストを空にしますか？この操作は取り消せません。")){
    saved = []; drawList(); render(); persist();
  }
});

/* ============ RIS / BibTeX 読み込み ============ */
function importText(text){
  const items = parseAny(text);
  if(!items.length){
    status("RIS / BibTeX として読めませんでした。書き出し形式を確認してください。", true);
    return;
  }
  let added = 0, skipped = 0;
  items.forEach(e => { if(addEntry(e, true)) added++; else skipped++; });
  $("import-text").value = "";
  status(`${added}件を追加しました${skipped ? `（重複または空の${skipped}件は除外）` : ""}。`);
}
$("import-go").addEventListener("click", () => importText($("import-text").value));
$("import-file").addEventListener("change", e => {
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  const r = new FileReader();
  r.onload = () => importText(String(r.result));
  r.readAsText(f);
  e.target.value = "";
});

/* ============ キーボード ============ */
document.addEventListener("keydown", e => {
  const mod = e.metaKey || e.ctrlKey;
  if(mod && e.key === "Enter"){ e.preventDefault(); addEntry(); }
  if(mod && (e.key === "k" || e.key === "K")){ e.preventDefault(); $("q").focus(); $("q").select(); }
});

/* ============ 保存と復元 ============ */
function persist(){
  saveState({
    saved,
    mailto: net.mailto,
    proxy: net.proxy,
    japanese: net.japanese,
    sentence: $("sentence").checked,
    jpNote: $("jp-note").checked,
    noDoi: $("no-doi").checked
  });
}

function restore(){
  const s = loadState();
  if(!s) return;
  if(Array.isArray(s.saved)){
    saved = s.saved.filter(x => x && x.entry).map(x => ({
      entry: Object.assign(blank(), x.entry),
      sentence: x.sentence !== false,
      jpNote: !!x.jpNote,
      key: x.key || ""
    }));
  }
  net.mailto = s.mailto || "";
  net.proxy = !!s.proxy;
  net.japanese = s.japanese !== false;
  $("mailto").value = net.mailto;
  $("use-proxy").checked = net.proxy;
  $("jp-src").checked = net.japanese;
  $("sentence").checked = s.sentence !== false;
  $("jp-note").checked = !!s.jpNote;
  $("no-doi").checked = !!s.noDoi;
}

/* ============ 起動 ============ */
restore();
showMailState();
applyTypeUI();
drawList();
render();

if("serviceWorker" in navigator && location.protocol === "https:"){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
