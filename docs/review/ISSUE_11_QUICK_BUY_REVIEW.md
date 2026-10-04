# Issue #11 レビュー画像

320×800、独立Save fixture、production preview。新規以外は自然進行の撮影ではなくUI検証用状態。

- [新規5秒RUN](issue-11/new-game.webp)
- [Quick Buy / Route購入前](issue-11/quick-buy.webp): AUTO行を含む常駐191px。Route Lv8→9で4.88ms→3.41ms。購入後の実値と一致することをE2Eで確認。
- [全Upgrade詳細シート](issue-11/upgrade-sheet.webp): 5強化・倍率/待ち係数・Cap・予約Gold。
- [Prestige / 継続MASTERY](issue-11/prestige-mastery.webp): 育成継続の案内、BREAK II以降12%短縮、現在/次Prestigeの倍率。通常OPEN時の先頭表示も維持。

レビュー修正後の4枚合計90,670 bytes。ゲームの17画像・配信容量には追加しない。360/390pxとPCも同じ固定カラムで検証。Reduced Motion、横スクロールなし、pageerrorなし。ゲーム進行の候補比較と4モデル/12〜20Cycleは[BURST_15_DESIGN](../BURST_15_DESIGN.md)を参照。
