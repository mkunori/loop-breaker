# Issue #13 レビュー画像

320×800、production preview、独立Save fixture。自然なプレイ進行を撮影したものではなく、機能とレイアウトの検証用状態。

- [OFF / 既存の手動+25](issue-13/auto-advance-off.webp)
- [ON / Target150攻略後に175へ](issue-13/auto-advance-on.webp)
- [集約進行後 / Target68700](issue-13/auto-advance-targets.webp)

3枚合計81,186bytes。ゲーム17画像や配信アセットへは追加しない。AUTO ADVANCEは補助操作のDeepenボタン隣、Quick Buyの外側。320pxの補助ボタンが潰れないよう専用の一行へまとめる。Quick BuyはAUTO ATK込み191px。360/390px/PCもE2Eで確認。

仕様・計算式・Save・検証は[AUTO_ADVANCE](../AUTO_ADVANCE.md)を参照。ONはStageスキップではなく、攻略後のTarget+25だけを自動化する。
