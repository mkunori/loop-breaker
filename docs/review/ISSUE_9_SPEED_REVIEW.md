# Issue #9 レビュー画像

Playwrightの独立Saveで撮影したpresentation確認用の状態。自然進行の時間は[シミュレーション](../SPEED_REWORK.md)を参照。画像6点はWebP合計195,000 bytesで、ゲーム配信アセットには含まれない。

| 状態 | 320px画像 |
|---|---|
| 新規5秒RUN | [normal](issue-9/mobile-320-normal-5s.webp) |
| sub-second連撃 | [fast](issue-9/mobile-320-fast.webp) |
| msのTrail / Glow | [ultra](issue-9/mobile-320-ultra.webp) |
| μs / BURST集計 | [burst](issue-9/mobile-320-burst.webp) |

[390px](issue-9/mobile-390-normal-5s.webp) / [PC](issue-9/desktop-normal-5s.webp)。360pxもE2E対象。静止画像では斬撃の動きを評価できないため、実ブラウザで踏み込み→Slash→Hit Flash→Knockbackも確認してほしい。Reduced Motionでは移動と点滅を停止する。

検証: unit / integration 70件、E2E 56件、lint / typecheck / build / balance simulation成功。100万・1兆CLEARの5秒比較ではBURST場面の子DOMは9、React commitは50〜51、画像読み込み完了後の追加network requestは0。ZoneやBoss切替時の通常画像読み込みまで禁止するものではない。
