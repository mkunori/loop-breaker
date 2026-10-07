# LOOP BREAKER — バランス設計 v6 / speed-6

Issue #17でRequired Stage800 capとDeep MASTERYを分離。HP曲線はspeed-5のまま。[P15〜P50・3案×3戦略比較](PRESTIGE_CAP_DESIGN.md)。
Issue #15で深部HPのみ再調整。[候補比較・P30・実プレイ回帰](DEEP_HP_DESIGN.md)。他の設定はIssue #11仕様を維持。LOOP BREAKERは「巨大数を増やしながらClear Timeの桁を削っていくゲーム」。新規5秒RUNから秒→ms→μs→BURSTへ進む。[候補比較・互換性](BURST_15_DESIGN.md)、[Active結果](balance/issue-11-active.txt)、[Casual](balance/issue-11-casual.txt)、[AUTO Only](balance/issue-11-auto.txt)、`python docs/balance/simulate.py --check`を参照。旧prototype-2はgit履歴とIMPLEMENTATION_NOTESの過去記録に残る。

## 数式と設定

```text
HP growth(s) = 1.002^(s−1)
             × 1.020^min(max(s−100,0),600)
             × 1.005^min(max(s−700,0),300)
             × 1.001^max(s−1000,0)
通常4体 = 各30 × growth(s)、Boss = 120 × growth(s)、合計240
Damage = 60 × 1.16^ATK × (1 + .70 POWER)
DPS = Damage × 1.25^Speed × (1 + .20 Crit)
Crit率=.10×Lv（最大80%）、Crit倍率3（期待値のみ）
Overkill倍率 = 1 + .15 Overkill
Combat Time = 合計HP / (DPS × Overkill倍率)
Fixed Delay = 1 × .85^TEMPO / (.94^(-ATK) + .60^(-Route) − 1)
Clear Time = (Combat Time + Fixed Delay) × MASTERY
MASTERY(p<16) = [1, .55, .36][min(2,p)] × .88^max(0,p−2)
MASTERY(p>=16) = .36 × .88^(14 + deepMasteryLevel)
Required Stage = min(100 + 50 max(0,p−2),800)
Deep earned = floor(max(0, highestClearedStage−800)/50)
Prestige確定時: deepMasteryLevel = max(existing, earned)
Gold/CLEAR = 10 × (1 + .55 WEALTH) × (1 + .0005 min(s−1,100))
通常価格 = base × growth^Lv
SOUL = floor(4 × (最高CLEAR Stage / 100)^1.5) + (2回目のみ4)
恒久価格 = ceil(base × 1.7^Lv)、POWER/WEALTH base1、TEMPO base2
```

初期HP240 / Damage60 + 待ち1秒 = **5秒**。HP/Gold/Crit/Overkill/SOUL/恒久効果は維持。speed-3からATK価格100/1.2→35/1.12、Route価格100→2000、待ち式へ弱いATK短縮を追加、Stage密度40→5、Route上限6+2p→6+3p、解禁CLEARを変更。BREAK II以降の継続12%短縮はP16到達まで維持。以後はDeep MASTERYだけで追加し、Stage800の単純Prestige連打で継続倍率を増やさない。

| 強化 | base | growth | CLEAR解禁 | 上限（p=完了Prestige数） |
|---|---:|---:|---:|---|
| ATK | 35 | 1.12 | 0 | 数値保護1e6 |
| Speed | 10 | 2.2 | 6 | min(8,1+floor((p+1)/2)) |
| Crit | 10 | 2.2 | 20 | min(8,1+floor(p/2)) |
| Overkill | 10 | 2.2 | 40 | min(8,1+floor(max(0,p−1)/2)) |
| Route | 2000 | 1.8 | 70 | min(30,6+3p) |

AUTO解禁120 CLEAR、1秒毎ATK MAX・予約Goldあり。解禁済みフラグはPrestige・現行Saveの再ロードで維持する。

## Stage・Prestige・BURST

Stage開始境界 `5×(s−1)`、現在Stage `min(target,1+floor(routeClears/5))`。Stage100到達495、攻略496。Stage150到達745、攻略746。目標は最初3Cycleが100、以後150→200→250…→800 cap、さらに進むは攻略後+25。目標での稼ぎを次Stage進行へ流用しない。待ち時間ゲートはない。

BURST enter `<.001秒`（1ms）、exit `>=.0011秒`。5秒集計・通常/BURST共通積分・端数繰越・部分窓は維持。100ms/10ms/1msを比較し、msの通常高速戦闘を残す1msを選択。μs表示はBURST中も残る。

## 参考進行

Active Farm / Casual / AUTO Onlyは初回2回を攻略後Prestige、3Cycle目は目標Stageで初BURSTまで育成、以後は攻略時Prestige。Immediate Prestigeは全Cycleで攻略後即Prestigeし、購入はActiveと同じ。これはプレイヤー参考方針で、待ちゲート/自動Prestigeではない。Activeは1秒毎非ATK優先MAX→ATK、Casualは非ATK60秒毎、AUTO Onlyは非ATKなし・解禁後は実AUTO。恒久は低Lv優先・SOUL実支払と繰越。

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

AUTO解禁195.41秒。Active初BURST933.06秒、Casual1082.87秒、AUTO Only1389.89秒はspeed-5と一致。Immediate Prestigeは1277.04秒（21:17、speed-5比+1秒）。初Prestige354.03秒。P0〜P16のRequired攻略Cycle時間はspeed-5と一致。P17実プレイfixtureのStage807→850は新MASTERY固定後77秒（speed-5時68秒）、目標2分以内を維持。HPそのものはspeed-5と完全同一。[回帰出力](balance/issue-17-regression.txt)。P20〜P50 Escapeは98.58〜190.97秒/Cycle。[戦略比較・SOUL/min](PRESTIGE_CAP_DESIGN.md)。

## 精度・互換性

Issue #13はQoLのみ。AUTO ADVANCE OFFなら以下のバランスと参照時間は変更なし。ONは攻略後の+25を自動実行するため深部HPへ早く進むが、計算式・価格・上限・解禁・Prestige条件・SOUL・MASTERY・BURST閾値は無変更。[AUTO_ADVANCE](AUTO_ADVANCE.md)を参照。

本体はBigと数式一括計算を維持。Stage密度は周期1で、幾何/等差数列と二分探索を既存モデルで継続する。表示丸めを計算に戻さない。Python参照だけCLEARを列挙する。

Save Version1 / balanceVersion speed-6。正式リリースまではBalance間のSave互換性を保証しない。異なるbalanceVersionは明示的に拒否し、経路変換も暗黙の読替えも行わない。旧Saveの原文を残しExport可能にして、新規開始はユーザーの確認後のみ。現行版同士のSave / reload / Export / Importとcurrent / backupは維持。経路進行は実CLEAR以下を検証する。
