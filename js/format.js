/* APA 7th の組み立て。表示にも、コピーにも、書き出しにも同じ関数を使う */
import { TYPES } from "./types.js";
import { isCJK, stripTags, esc, dash, sentenceCase, joinAuthors, joinEditors, linkOf } from "./util.js";

export function buildHTML(e, o){
  o = o || {};
  const optSentence = o.sentence !== undefined ? o.sentence : true;
  const optJpNote = o.jpNote !== undefined ? o.jpNote : false;
  const optNoDoi = o.noDoi !== undefined ? o.noDoi : false;
  const suffix = o.suffix || "";
  const t = TYPES[e.type] || TYPES.other;
  const A = joinAuthors(e.authors);
  const year = withSuffix(e.year.trim() || "n.d.", suffix);
  let titleText = optSentence ? sentenceCase(e.title) : stripTags(e.title);
  if(!titleText && !A) return "";
  let T = esc(titleText);
  if(e.translated.trim()) T += ` [${esc(stripTags(e.translated))}]`;
  const title = t.standalone ? `<em>${T}</em>` : T;

  const C = esc(stripTags(e.container));
  const P = esc(stripTags(e.publisher));
  const pages = esc(dash(e.pages));
  const url = optNoDoi ? "" : linkOf(e);
  const link = url ? (e.retrieved.trim()
    ? `Retrieved ${esc(e.retrieved.trim())}, from ${esc(url)}`
    : esc(url)) : "";

  const descriptor = (e.descriptor || t.desc || "").trim();
  const descPart = descriptor ? ` [${esc(descriptor)}]` : "";
  const editors = joinEditors(e.editors);
  const edLabel = e.editors.length > 1 ? "Eds." : "Ed.";

  let head = A ? `${esc(A)} (${esc(year)}).` : `(${esc(year)}).`;
  if(!A && C && ["webpage", "news_web", "press", "statistics"].includes(e.type)){
    head = `${C} (${esc(year)}).`;
  }
  if(e.type === "editedbook" && editors && !A) head = `${esc(editors)} (${edLabel}). (${esc(year)}).`;

  const parts = [];
  const push = s => { if(s && s.trim()) parts.push(s.trim()); };

  push(head);

  switch(e.type){
    case "journal":
    case "magazine": {
      push(title + descPart + ".");
      if(C){
        let s = `<em>${C}${e.volume ? ", " + esc(e.volume) : ""}</em>`;
        if(e.issue) s += `(${esc(e.issue)})`;
        if(pages) s += `, ${pages}`;
        else if(e.number) s += `, Article ${esc(e.number)}`;
        push(s + ".");
      }
      break;
    }
    case "newspaper": {
      push(title + descPart + ".");
      push(C ? `<em>${C}</em>${pages ? ", " + pages : ""}.` : "");
      break;
    }
    case "book":
    case "editedbook": {
      let s = title;
      if(e.edition) s += ` (${esc(e.edition)} ed.)`;
      push(s + descPart + ".");
      push(P ? P + "." : "");
      break;
    }
    case "chapter":
    case "encyclopedia": {
      push(title + descPart + ".");
      let s = "In ";
      if(editors) s += `${esc(editors)} (${edLabel}), `;
      s += `<em>${C}</em>`;
      const inner = [];
      if(e.edition) inner.push(`${esc(e.edition)} ed.`);
      if(pages) inner.push(`pp. ${pages}`);
      if(inner.length) s += ` (${inner.join(", ")})`;
      push(s + ".");
      push(P ? P + "." : "");
      break;
    }
    case "conference": {
      push(title + descPart + ".");
      push(C ? `In <em>${C}</em>${pages ? ` (pp. ${pages})` : ""}.` : "");
      push(P ? P + "." : "");
      break;
    }
    case "presentation": {
      push(title + descPart + ".");
      push([C, esc(e.location)].filter(Boolean).join(", ") + ".");
      break;
    }
    case "report": {
      let s = title;
      if(e.number) s += ` (Report No. ${esc(e.number)})`;
      push(s + descPart + ".");
      push(P ? P + "." : "");
      break;
    }
    case "standard": {
      let s = title;
      if(e.number) s += ` (Standard No. ${esc(e.number)})`;
      push(s + ".");
      push(P ? P + "." : "");
      break;
    }
    case "law": {
      let s = title;
      if(e.number) s += ` (${esc(e.number)})`;
      push(s + ".");
      push(P ? P + "." : "");
      break;
    }
    case "preprint": {
      push(title + descPart + ".");
      push((C || P) ? (C || P) + "." : "");
      break;
    }
    case "thesis": {
      const inner = [descriptor || "Thesis", P].filter(Boolean).join(", ");
      push(`${title} [${esc(inner)}].`);
      push(C ? C + "." : "");
      break;
    }
    case "dataset":
    case "software": {
      let s = title;
      if(e.edition) s += ` (Version ${esc(e.edition)})`;
      push(s + descPart + ".");
      push(P ? P + "." : "");
      break;
    }
    case "statistics": {
      push(title + descPart + ".");
      push(P ? P + "." : "");
      break;
    }
    case "podcast": {
      let s = title;
      if(e.number) s += ` (No. ${esc(e.number)})`;
      push(s + descPart + ".");
      push(C ? `In <em>${C}</em>.` : "");
      push(P ? P + "." : "");
      break;
    }
    case "video":
    case "social": {
      push(title + descPart + ".");
      push(C ? C + "." : "");
      break;
    }
    case "blog":
    case "news_web": {
      push(title + descPart + ".");
      push(C ? `<em>${C}</em>.` : "");
      break;
    }
    case "webpage": {
      push(title + descPart + ".");
      const site = (A && stripTags(e.container) === stripTags(joinAuthors(e.authors))) ? "" : C;
      push(site ? site + "." : "");
      break;
    }
    default: {
      let s = title;
      if(e.edition) s += ` (${esc(e.edition)} ed.)`;
      push(s + descPart + ".");
      if(C){
        let c = `<em>${C}${e.volume ? ", " + esc(e.volume) : ""}</em>`;
        if(e.issue) c += `(${esc(e.issue)})`;
        if(pages) c += `, ${pages}`;
        push(c + ".");
      }
      push(P ? P + "." : "");
    }
  }
  push(link);
  if(optJpNote) push("(in Japanese)");

  return parts.join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\.\.(?!\.)/g, ".")
    .trim();
}


export function inText(e, suffix){
  const year = withSuffix((e.year.trim().split(",")[0] || "n.d.").trim(), suffix || "");
  const names = e.authors.map(a => a.family).filter(Boolean);
  let key;
  if(!names.length){
    key = stripTags(e.container) || stripTags(e.title).split(/\s+/).slice(0, 4).join(" ") || "Anonymous";
    if(!stripTags(e.container)) key = `"${key}"`;
  }
  else if(names.length === 1) key = names[0];
  else if(names.length === 2) key = `${names[0]} & ${names[1]}`;
  else key = `${names[0]} et al.`;
  return {paren:`(${key}, ${year})`, narrative:`${key.replace(" & ", " and ")} (${year})`};
}

/* --- 同一著者・同一年の a / b --- */
/* APA 7: 著者と年が同じ文献が複数あるときは年に a, b, c を付け、
   参考文献リストと本文中の引用の両方で一致させなければならない */
export function withSuffix(year, suffix){
  if(!suffix) return year;
  return year.includes(",")
    ? year.replace(",", suffix + ",")   /* 2026, August 3 -> 2026a, August 3 */
    : year + suffix;
}

export function citeKey(e){
  const first = (e.authors[0] && e.authors[0].family) || stripTags(e.container) || stripTags(e.title);
  const year = (e.year || "").match(/\d{4}/);
  return (first || "").toLowerCase().trim() + "|" + (year ? year[0] : "n.d.");
}

/* 各件に付ける接尾辞を決める。返り値は entries と同じ長さの配列 */
export function suffixesFor(entries){
  const groups = new Map();
  entries.forEach((e, i) => {
    const k = citeKey(e);
    if(!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  });
  const out = entries.map(() => "");
  groups.forEach(idx => {
    if(idx.length < 2) return;
    /* 同じ組の中はタイトル順に a, b, c（APA はリスト内の並び順に従う） */
    idx.sort((x, y) => stripTags(entries[x].title).localeCompare(stripTags(entries[y].title), "en"));
    idx.forEach((i, n) => { out[i] = String.fromCharCode(97 + n); });
  });
  return out;
}

/* --- 入力の抜けを指摘する --- */
const REQUIRED = {
  journal:   [["container","掲載誌"], ["volume","巻"], ["pages","ページ"]],
  magazine:  [["container","雑誌名"]],
  newspaper: [["container","新聞名"]],
  book:      [["publisher","出版社"]],
  editedbook:[["publisher","出版社"]],
  chapter:   [["container","書名"], ["publisher","出版社"], ["pages","ページ"]],
  encyclopedia:[["container","事典名"]],
  conference:[["container","予稿集名"]],
  presentation:[["container","学会名"]],
  report:    [["publisher","発行機関"]],
  preprint:  [["container","リポジトリ名"]],
  thesis:    [["publisher","授与大学"]],
  dataset:   [["publisher","公開機関"]],
  statistics:[["publisher","作成機関"]],
  software:  [["publisher","公開元"]],
  video:     [["container","プラットフォーム"]],
  podcast:   [["container","番組名"]],
  social:    [["container","プラットフォーム"]],
  webpage:   [["container","サイト名"]],
  blog:      [["container","ブログ名"]],
  news_web:  [["container","サイト名"]],
  press:     [["publisher","発行機関"]],
  standard:  [["publisher","発行機関"]],
  map:       [["publisher","発行機関"]],
  law:       [],
  manuscript:[["publisher","所属機関"]],
  other:     []
};

export function checkEntry(e){
  const msgs = [];
  if(!stripTags(e.title)) msgs.push("タイトルが空です");
  if(!e.authors.length) msgs.push("著者が空です（団体名でも可。無い場合はサイト名が著者位置に入ります）");
  if(!e.year.trim()) msgs.push("発行年が空です（不明なら n.d. と出力されます）");
  (REQUIRED[e.type] || []).forEach(([f, ja]) => {
    if(!String(e[f] || "").trim()) msgs.push(ja + "が空です");
  });
  if(e.type === "journal" && !linkOf(e)) msgs.push("DOI が空です（あるなら APA では必須）");
  if(e.retrieved.trim() && e.year.trim()) msgs.push("発行日がある場合、閲覧日は通常不要です");
  return msgs;
}
