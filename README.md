# APA 7th 参考文献ビルダー

書誌データベース検索・URL 取得・RIS/BibTeX 読み込みから、APA 7th edition の参考文献を組み立てるツール。

## 構成

```
index.html                  画面（ID とラベルだけ。ロジックは持たない）
css/core.css                基本のスタイル（iOS 基準）
css/desktop.css             マウス操作の広い画面（macOS 基準）
css/glass.css               Liquid Glass の層
js/types.js                 資料タイプ 27 種の定義、1 件分のデータ構造
js/util.js                  文字列・人名の処理（DOM に触れない）
js/format.js                APA の組み立て、a/b 併記、入力チェック
js/sources.js               外部データベースへの問い合わせ（唯一ネットワークに触れる）
js/importers.js             RIS / BibTeX の読み書き
js/store.js                 端末内への保存
js/app.js                   画面との接続。状態を持つのはここだけ
sw.js                       オフライン用のキャッシュ
manifest.webmanifest        ホーム画面に追加するための定義
```

## 動かすときの注意

- **`file://` では動かない。** ES モジュールは同一オリジンからの読み込みを要求するため、
  GitHub Pages などの http(s) で配信する必要がある。手元で試すなら
  `python3 -m http.server` でよい。
- **Service Worker は https のみ。** GitHub Pages はそのまま条件を満たす。
  ローカルの `localhost` も可。
- 公開場所のルートに `index.html` が来るように置く。

## 更新したとき

`sw.js` の `VERSION` を書き換える（`apa-v1` → `apa-v2`）。
これを忘れると、利用者の端末に古い画面が残り続ける。

## 外部との通信

検索のときだけ発生する。整形・編集・リスト・コピー・保存・読み込みはすべて端末内で完結する。
通信先は `index.html` の Content-Security-Policy に列挙したホストに限られ、
それ以外への接続はブラウザが遮断する。
