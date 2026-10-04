> Issue #9の過去検証記録。現行仕様は[BURST_15_DESIGN](BURST_15_DESIGN.md)とBALANCE_DESIGN v4。

# Issue #9: Clear Timeの桁を削る

実装前に既存数式と設計用参照モデルで比較した。LOOP BREAKERの中心は「巨大数を増やしながら、Clear Timeの桁を削っていくゲーム」。新規5秒 = HP240 / Damage60 + 固定待ち1秒。攻撃頻度・Crit期待値・Overkill再利用・Gold式・SOUL指数1.5・MASTERY・Stage100後HP曲線・5秒集計は維持する。

## 候補と採用理由

Stage密度40 CLEAR/Stage、通常価格ATK100×1.2^Lv、Route100×1.8^Lv、初回Route上限6・以後6+2p（最大30）を採用する。固定待ちを圧縮する育成判断を初Cycleに残す。新しい待ち時間ゲートや通貨は追加しない。

候補比較（初回Route上限6、後続上限を従来刻みで比較した段階）:

| ATK base/growth | Route base/growth | Stage密度 | Cycle1秒 | 終了Clear Time |
|---|---|---:|---:|---:|
| 100 / 1.18 | 100 / 3 | 40 | 1851 | 199ms |
| 100 / 1.15 | 300 / 2.5 | 40 | 2062 | 174ms |
| 100 / 1.2 | 100 / 2 | 40 | 1640 | 140ms |
| 50 / 1.18 | 200 / 2 | 50 | 1481 | 111ms |

採用は3番目を基礎にRoute価格growthを1.8へ戻し、Prestige毎のRoute上限を+2にする。最初の固定待ち下限が3.6秒の旧上限1ではmsになれないため、初期上限を6にした。Stage密度は2.4→40。239 CLEARでは高速化前にPrestigeへ着くため3961 CLEARへ増やす。Stage番号・SOUL・目標100→150→200・深部HPは維持。

UnlockはSpeed20 / Crit70 / Overkill140 / Route250 / AUTO400 CLEARへ変更。単純6倍ではなく実時間で約1:34 / 4:10 / 6:43 / 9:51 / 11:52へ分散する。フラグ方式は既存のまま。

同じ採用進行でBURST境界を比較すると、100msはCycle2・累計1752秒、10msはCycle3・2011秒、1msはCycle10・2809秒。100msでは二桁msを失い、10msではμsへ入る前に終わるため1msを採用（exit1.1ms）。100μsは12Cycleまで未到達で到達点が遠すぎる。μs表示はBURST中も継続し、秒→msを初Cycle、100ms→10msを後続Cycle、μs→集計を到達点にする。

## 再現

`python docs/balance/simulate.py --cycles 12` / `--check`。結果は[issue-9-results.txt](balance/issue-9-results.txt)。手動proxyは1秒毎に非ATK上限を優先してMAX購入、その後ATK。恒久は低Lv優先・同Lv POWER→WEALTH→TEMPO、残SOULを繰越。実装は既存Stage積分で同じ進行を検証する。シミュレーションはCLEARごとの小規模参照計算であり本体に移植しない。

## 互換性方針

Save Version1とフィールドは維持し、balanceVersionはspeed-3。旧prototype-2のrouteClearsを旧2.4密度で検証した後、新40密度の同じStage・Stage内進捗へ一度だけ写像する。Stage攻略済み境界を維持し、Gold・実CLEAR・SOUL・Lv・phase・AUTO・履歴統計は増減しない。移行後のrouteClearsは経路位置で、実CLEAR総数を超える場合があるため旧大小制約のみ撤去し、範囲・整数・highestとの整合検証を維持する。解禁済みフラグは撤回しない。旧BURST集計は保持して、新しい境界から通常へ復帰する。

## Presentation

Clear Time専用formatterを独立させ、Bigを保ったまま3有効桁でs / ms / μs / ns / psへ単位を切替、さらに小さければ科学表記秒。単位閾値は丸め前の内部値で判定する。

LODはClear Time≥1秒: normal、100ms以上: fast、それ未満: ultra、既存active flag: burst。固定CSS要素で踏み込み・大きい斬撃・Hit Flash・Knockback、fastは最大4Hz、ultraは連続trail/glow/line、burstはリングと集計。実攻撃イベントに同期させず、React更新は既存10Hz上限、DOM/通信をCLEAR数に比例させない。画像URLはStage帯と既存Boss分類だけ。Reduced Motionは全移動・点滅を停止する。


## 検証結果

unit / integration 70件、E2E 56件、lint / typecheck / production build / simulation --check成功。実装側でも12Cycleを参照モデルと照合。BURST境界比較はsimulate.py --cycles 12 --burst-enter 0.1 / 0.01 / 0.001で再現できる。

320 / 360 / 390pxとPC、Reduced Motion、横スクロールなし、pageerrorなしを確認。100万・1兆CLEARの比較で固定9 DOM・50〜51 React commit/5秒・ウォームアップ後の追加通信0。[レビュー画像](review/ISSUE_9_SPEED_REVIEW.md)を参照。

残る確認は実機iOS Safari、購入方針による到達時刻差、深部Stage500〜550の長期テンポ。Cycle11/12は深部HPにより12:31 / 23:20へ伸びるが、今回SOUL指数や深部式は独自変更しない。

CIのLinuxフォントではms数値と / RUNが折り返し、Stage帯切替時にArenaが伸びる問題を確認。Clear Time列を広げ、数値と単位を一行、/ RUNを固定の次行として高さを安定化した。ゲーム計算は変更しない。
