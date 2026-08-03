/* 資料タイプの定義と、1件分のデータ構造 */

/* ============ 資料タイプ定義 ============ */
/* standalone: タイトル自体を斜体にする（単独刊行物）か否か */
const TYPES = {
  journal:   {ja:"雑誌論文", standalone:false, show:["container","volume","issue","pages","number"], labels:{container:"掲載誌", number:"論文番号"}},
  magazine:  {ja:"一般雑誌記事", standalone:false, show:["container","volume","issue","pages"], labels:{container:"雑誌名"}},
  newspaper: {ja:"新聞記事", standalone:false, show:["container","pages"], labels:{container:"新聞名"}},
  book:      {ja:"書籍", standalone:true, show:["edition","publisher"], labels:{}},
  editedbook:{ja:"編著書（全体）", standalone:true, show:["editors","edition","publisher"], labels:{}},
  chapter:   {ja:"書籍の1章", standalone:false, show:["editors","container","edition","pages","publisher"], labels:{container:"書名"}},
  encyclopedia:{ja:"事典項目", standalone:false, show:["editors","container","edition","pages","publisher"], labels:{container:"事典名"}},
  conference:{ja:"学会発表論文（予稿集）", standalone:false, show:["container","pages","publisher"], labels:{container:"予稿集名"}},
  presentation:{ja:"学会発表（口頭・ポスター）", standalone:true, show:["container","location"], labels:{container:"学会名"}, desc:"Conference presentation"},
  report:    {ja:"報告書 / 白書", standalone:true, show:["number","publisher"], labels:{number:"報告書番号"}},
  preprint:  {ja:"プレプリント", standalone:true, show:["container"], labels:{container:"リポジトリ名"}, desc:"Preprint"},
  thesis:    {ja:"学位論文", standalone:true, show:["publisher","container"], labels:{publisher:"授与大学", container:"データベース名"}, desc:"Doctoral dissertation"},
  webpage:   {ja:"Webページ", standalone:true, show:["container","retrieved"], labels:{container:"サイト名"}},
  blog:      {ja:"ブログ記事", standalone:false, show:["container"], labels:{container:"ブログ名"}},
  news_web:  {ja:"Web記事（ニュースサイト）", standalone:false, show:["container"], labels:{container:"サイト名"}},
  dataset:   {ja:"データセット", standalone:true, show:["edition","publisher"], labels:{}, desc:"Data set"},
  statistics:{ja:"統計表", standalone:true, show:["publisher","retrieved"], labels:{publisher:"作成機関"}, desc:"Data set"},
  software:  {ja:"ソフトウェア", standalone:true, show:["edition","publisher"], labels:{}, desc:"Computer software"},
  video:     {ja:"動画（YouTube等）", standalone:true, show:["container"], labels:{container:"プラットフォーム"}, desc:"Video"},
  podcast:   {ja:"ポッドキャスト", standalone:false, show:["container","number","publisher"], labels:{container:"番組名", number:"エピソード番号"}, desc:"Audio podcast episode"},
  social:    {ja:"SNS投稿", standalone:true, show:["container"], labels:{container:"プラットフォーム"}, desc:"Post"},
  press:     {ja:"プレスリリース", standalone:true, show:["publisher"], labels:{}, desc:"Press release"},
  standard:  {ja:"規格", standalone:true, show:["number","publisher"], labels:{number:"規格番号"}, descNum:"Standard No."},
  map:       {ja:"地図", standalone:true, show:["publisher"], labels:{}, desc:"Map"},
  law:       {ja:"法令・条例", standalone:true, show:["number","publisher"], labels:{number:"法令番号"}},
  manuscript:{ja:"未公刊資料", standalone:true, show:["publisher"], labels:{publisher:"所属機関"}, desc:"Unpublished manuscript"},
  other:     {ja:"その他", standalone:true, show:["container","volume","issue","pages","number","edition","publisher","editors","location"], labels:{}}
};
const ALL_FIELDS = ["container","volume","issue","pages","number","edition","publisher","editors","location","retrieved"];
const BASE_LABELS = {container:"掲載誌 / 書名 / サイト名", volume:"巻", issue:"号", pages:"ページ",
  number:"番号", edition:"版 / バージョン", publisher:"出版社 / 発行機関", editors:"編者（1人1行）",
  location:"開催地", retrieved:"閲覧日（内容が変わるページのみ。例: August 3, 2026）"};

/* 空の1件。すべての項目をここに集約する */
export function blank(){
  return {type:"journal", year:"", authors:[], title:"", translated:"", container:"", volume:"",
    issue:"", pages:"", number:"", edition:"", publisher:"", editors:[], location:"",
    descriptor:"", retrieved:"", doi:"", original:"", source:""};
}

export { TYPES, ALL_FIELDS, BASE_LABELS };
