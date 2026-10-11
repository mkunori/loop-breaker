# LOOP BREAKER — バランス設計 speed-7

Issue #19: Gold購入をATK/Routeだけにし、Speed/Critical/Overkillを無料Prestigeパッシブ化する。HP・Gold・SOUL・Stage・MASTERY・BURSTの係数はspeed-6と同じ。[5案/3戦略/4AUTO方針の比較](PRESTIGE_PASSIVES_DESIGN.md)、[全チェックポイントCSV](balance/issue19-comparison.csv)。

## 数式と設定

```text
HP growth(s) = 1.002^(s−1)
             × 1.020^min(max(s−100,0),600)
             × 1.005^min(max(s−700,0),300)
             × 1.001^max(s−1000,0)
通常4体 = 各30 × growth(s)、Boss = 120 × growth(s)、合計240
Damage = 60 × 1.16^ATK × (1 + .70 POWER)
DPS = Damage × 1.25^Speed × (1 + .20 Crit)
Crit期待値係数=.10×Lv、倍率3を使う従来線形式を維持（Lv12で期待Damage3.4倍）
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

## パッシブ

P0では6/20/40 CLEARでSpeed/Crit/Overkill各Lv1を自動適用、解禁前0。P1以降は下記。p=完了Prestige、d=確定済みDeep。購入費0、確定DeepはPrestige時のみ更新する。

```text
Speed = min(8,1+floor((p+1)/2))
CritRegular = min(10,1+floor(p/2))
OverkillRegular = min(10,1+floor(max(0,p−1)/2))
DeepFloor = p>=16 ? min(12,8+d) : 0
Crit = max(CritRegular,DeepFloor)
Overkill = max(OverkillRegular,DeepFloor)
```

## 購入・AUTO

| 強化 | base | growth | 解禁CLEAR | 上限 |
|---|---:|---:|---:|---|
|ATK|35|1.12|0|数値保護1e6|
|Route|2000|1.8|70|min(30,6+3p)|

AUTO ATKは120 CLEAR、AUTO ROUTEは生涯Stage900 CLEARで解禁。両方1秒時計、共通予約Goldを残す。単独ONならそのUpgradeをMAX。両ONは次1LvのClear Time短縮量÷価格の大きい候補を先にMAXし残額で他方、同率ATK。優先候補の資金不足時は購入せず貯める。Route cap時はATKのみ。比較は2候補だけ、Lv/CLEARごとの本体loopなし。[比較理由・資金待ち](PRESTIGE_PASSIVES_DESIGN.md)。

## Stage・Prestige・BURST

Stage境界5×(s−1)、100到達495/攻略496。Required最初3Cycle100、以後+50で800 cap。攻略後のFarmを経路進行へ流用しない。+25深化/AUTO ADVANCEは同じ。Stage800攻略後は任意深部でもPrestige可能。Deep850/900/950/1000で1/2/3/4を確定時max取得、同じmilestone再取得なし。

BURST enter<.001秒、exit>=.0011秒、5秒集計・共通積分・端数/部分窓を維持。

## 参考進行

Activeは毎秒Route MAX→ATK MAX、CasualはRouteのみ60秒毎、AUTO OnlyはRouteなし。初回2回は攻略直後Prestige、3Cycle目はStage100で初BURSTまでFarm。入力待ち時間なし。恒久は低Lv優先、実SOUL支払と繰越。AUTO ROUTEは900前なのでこの初回Farmへ介入しない。

| 指標 | speed-6 | speed-7 |
|---|---:|---:|
|初期RUN|5.00s|5.00s|
|初Prestige|354.03秒|347.88秒|
|Active初BURST|933.06秒|920.08秒|
|Casual初BURST|1082.87秒|985.08秒|
|AUTO Only初BURST|1389.89秒|1256.08秒|
|Escape P20|190.97秒|127.41秒|
|Escape P30|122.72秒|84.55秒|
|Escape P50|98.58秒|68.40秒|

新Active 1秒/100ms/10ms/1ms到達は151/438.88/562.08/920.08秒。第2Cycle97.20秒、第3Cycle475秒。本体1秒判断の端数込みでは348/98/475秒、初BURST921秒。P17実プレイfixtureは無料Crit/Overkill9により807→850が77→67秒。HPは同じ。

## 再現・互換性

既存simulate.py / deep_hp.py / prestige_cap.pyは過去speed-6等の比較基準を凍結し、--checkを維持。現行はpassives.py --check、CSV出力と本体照合テストを使用する。参照PythonのみCLEAR列挙、本体は集約式。

saveVersion1 / balanceVersion speed-7。旧speed-6を含む異なるBalanceは明示拒否し、migration/暗黙の読替え/自動wipeなし。原文Exportとユーザー確認付き新規開始を維持。現行同士のcurrent/backup・Save/reload・Export/Importを保証する。
