# LOOP BREAKER — バランス設計 v4 / speed-4

Issue #11の現行仕様。LOOP BREAKERは「巨大数を増やしながらClear Timeの桁を削っていくゲーム」。新規5秒RUNから秒→ms→μs→BURSTへ進む。[候補比較・互換性](BURST_15_DESIGN.md)、[Active結果](balance/issue-11-active.txt)、[Casual](balance/issue-11-casual.txt)、[AUTO Only](balance/issue-11-auto.txt)、`python docs/balance/simulate.py --check`を参照。旧prototype-2はgit履歴とIMPLEMENTATION_NOTESの過去記録に残る。

## 数式と設定

```text
HP growth(s) = 1.002^(s−1) × 1.020^max(0,s−100)
通常4体 = 各30 × growth(s)、Boss = 120 × growth(s)、合計240
Damage = 60 × 1.16^ATK × (1 + .70 POWER)
DPS = Damage × 1.25^Speed × (1 + .20 Crit)
Crit率=.10×Lv（最大80%）、Crit倍率3（期待値のみ）
Overkill倍率 = 1 + .15 Overkill
Combat Time = 合計HP / (DPS × Overkill倍率)
Fixed Delay = 1 × .85^TEMPO / (.94^(-ATK) + .60^(-Route) − 1)
Clear Time = (Combat Time + Fixed Delay) × MASTERY
MASTERY = 1 / .55 / .36（初回・2回目Prestigeのみ）
Gold/CLEAR = 10 × (1 + .55 WEALTH) × (1 + .0005 min(s−1,100))
通常価格 = base × growth^Lv
SOUL = floor(4 × (最高CLEAR Stage / 100)^1.5) + (2回目のみ4)
恒久価格 = ceil(base × 1.7^Lv)、POWER/WEALTH base1、TEMPO base2
```

初期HP240 / Damage60 + 待ち1秒 = **5秒**。HP/Gold/Crit/Overkill/SOUL/恒久効果/MASTERYは維持。speed-3からATK価格100/1.2→35/1.12、Route価格100→2000、待ち式へ弱いATK短縮を追加、Stage密度40→5、Route上限6+2p→6+3p、解禁CLEARを変更。

| 強化 | base | growth | CLEAR解禁 | 上限（p=完了Prestige数） |
|---|---:|---:|---:|---|
| ATK | 35 | 1.12 | 0 | 数値保護1e6 |
| Speed | 10 | 2.2 | 6 | min(8,1+floor((p+1)/2)) |
| Crit | 10 | 2.2 | 20 | min(8,1+floor(p/2)) |
| Overkill | 10 | 2.2 | 40 | min(8,1+floor(max(0,p−1)/2)) |
| Route | 2000 | 1.8 | 70 | min(30,6+3p) |

AUTO解禁120 CLEAR、1秒毎ATK MAX・予約Goldあり。解禁済みフラグはPrestige・旧Save移行で維持する。

## Stage・Prestige・BURST

Stage開始境界 `5×(s−1)`、現在Stage `min(target,1+floor(routeClears/5))`。Stage100到達495、攻略496。Stage150到達745、攻略746。目標は最初3Cycleが100、以後150→200→250…、さらに進むは攻略後+25。目標での稼ぎを次Stage進行へ流用しない。待ち時間ゲートはない。

BURST enter `<.001秒`（1ms）、exit `>=.0011秒`。5秒集計・通常/BURST共通積分・端数繰越・部分窓は維持。100ms/10ms/1msを比較し、msの通常高速戦闘を残す1msを選択。μs表示はBURST中も残る。

## 参考進行

初回2回は攻略後Prestige、3Cycle目は目標Stageで初BURSTまで育成を継続。以後の12Cycleは攻略時Prestige。これはプレイヤー参考方針で、待ちゲート/自動Prestigeではない。Activeは1秒毎非ATK優先MAX→ATK、Casualは非ATK60秒毎、AUTO Onlyは非ATKなし・解禁後は実AUTO。恒久は低Lv優先・SOUL実支払と繰越。

| Active時点 | Clear Time / 結果 |
|---|---|
| 開始 | 5.00s |
| 初購入 | 20秒 |
| 1分 | 2.89s |
| 1秒未満 | 158秒 |
| 初Prestige | 354.03秒、282ms、4 SOUL |
| Cycle2 | 102.03秒、開始1.762s→終了87.6ms、8 SOUL |
| Cycle3 | 初BURSTまで477秒、開始860ms→終了約800μs、4 SOUL |
| 100ms未満 | 累積450.03秒 |
| 10ms未満 | 累積576.06秒 |
| 初1ms未満・BURST | 累積933.06秒 / Cycle3 Stage100 |

AUTO解禁195.41秒。Casual初BURST1082.87秒、AUTO Only1389.89秒。12CycleではStage500/550へ進むにつれHPでCycle時間が再増加する。BURST後もStage農場やPrestige・恒久強化で成長する。全インフレ帯の完成保証ではない。

## 精度・互換性

本体はBigと数式一括計算を維持。Stage密度は周期1で、幾何/等差数列と二分探索を既存モデルで継続する。表示丸めを計算に戻さない。Python参照だけCLEARを列挙する。

Save Version1のままbalanceVersion speed-4。prototype-2（旧12/5）とspeed-3（旧40/1）経路を各旧境界で検証して新密度の同Stage内へ写像する。非ゼロStage内進捗は最低1、目標CLEAR済みはsentinelで保持する。実CLEAR・Gold・SOUL・Lv・phase・統計を増減しない。移行後の経路位置が実CLEARより大きい場合があるが整数範囲・highest整合は検証する。旧解禁と旧部分BURST集計も保持する。新バランスの速度は派生値として適用する。
