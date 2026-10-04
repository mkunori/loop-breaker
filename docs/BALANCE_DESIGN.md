# LOOP BREAKER — バランス設計 v3 / speed-3

Issue #9の現行仕様。LOOP BREAKERは「巨大数を増やしながらClear Timeの桁を削っていくゲーム」。新規5秒RUNから秒→ms→μs→BURSTへ進む。[候補比較・互換性](SPEED_REWORK.md)、[12Cycle結果](balance/issue-9-results.txt)、`python docs/balance/simulate.py --check`を参照。旧prototype-2はgit履歴とIMPLEMENTATION_NOTESの過去記録に残る。

## 数式と設定

```text
HP growth(s) = 1.002^(s−1) × 1.020^max(0,s−100)
通常4体 = 各30 × growth(s)、Boss = 120 × growth(s)、合計240
Damage = 60 × 1.16^ATK × (1 + .70 POWER)
DPS = Damage × 1.25^Speed × (1 + .20 Crit)
Crit率=.10×Lv（最大80%）、Crit倍率3（期待値のみ）
Overkill倍率 = 1 + .15 Overkill
Combat Time = 合計HP / (DPS × Overkill倍率)
Fixed Delay = 1 × .60^Route × .85^TEMPO
Clear Time = (Combat Time + Fixed Delay) × MASTERY
MASTERY = 1 / .55 / .36（初回・2回目Prestigeのみ）
Gold/CLEAR = 10 × (1 + .55 WEALTH) × (1 + .0005 min(s−1,100))
通常価格 = base × growth^Lv
SOUL = floor(4 × (最高CLEAR Stage / 100)^1.5) + (2回目のみ4)
恒久価格 = ceil(base × 1.7^Lv)、POWER/WEALTH base1、TEMPO base2
```

初期HP240 / Damage60 + Fixed Delay1 = **5秒**。Gold・HP曲線・Damage成長率・Crit・Overkill・SOUL・恒久効果・MASTERYは維持。変更はDamage base10→60、待ち6→1、ATK価格25/1.15→100/1.2、Route価格10/1.8→100/1.8、Route上限、Stage密度、解禁、BURST境界。

| 強化 | base | growth | CLEAR解禁 | 上限（p=完了Prestige数） |
|---|---:|---:|---:|---|
| ATK | 100 | 1.2 | 0 | 数値保護1e6 |
| Speed | 10 | 2.2 | 20 | min(8,1+floor((p+1)/2)) |
| Crit | 10 | 2.2 | 70 | min(8,1+floor(p/2)) |
| Overkill | 10 | 2.2 | 140 | min(8,1+floor(max(0,p−1)/2)) |
| Route | 100 | 1.8 | 250 | min(30,6+2p) |

AUTO解禁400 CLEAR、1秒毎ATK MAX・予約Goldあり。解禁済みフラグはPrestige・旧Save移行で維持する。

## Stage・Prestige・BURST

Stage開始境界 `40×(s−1)`、現在Stage `min(target,1+floor(routeClears/40))`。Stage100到達3960、攻略3961。Stage150到達5960、攻略5961。目標は最初3Cycleが100、以後150→200→250…、さらに進むは攻略後+25。目標での稼ぎを次Stage進行へ流用しない。待ち時間ゲートはない。

BURST enter `<.001秒`（1ms）、exit `>=.0011秒`。5秒集計・通常/BURST共通積分・端数繰越・部分窓は維持。100ms/10ms/1msを比較し、msの通常高速戦闘を残す1msを選択。μs表示はBURST中も残る。

## 参考進行

1秒毎の手動proxy購入、低Lv優先の恒久配分、SOUL実支払いと繰越を含む。

| 時点 | Clear Time / 結果 |
|---|---|
| 開始 | 5.00s |
| 5分 | 2.275s |
| 10分 | 977ms |
| 15分 | 427ms |
| 20分 | 221ms |
| 初回Prestige | 26分19秒、140ms、4 SOUL |
| Cycle2 | 5分20秒、開始1.762s→終了25.75ms、8 SOUL |
| Cycle3 | 1分58秒、開始860ms→終了8.75ms、4 SOUL |
| 初1秒未満 | Cycle1の592秒 / Stage7 |
| 初100ms未満 | Cycle2の173秒 / 累計1752.09秒 / Stage18 |
| 初10ms未満 | Cycle3の112秒 / 累計2011.48秒 / Stage85 |
| 初1ms未満・BURST | Cycle10の25秒 / 累計2809.19秒 / Stage103 |

解禁実時間はSpeed94.48秒 / Crit250.10秒 / Overkill403.09秒 / Route591.03秒 / AUTO711.56秒。後半はStage450/550のHPにより再びCycle時間が長くなり、Prestige連打へ収束しない。12Cycleの範囲を長期全体の完成とみなさない。

## 精度・互換性

本体はBigと数式一括計算を維持。Stage密度は周期1で、幾何/等差数列と二分探索を既存モデルで継続する。表示丸めを計算に戻さない。Python参照だけCLEARを列挙する。

Save Version1のままbalanceVersion speed-3。prototype-2経路を旧境界で検証して新密度の同Stage内へ写像する。実CLEAR・Gold・SOUL・Lv・phase・統計を増減しない。移行後の経路位置が実CLEARより大きい場合があるが整数範囲・highest整合は検証する。旧解禁と旧部分BURST集計も保持する。新バランスの速度は派生値として適用する。
