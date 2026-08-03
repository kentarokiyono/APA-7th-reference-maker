/* 外部の書誌データベースへの問い合わせ。ここだけがネットワークに触れる */
import { blank } from "./types.js";
import { isCJK, stripTags, parsePeople, linkOf } from "./util.js";

/* アプリ側から設定される通信の方針 */
export const net = { proxy: false, mailto: "", japanese: true };
const validMail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const polite = () => validMail(net.mailto) ? "&mailto=" + encodeURIComponent(net.mailto) : "";
export { validMail };

const PROXIES = [
  u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  u => "https://corsproxy.io/?url=" + encodeURIComponent(u)
];

const MAX_BYTES = 3e6;
const TIMEOUT_MS = 12000;

/* 送信を最小化した fetch: Cookie を送らない・Referer を送らない・キャッシュしない・
   12秒でタイムアウト・応答サイズ上限あり。中継サーバーは明示的に許可した場合のみ。 */
async function getText(url, useProxy, accept){
  if(useProxy && !net.proxy) throw new Error("proxy-off");
  const targets = useProxy ? PROXIES.map(f => f(url)) : [url];
  let lastErr;
  for(const target of targets){
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try{
      const r = await fetch(target, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: {"Accept": accept || "application/json, text/xml, text/html"},
        signal: ctl.signal
      });
      if(!r.ok) throw new Error("HTTP " + r.status);
      const txt = await r.text();
      if(txt.length > MAX_BYTES) throw new Error("応答が大きすぎます");
      return txt;
    }catch(e){
      lastErr = e;
      if(e.message === "proxy-off") throw e;
    }finally{
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/* 取得先の検証: http/https 以外と、ローカル・内部ネットワーク宛は拒否 */
function safeURL(raw){
  let u;
  try{ u = new URL(raw.trim()); }catch(e){ throw new Error("URLの形式が不正です"); }
  if(u.protocol !== "http:" && u.protocol !== "https:") throw new Error("http / https 以外は取得しません");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if(h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1" ||
     /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
     /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
     /^(fc|fd|fe80)/.test(h))
    throw new Error("ローカル・内部ネットワークのアドレスは取得しません");
  return u.href;
}
async function getJSON(url, allowProxy){
  try{ return JSON.parse(await getText(url, false)); }
  catch(e){
    if(!allowProxy) throw e;
    return JSON.parse(await getText(url, true));
  }
}
async function getXML(url, allowProxy){
  let txt;
  try{ txt = await getText(url, false); }
  catch(e){
    if(!allowProxy) throw e;
    txt = await getText(url, true);
  }
  return new DOMParser().parseFromString(txt, "text/xml");
}

const splitName = n => {
  const t = (n || "").trim();
  if(!t) return null;
  if(isCJK(t)) return {family:t.replace(/\s+/g, " "), given:""};
  if(t.includes(",")){
    const [f, ...r] = t.split(",");
    return {family:f.trim(), given:r.join(",").trim()};
  }
  const p = t.split(/\s+/);
  if(p.length === 1) return {family:t, given:""};
  return {family:p.pop(), given:p.join(" ")};
};

/* --- Crossref --- */
const CR_TYPE = {"journal-article":"journal","book":"book","monograph":"book","edited-book":"editedbook",
  "book-chapter":"chapter","book-section":"chapter","book-part":"chapter","reference-entry":"encyclopedia",
  "proceedings-article":"conference","posted-content":"preprint","report":"report",
  "report-component":"report","dissertation":"thesis","dataset":"dataset","standard":"standard"};

function fromCrossref(it){
  const e = blank(); e.source = "Crossref";
  e.type = CR_TYPE[it.type] || "journal";
  const dp = ((it.issued || {})["date-parts"] || [[]])[0] || [];
  e.year = dp[0] ? String(dp[0]) : "";
  e.authors = (it.author || []).map(a => a.family ? {family:a.family, given:a.given || ""} : splitName(a.name)).filter(Boolean);
  e.editors = (it.editor || []).map(a => ({family:a.family || "", given:a.given || ""}));
  let t = (it.title || [])[0] || "";
  if((it.subtitle || [])[0]) t += ": " + it.subtitle[0];
  e.title = stripTags(t);
  e.container = stripTags((it["container-title"] || [])[0] || (it.event && it.event.name) || "");
  e.volume = it.volume || ""; e.issue = it.issue || ""; e.pages = it.page || "";
  e.number = it["article-number"] || "";
  e.publisher = it.publisher || "";
  e.doi = it.DOI ? "https://doi.org/" + it.DOI : (it.URL || "");
  if(e.type === "preprint" && !e.container) e.container = it["group-title"] || e.publisher;
  if(["book", "editedbook", "report"].includes(e.type)) e.container = "";
  return e;
}

/* --- OpenAlex --- */
const OA_TYPE = {"article":"journal","book":"book","book-chapter":"chapter","dissertation":"thesis",
  "preprint":"preprint","report":"report","dataset":"dataset","standard":"standard","paratext":"other"};
function fromOpenAlex(w){
  const e = blank(); e.source = "OpenAlex";
  e.type = OA_TYPE[w.type] || "journal";
  e.title = stripTags(w.display_name || w.title || "");
  e.year = w.publication_year ? String(w.publication_year) : "";
  e.authors = (w.authorships || []).map(a => splitName(a.author && a.author.display_name)).filter(Boolean);
  const src = (w.primary_location && w.primary_location.source) || {};
  e.container = src.display_name || "";
  e.publisher = src.host_organization_name || "";
  const b = w.biblio || {};
  e.volume = b.volume || ""; e.issue = b.issue || "";
  if(b.first_page) e.pages = b.first_page + (b.last_page ? "-" + b.last_page : "");
  e.doi = w.doi || (w.primary_location && w.primary_location.landing_page_url) || "";
  return e;
}

/* --- Semantic Scholar --- */
function fromS2(p){
  const e = blank(); e.source = "S2";
  e.type = "journal";
  e.title = stripTags(p.title || "");
  e.year = p.year ? String(p.year) : "";
  e.authors = (p.authors || []).map(a => splitName(a.name)).filter(Boolean);
  e.container = p.venue || "";
  if(p.journal){ e.volume = p.journal.volume || ""; e.pages = p.journal.pages || ""; }
  const ex = p.externalIds || {};
  e.doi = ex.DOI ? "https://doi.org/" + ex.DOI : (ex.ArXiv ? "https://arxiv.org/abs/" + ex.ArXiv : "");
  if(ex.ArXiv && !ex.DOI){ e.type = "preprint"; e.container = "arXiv"; }
  return e;
}

/* --- DataCite --- */
const DC_TYPE = {Dataset:"dataset", Text:"report", Software:"software", Report:"report",
  Dissertation:"thesis", Preprint:"preprint", ConferencePaper:"conference", Book:"book",
  BookChapter:"chapter", JournalArticle:"journal", Image:"other", Audiovisual:"video"};
function fromDataCite(d){
  const a = d.attributes || {};
  const e = blank(); e.source = "DataCite";
  e.type = DC_TYPE[(a.types || {}).resourceTypeGeneral] || "dataset";
  e.title = stripTags(((a.titles || [])[0] || {}).title || "");
  e.year = a.publicationYear ? String(a.publicationYear) : "";
  e.authors = (a.creators || []).map(c =>
    c.familyName ? {family:c.familyName, given:c.givenName || ""} : splitName(c.name)).filter(Boolean);
  e.publisher = typeof a.publisher === "string" ? a.publisher : ((a.publisher || {}).name || "");
  e.edition = a.version || "";
  e.doi = a.doi ? "https://doi.org/" + a.doi : (a.url || "");
  return e;
}

/* --- Google Books / Open Library --- */
function fromGoogleBooks(v){
  const vi = v.volumeInfo || {};
  const e = blank(); e.source = "Google Books"; e.type = "book";
  e.title = vi.title + (vi.subtitle ? ": " + vi.subtitle : "");
  e.authors = (vi.authors || []).map(splitName).filter(Boolean);
  e.year = (vi.publishedDate || "").slice(0, 4);
  e.publisher = vi.publisher || "";
  e.doi = vi.infoLink || "";
  return e;
}
function fromOpenLibrary(d){
  const e = blank(); e.source = "Open Library"; e.type = "book";
  e.title = d.title || "";
  e.authors = (d.author_name || []).map(splitName).filter(Boolean);
  e.year = d.first_publish_year ? String(d.first_publish_year) : "";
  e.publisher = (d.publisher || [])[0] || "";
  e.doi = d.key ? "https://openlibrary.org" + d.key : "";
  return e;
}

/* --- CiNii Research --- */
const cv = v => {
  if(v == null) return "";
  if(Array.isArray(v)) return cv(v[0]);
  if(typeof v === "object") return String(v["@value"] || v["@id"] || "");
  return String(v);
};
function fromCiNii(it){
  const e = blank(); e.source = "CiNii"; e.type = "journal";
  e.title = stripTags(cv(it["dc:title"] || it.title));
  const creators = it["dc:creator"];
  const arr = Array.isArray(creators) ? creators : (creators ? [creators] : []);
  e.authors = arr.map(c => splitName(cv(c))).filter(Boolean);
  e.container = cv(it["prism:publicationName"]);
  e.volume = cv(it["prism:volume"]);
  e.issue = cv(it["prism:number"]);
  const sp = cv(it["prism:startingPage"]), ep = cv(it["prism:endingPage"]);
  if(sp) e.pages = sp + (ep ? "-" + ep : "");
  const date = cv(it["prism:publicationDate"]) || cv(it["dc:date"]);
  e.year = (date.match(/\d{4}/) || [""])[0];
  e.publisher = cv(it["dc:publisher"]);
  e.doi = cv(it["prism:doi"]) ? "https://doi.org/" + cv(it["prism:doi"]) : cv(it["@id"]) || cv(it.link);
  if(!e.container) e.type = "book";
  return e;
}

/* --- 国立国会図書館サーチ --- */
function fromNDL(item){
  const g = tag => {
    const el = item.getElementsByTagName(tag)[0];
    return el ? (el.textContent || "").trim() : "";
  };
  const e = blank(); e.source = "NDL"; e.type = "book";
  e.title = g("title");
  const auth = g("author") || g("dc:creator");
  e.authors = auth ? auth.split(/[,、;／\/]/).map(s => splitName(s.replace(/\s*著$|\s*編$/, ""))).filter(Boolean) : [];
  e.publisher = g("dc:publisher");
  const date = g("dcterms:issued") || g("pubDate");
  e.year = (date.match(/\d{4}/) || [""])[0];
  e.doi = g("link") || g("guid");
  return e;
}

/* --- CSL-JSON: doi.org は登録機関 (Crossref / DataCite / JaLC / mEDRA) を問わず
   同じ形式でメタデータを返すため、DOI の取りこぼしを塞ぐ最終手段になる --- */
const CSL_TYPE = {
  "article-journal":"journal","article-magazine":"magazine","article-newspaper":"newspaper",
  "book":"book","chapter":"chapter","entry-encyclopedia":"encyclopedia",
  "paper-conference":"conference","speech":"presentation","report":"report",
  "thesis":"thesis","dataset":"dataset","software":"software","webpage":"webpage",
  "post-weblog":"blog","map":"map","legislation":"law","standard":"standard",
  "article":"journal","manuscript":"manuscript"
};

function fromCSL(c){
  const e = blank(); e.source = "doi.org";
  e.type = CSL_TYPE[c.type] || "journal";
  const person = a => a.literal ? splitName(a.literal)
    : {family: a.family || a.name || "", given: a.given || ""};
  e.authors = (c.author || []).map(person).filter(a => a && a.family);
  e.editors = (c.editor || []).map(person).filter(a => a && a.family);
  e.title = stripTags([].concat(c.title || "")[0] || "");
  if(c.subtitle && c.subtitle[0]) e.title += ": " + stripTags(c.subtitle[0]);
  e.container = stripTags([].concat(c["container-title"] || "")[0] || "");
  e.volume = c.volume ? String(c.volume) : "";
  e.issue = c.issue ? String(c.issue) : "";
  e.pages = c.page ? String(c.page) : "";
  e.number = c["article-number"] ? String(c["article-number"]) : "";
  e.edition = c.edition ? String(c.edition) : "";
  e.publisher = c.publisher || "";
  const d = (c.issued || c.published || {})["date-parts"];
  e.year = (d && d[0] && d[0][0]) ? String(d[0][0]) : "";
  e.doi = c.DOI ? "https://doi.org/" + c.DOI : (c.URL || "");
  if(["book","report","dataset","software"].includes(e.type)) e.container = "";
  return e;
}

/* --- ID 判定 --- */
function extractDOI(s){
  const m = decodeURIComponent(s).match(/10\.\d{4,9}\/[-._;()/:A-Z0-9<>\[\]]+/i);
  return m ? m[0].replace(/[.,;)\]]+$/, "") : null;
}

async function lookupDOI(doi){
  const p = doi.split("/").map(encodeURIComponent).join("/");
  const q = polite() ? "?" + polite().slice(1) : "";
  try{
    const d = await getJSON("https://api.crossref.org/works/" + p + q, true);
    return fromCrossref(d.message);
  }catch(e1){}
  try{
    /* Crossref に無い DOI（JaLC 登録の J-STAGE・機関リポジトリなど）はここで拾う */
    const txt = await getText("https://doi.org/" + doi, false, "application/vnd.citationstyles.csl+json");
    return fromCSL(JSON.parse(txt));
  }catch(e2){
    try{
      const txt = await getText("https://doi.org/" + doi, true, "application/vnd.citationstyles.csl+json");
      return fromCSL(JSON.parse(txt));
    }catch(e3){}
  }
  const d = await getJSON("https://api.datacite.org/dois/" + p, true);
  return fromDataCite(d.data);
}

async function lookupPMID(pmid){
  const d = await getJSON(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${pmid}`, true);
  const r = d.result[pmid];
  const e = blank(); e.source = "PubMed"; e.type = "journal";
  e.title = stripTags(r.title || "").replace(/\.$/, "");
  e.authors = (r.authors || []).filter(a => a.authtype === "Author").map(a => splitName(a.name)).filter(Boolean);
  e.container = r.fulljournalname || r.source || "";
  e.volume = r.volume || ""; e.issue = r.issue || ""; e.pages = r.pages || "";
  e.year = (r.pubdate || "").slice(0, 4);
  const doi = (r.articleids || []).find(x => x.idtype === "doi");
  e.doi = doi ? "https://doi.org/" + doi.value : "";
  return e;
}

/* --- 一般Webページ・自治体資料 --- */
const TODAY_EN = () => new Date().toLocaleDateString("en-US",
  {year:"numeric", month:"long", day:"numeric"});

/* 「ページ名 | 熊野町」のような和文タイトルを本文とサイト名に割る */
function splitSiteTitle(title){
  const parts = title.split(/\s*[|｜]\s*|\s+[-–—]\s+/).map(x => x.trim()).filter(Boolean);
  if(parts.length < 2) return {title: title, site: ""};
  const site = parts[parts.length - 1];
  if(site.length > 24) return {title: title, site: ""};
  return {title: parts.slice(0, -1).join(" - "), site};
}

/* schema.org (JSON-LD) から著者・日付・発行主体を拾う */
function readJSONLD(doc){
  const out = {};
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
    let data;
    try{ data = JSON.parse(el.textContent || ""); }catch(err){ return; }
    const list = Array.isArray(data) ? data : (data["@graph"] || [data]);
    list.forEach(o => {
      if(!o || typeof o !== "object") return;
      const t = String(o["@type"] || "");
      if(!/Article|Report|WebPage|BlogPosting|NewsArticle|Dataset|Book|Government/i.test(t)) return;
      out.type = out.type || t;
      out.title = out.title || o.headline || o.name || "";
      out.date = out.date || o.datePublished || o.dateCreated || "";
      if(!out.author && o.author){
        const a = [].concat(o.author)
          .map(x => typeof x === "string" ? x : (x && x.name) || "")
          .filter(Boolean);
        if(a.length) out.author = a.join("\n");
      }
      if(!out.publisher && o.publisher){
        out.publisher = typeof o.publisher === "string" ? o.publisher : (o.publisher.name || "");
      }
    });
  });
  return out;
}

function toEnglishDate(raw){
  if(!raw) return "";
  const jp = String(raw).match(/(\d{4})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})/);
  const d = jp ? new Date(+jp[1], +jp[2] - 1, +jp[3]) : new Date(raw);
  if(isNaN(d)) {
    const y = String(raw).match(/(19|20)\d{2}/);
    return y ? y[0] : "";
  }
  return `${d.getFullYear()}, ${d.toLocaleString("en-US", {month:"long"})} ${d.getDate()}`;
}

async function fetchWebpage(rawUrl){
  const url = safeURL(rawUrl);
  const host = new URL(url).hostname.replace(/^www\./, "");
  const gov = /\.go\.jp$|\.lg\.jp$|\.gov$|\.go\.jp\.|city\.|town\.|pref\./.test(host);

  /* PDF は中身を読めないので、枠だけ用意して手入力に回す */
  if(/\.pdf(\?|#|$)/i.test(url)){
    const e = blank();
    e.source = "PDF";
    e.type = "report";
    e.doi = url;
    e.retrieved = "";
    return e;
  }

  /* DOMParser("text/html") はスクリプトを実行せず、外部リソースも読み込まない */
  const doc = new DOMParser().parseFromString(await getText(url, true), "text/html");
  const meta = n => {
    const el = doc.querySelector(`meta[property="${n}"]`) || doc.querySelector(`meta[name="${n}"]`);
    return el ? (el.getAttribute("content") || "").trim() : "";
  };
  const ld = readJSONLD(doc);

  const e = blank();
  e.source = "Web";

  const rawTitle = stripTags(meta("og:title") || ld.title ||
    (doc.querySelector("h1") ? doc.querySelector("h1").textContent : "") ||
    (doc.querySelector("title") ? doc.querySelector("title").textContent : ""));
  const guess = splitSiteTitle(rawTitle);
  e.title = guess.title;
  e.container = stripTags(meta("og:site_name") || ld.publisher || meta("DC.publisher") ||
    meta("citation_publisher") || guess.site || host);

  const author = meta("author") || meta("article:author") || meta("citation_author") ||
    meta("DC.creator") || ld.author || "";
  if(author && !/^https?:/.test(author)) e.authors = parsePeople(author);

  e.year = toEnglishDate(meta("article:published_time") || meta("citation_publication_date") ||
    meta("DC.date") || meta("date") || meta("pubdate") || ld.date ||
    (doc.querySelector("time[datetime]") ? doc.querySelector("time[datetime]").getAttribute("datetime") : ""));

  /* 種類の推定 */
  const t = e.title;
  if(/youtube\.com|youtu\.be|vimeo\.com|nicovideo/.test(host)) e.type = "video";
  else if(/twitter\.com|x\.com|facebook\.com|instagram\.com|threads\.net/.test(host)) e.type = "social";
  else if(gov && /白書|報告書|計画|指針|ガイドライン|答申|調査結果|概要版|方針|report|plan/i.test(t)) e.type = "report";
  else if(gov && /統計|調査結果|人口|世帯数|統計表/.test(t)) e.type = "statistics";
  else if(/press|release|報道発表|プレスリリース/i.test(t)) e.type = "press";
  else if(/news|shimbun|asahi|yomiuri|mainichi|nikkei|sankei|nhk|kyodo|jiji/.test(host)) e.type = "news_web";
  else if(/blog|note\.com|hatena|medium\.com/.test(host)) e.type = "blog";
  else e.type = "webpage";

  /* 官公庁・自治体の資料は発行機関を著者位置に置くのが APA の作法 */
  if(!e.authors.length && (e.type === "report" || e.type === "statistics") && e.container){
    e.authors = parsePeople(e.container);
    e.publisher = e.container;
    e.container = "";
  }

  /* 日付が無いページは閲覧日を添える（APA 7） */
  if(!e.year && ["webpage", "statistics", "news_web", "blog"].includes(e.type)) e.retrieved = TODAY_EN();

  const cDoi = meta("citation_doi");
  e.doi = cDoi ? "https://doi.org/" + cDoi : url;
  return e;
}

/* --- 統合検索 --- */
function dedupe(items){
  const seen = new Map();
  items.forEach(e => {
    if(!e || !e.title) return;
    const doi = (linkOf(e).match(/10\.\d{4,9}\/\S+/) || [""])[0].toLowerCase();
    const key = doi || (stripTags(e.title).toLowerCase().replace(/[^a-z0-9\u3040-\u9fff]/g, "").slice(0, 60) + "|" + e.year);
    const prev = seen.get(key);
    if(!prev) seen.set(key, e);
    else{
      const score = x => (linkOf(x) ? 2 : 0) + (x.container ? 1 : 0) + (x.authors.length ? 1 : 0) + (x.pages ? 1 : 0);
      if(score(e) > score(prev)) seen.set(key, e);
    }
  });
  return [...seen.values()];
}

async function multiSearch(q){
  const jp = net.japanese && (isCJK(q) || /[ぁ-ん]/.test(q));
  const jobs = [
    getJSON("https://api.crossref.org/works?rows=6&select=DOI,title,subtitle,author,editor,issued,container-title,volume,issue,page,article-number,publisher,type,URL,event,group-title&query.bibliographic=" + encodeURIComponent(q) + polite(), true)
      .then(d => (d.message.items || []).map(fromCrossref)),
    getJSON("https://api.openalex.org/works?per-page=5&search=" + encodeURIComponent(q) + polite(), true)
      .then(d => (d.results || []).map(fromOpenAlex)),
    getJSON("https://api.semanticscholar.org/graph/v1/paper/search?limit=5&fields=title,year,authors,venue,journal,externalIds&query=" + encodeURIComponent(q), false)
      .then(d => (d.data || []).map(fromS2)),
    getJSON("https://api.datacite.org/dois?page[size]=4&query=" + encodeURIComponent(q), true)
      .then(d => (d.data || []).map(fromDataCite)),
    getJSON("https://www.googleapis.com/books/v1/volumes?maxResults=4&q=" + encodeURIComponent(q), true)
      .then(d => (d.items || []).map(fromGoogleBooks)),
    getJSON("https://openlibrary.org/search.json?limit=4&fields=title,author_name,first_publish_year,publisher,key&q=" + encodeURIComponent(q), true)
      .then(d => (d.docs || []).map(fromOpenLibrary))
  ];
  if(jp){
    jobs.push(
      getJSON("https://cir.nii.ac.jp/opensearch/all?format=json&count=6&q=" + encodeURIComponent(q), true)
        .then(d => {
          const g = (d["@graph"] || [])[0] || {};
          return (g.items || []).map(fromCiNii);
        }),
      getXML("https://ndlsearch.ndl.go.jp/api/opensearch?cnt=5&any=" + encodeURIComponent(q), true)
        .then(doc => [...doc.getElementsByTagName("item")].map(fromNDL))
    );
  }
  const res = await Promise.allSettled(jobs);
  const ok = res.filter(r => r.status === "fulfilled").flatMap(r => r.value || []);
  const failed = res.filter(r => r.status === "rejected").length;
  return {items: dedupe(ok), failed, total: jobs.length};
}

export { getText, getJSON, getXML, safeURL, extractDOI, lookupDOI, lookupPMID,
  fetchWebpage, multiSearch, dedupe, fromGoogleBooks, fromOpenLibrary };
