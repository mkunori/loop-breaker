# LOOP BREAKER — バランス設計 v2（PR #2レビュー反映）

実装可能な初期モデル。時間は表示中の累積プレイ時間。[balance/simulate.py](balance/simulate.py) はPython標準ライブラリのみの設計用参照計算で、ゲーム本体ではない。最低Prestige時間を撤回し、段階的な通常上限とStage報酬を入れて、SOULの実支払い込みで12Cycleまで検証した。balanceVersion案は `prototype-2`。

## 1. 基本式

変数: Stage `s`、通常Lv `a,v,c,o,r`、恒久Lv `P,W,T`、完了済みPrestige回数 `p`。

```text
HP growth(s) = 1.002^(s−1) × 1.020^max(0,s−100)
Enemy HP: 通常4体 = 各30 × HP growth(s)
          Boss1体 = 120 × HP growth(s)
H(s) = 合計240 × HP growth(s)
Damage = 10 × 1.16^a × (1 + 0.70P)
Attacks/sec = 1.25^v
Crit chance = 0.10c        # Lv8で80%
Crit multiplier = 3
Crit expected factor = 1 + 0.20c
DPS = Damage × Attacks/sec × Crit expected factor
Overkill recycling factor = 1 + 0.15o
Recycled share = 0.15o / (1 + 0.15o)
Combat Time = H(s) / (DPS × Overkill recycling factor)
Fixed Delay = 6 × 0.60^r × 0.85^T
LOOP MASTERY(p) = [1, 0.55, 0.36][min(p,2)]
Clear Time = LOOP MASTERY × (Combat Time + Fixed Delay)
Stage Gold multiplier = 1 + 0.0005 × min(s−1,100)
Gold/CLEAR = 10 × (1 + 0.55W) × Stage Gold multiplier
```

Combat Timeは丸めず、1攻撃・1フレームの下限を設けない。HP・Goldも先行丸めなし。初期HP240 / Damage10 / 1攻撃毎秒 + 待ち6秒 = 30秒。

Stage100までHP成長は従来の1.002倍/Stage。101から実効 `1.002×1.020=1.02204` 倍/Stageになり、必要Stage150/200…の攻略に意味を持たせる。Stage100を超えるほどSOULを増やすが、敵強度も上げる。初回3CycleのHPと目標Stageは変えない。

Stage Gold倍率はStage1で1、50で1.0245、100で1.0495、101以降で1.05。上昇幅は最大5%で、その先はGoldインフレを追加しない。各周の実際のStageでGoldを付与し、Stage跨ぎを開始Stageの倍率で一括処理したり、過去周へ遡及付与したりしない。初回参考ルートの総Goldは平坦倍率より約2.5%増え、所要時間は約3.6秒短縮する程度。

Overkillは個別攻撃の余剰転送ではなく、倒した敵の余剰エネルギーを平均化した決定論的リサイクル。敵列全体の有効HPを `H/(1+.15o)` と定義する。Lv1は13.043%再利用、戦闘時間を86.957%にする。固定Delayには影響しない。個別敵の残HPや余剰キューは保持せず、UIは「戦闘時間÷1.15」と説明する。Critも期待値であり、報酬計算に乱数を導入しない。

## 2. 通常強化と段階的上限

現在Lv=lから次Lvの価格は `base × growth^l`。内部Gold価格にceilを掛けない（SOULだけceil）。画面は小数2桁まで切り上げ表示、判定は内部価格。

| ID / 名称 | Base Gold | Growth | 効果 | 最終上限 | 初回解禁CLEAR |
|---|---:|---:|---|---:|---:|
| atk / ATK | 25 | 1.15 | Damage×1.16/Lv | なし | 0 |
| speed / Attack Speed | 10 | 2.2 | 頻度×1.25/Lv | 8 | 6 |
| crit / Critical | 10 | 2.2 | Crit率+10pp/Lv、Crit3倍 | 8 | 20 |
| overkill / Overkill | 10 | 2.2 | 再利用倍率+0.15/Lv | 8 | 35 |
| delay / Route Compression | 10 | 1.8 | 固定Delay×0.60/Lv | 30 | 65 |

AUTO ATKは120CLEAR、購入Gold不要。一度の解禁は生涯保持。ATK Lv0〜3価格は25 / 28.75 / 33.0625 / 38.021875。Lv16→17は233.9405、Lv18→19は309.3863。MAX合計価格は `base × growth^l × (growth^n−1)/(growth−1)`、対数でnを求め合計価格と照合する。

通常強化上限は完了済みPrestige pから導出する（SOUL消費なし）:

```text
Speed cap = min(8, 1 + floor((p+1)/2))
Crit cap = min(8, 1 + floor(p/2))
Overkill cap = min(8, 1 + floor(max(0,p−1)/2))
Compression cap = min(30, 1 + floor(max(0,p−1)/2))
```

| Cycle / 完了済みp | Speed | Crit | Overkill | Compression | 新しい判断 |
|---|---:|---:|---:|---:|---|
| 1 / 0 | 1 | 1 | 1 | 1 | 初回の解禁能力かATKか |
| 2 / 1 | 2 | 1 | 1 | 1 | Speed Lv2（22 Gold）かATKか |
| 3 / 2 | 2 | 2 | 1 | 1 | Crit Lv2（22 Gold）かATKか |
| 4 / 3 | 3 | 2 | 2 | 2 | Speed/Overkillと待ち圧縮の配分 |
| 5 / 4 | 3 | 3 | 2 | 2 | Crit Lv3 |
| 6 / 5 | 4 | 3 | 3 | 3 | 速度・再利用・固定待ちの配分 |
| 7 / 6 | 4 | 4 | 3 | 3 | Crit Lv4 |
| 8 / 7 | 5 | 4 | 4 | 4 | 同上の複数配分 |
| 9 / 8 | 5 | 5 | 4 | 4 | Crit Lv5 |
| 10 / 9 | 6 | 5 | 5 | 5 | 同上の複数配分 |

Speed Lv2はLv1からDPS+25%。Crit Lv2は期待値1.2→1.4（+16.67%）。ATKを先送りする費用を伴い、無料能力付与ではない。初回に全系統の深い育成を求めず、以後の新上限をPrestige画面で予告する。

## 3. Prestige / SOUL / LOOP MASTERY

```text
Required Stage(p) = 100 + 50 × max(0,p−2)
Stage entry boundary b(s) = ceil(12(s−1)/5)
Required route clears = b(Required Stage)+1
Prestige available = highestClearedStageThisCycle >= Required Stage
Base SOUL = floor(4 × (highestClearedStageThisCycle / 100)^1.5)
SOUL reward = Base SOUL + (p == 1 ? 4 : 0)
POWER multiplier = 1 + .70P
WEALTH multiplier = 1 + .55W
TEMPO delay multiplier = .85^T
POWER / WEALTH next cost = ceil(1.7^CurrentLv)
TEMPO next cost = ceil(2 × 1.7^CurrentLv)
```

最低時間・クールダウンなし。Stage100への入場は238経路CLEAR、初CLEARは239。必要Stageは100→100→100→150→200…と増やし、1000で固定しない。目標到達後の稼ぎCLEARは総Cycle CLEARには足すが、経路進行routeClearsには貯めない。目標の深化は未攻略の敵から進める。SOULは実際にCLEARした最高Stageで発行し、差分式ではない。Reset/回数増加/付与を原子的に行い、同じCycleの二重付与を防ぐ。

| 現在Lv | POWER / WEALTH価格 | TEMPO価格 |
|---:|---:|---:|
| 0 | 1 | 2 |
| 1 | 2 | 4 |
| 2 | 3 | 6 |
| 3 | 5 | 10 |

初回4で各Lv1、2回目8で各Lv2。3回目は4なので全系統Lv3にはならない。追加検証では未使用SOULを繰り越し、全購入を実際の価格で支払う。

LOOP MASTERYは明示的なPrestigeマイルストーン。初回でBREAK I（全RUN時間×0.55）、2回目でBREAK II（全RUN時間×0.36）を自動取得。0.55×0.36ではなく累積倍率を置換。UIに45%/64%短縮と、2回目は直前からさらに約34.5%短縮を表示する。3回目以降は倍率を更新しない。購入可能な第4系統や隠れた補正にはしない。

## 4. 参考購入ポリシーと計算方法

通常強化は1秒ごとにSpeed→Crit→Overkill→Compressionの順で解禁・上限内を先に購入し、残額でATKをMAX購入する（caps-first）。これは参考プレイヤー操作で、非ATKのAUTOを本体に実装する意味ではない。AUTO ATKとの併用時は予約GoldやOFFで必要資金を確保する。シミュレーションはその手動制御を購入順で表現する。

SOULは最低Lvの系統から均等化し、同LvならPOWER→WEALTH→TEMPO。次の選択が買えなければSOULを温存し、安い高Lv系統へ飛ばさない。初回4と2回目8を使った後の配分もこの規則で決める。各表のP/W/TはCycle開始時、報酬はそのCycle終了時（Prestige #n時）。

参照計算を固定dtからイベント計算へ変更した。CLEAR、購入、5分チェックポイントの最早時刻まで進め、同時刻はCLEAR→購入の順。購入でphase比率を保持する。製品とは独立した少数周の検算なので**各CLEARを訪問する**。製品BURSTへこのwhileを転用せず、技術設計の一括式と比較する参照モデルとして使う。先頭3CycleだけでなくSOUL残高・恒久Lvを持ち越す。

## 5. 初回30分の新結果

| 経過 | Stage | CLEAR | ATK Lv | Gold残 | 理論Clear Time |
|---|---:|---:|---:|---:|---:|
| 0分 | 1 | 0 | 0 | 0 | 30.000秒 |
| 5分 | 6 | 12 | 3 | 23.298 | 18.424秒 |
| 10分 | 14 | 33 | 7 | 34.355 | 11.810秒 |
| 15分 | 27 | 63 | 10 | 96.332 | 9.322秒 |
| 20分 | 48 | 113 | 14 | 90.307 | 5.513秒 |
| 25分 | 71 | 170 | 17 | 62.663 | 4.883秒 |
| 30分 | 98 | 233 | 19 | 140.480 | 4.607秒 |
| 30分23.23秒 | 100をCLEAR | 239 | 19 | — | 4.611秒 |

解禁はSpeed 2分50.23秒、Crit 7分5.27秒、Overkill 10分15.71秒、Compression 15分11.93秒、AUTO 20分38.30秒。Damage式は従来どおり。25分時点Damage124.677、30分時点167.765。

## 6. 追加検証: Prestige #1〜#12

必要Stageの初CLEAR直後にPrestigeし、任意の追加深化/稼ぎは行わない。終了Timeはその時点の能力で当該Stageを周回した理論時間。Cycle間のUI操作時間は含まない。

| Prestige # | 必要Stage | Cycle秒 | 獲得SOUL | 開始P/W/T | SOUL持越 | 開始秒/周 | 終了秒/周 | Cycle内初BURST |
|---:|---:|---:|---:|---|---:|---:|---:|---|
| 1 | 100 | 1823.23 | 4 | 0/0/0 | 0 | 30.0000 | 4.6107 | なし |
| 2 | 100 | 555.77 | 8 | 1/1/1 | 0 | 10.5697 | 1.8506 | なし |
| 3 | 100 | 276.27 | 4 | 2/2/2 | 0 | 5.1606 | 0.9859 | 204秒 / Stage70 |
| 4 | 150 | 244.62 | 7 | 3/2/2 | 1 | 4.3477 | 0.6135 | 31秒 / Stage8 |
| 5 | 200 | 310.72 | 11 | 3/3/2 | 5 | 4.3477 | 0.6361 | 27秒 / Stage6 |
| 6 | 250 | 207.21 | 15 | 4/4/3 | 0 | 3.6002 | 0.3693 | 14秒 / Stage3 |
| 7 | 300 | 223.53 | 20 | 4/4/4 | 5 | 3.4012 | 0.4323 | 13秒 / Stage3 |
| 8 | 350 | 176.11 | 26 | 5/5/4 | 7 | 3.0475 | 0.4016 | 10秒 / Stage2 |
| 9 | 400 | 201.81 | 32 | 6/5/5 | 1 | 2.6199 | 0.6343 | 8秒 / Stage2 |
| 10 | 450 | 204.41 | 38 | 6/6/5 | 18 | 2.6199 | 0.8993 | 6秒 / Stage2 |
| 11 | 500 | 321.02 | 44 | 7/6/6 | 2 | 2.2790 | 1.7578 | 6秒 / Stage2 |
| 12 | 550 | 465.84 | 51 | 7/7/6 | 21 | 2.2790 | 3.2394 | 10秒 / Stage3 |

初回約30分23秒→2Cycle約9分16秒→3Cycle約4分36秒。初BURSTは3Cycle開始3分24秒、通算42分59秒。1秒未満への到達は育成判断をした結果であり、Prestige報酬だけで自動的にBURST開始するわけではない。

4〜10Cycleは約2分56秒〜5分11秒。深層HPを従来の1.002だけで伸ばすと同条件の10Cycleが約1分38秒まで縮むため、101以降の追加倍率1.020を採用した。11〜12Cycleは5分21秒/7分46秒へ再び伸びる。最短時間の強制ではなく、敵曲線と解放タイミングで自然に変動する。

深いStageで一度BURSTから通常表示へ戻ることもある。特に11〜12Cycleは序盤でBURSTに入り、深層のHPで終盤1秒超となる。表示は既定の1/1.1秒ヒステリシスで切替。これは先のStageを攻略する負荷であり、到達済みStageの圧縮は維持される。これが逆成長に感じられないかは実機レビュー事項。

## 7. SOUL指数の比較と判断

他の全条件を固定し、指数1.0/1.25/1.5を比較した。

| 指数 | #4〜#10獲得SOUL | #6秒 | #8秒 | #10秒 | #12秒 |
|---:|---|---:|---:|---:|---:|
| 1.0 | 6 / 8 / 10 / 12 / 14 / 16 / 18 | 213.38 | 194.13 | 246.62 | 593.74 |
| 1.25 | 6 / 9 / 12 / 15 / 19 / 22 / 26 | 213.38 | 184.03 | 225.50 | 584.74 |
| **1.5（採用）** | **7 / 11 / 15 / 20 / 26 / 32 / 38** | **207.21** | **176.11** | **204.41** | **465.84** |

指数1.5でも10Cycle開始時Lvは6/6/5に留まり、SOUL価格の指数成長で報酬増加がそのまま恒久Lvの爆発にならない。#8付近で時間は短くなるが、その後の深層HPで#9〜#12は増加に転じる。少なくとも初BURST〜12CycleではPrestige連打や過剰な停滞は確認されず、深度の報酬を削る理由がないため**1.5を維持**する。長期全体の安定性を証明したわけではない。

Stage550以降は敵の指数成長が強まり、最終通常上限も近づく。新たな倍率の配布やHP曲線の次区間は将来設計として追加検証が必要。現在の式を無限の完成バランスとして固定しない。最低時間制限で未検証範囲を覆い隠さない。

## 8. 操作・配分の感度

| 通常購入ポリシー / 間隔 | 初回秒 | 2Cycle秒 | 3Cycle秒 | 4Cycle秒 | 10Cycle秒 | 初BURST |
|---|---:|---:|---:|---:|---:|---|
| 上限優先 / 1秒 | 1823.23 | 555.77 | 276.27 | 244.62 | 204.41 | Cycle3 / 204秒 |
| 上限優先 / 5秒 | 1826.61 | 559.44 | 279.40 | 248.76 | 220.66 | Cycle3 / 210秒 |
| 上限優先 / 30秒 | 1845.59 | 582.09 | 300.18 | 279.40 | 280.37 | Cycle3 / 240秒 |
| 非ATK Lv1のみ / 1秒 | 1823.23 | 581.43 | 290.58 | 397.18 | 1424.75 | Cycle4 / 225秒 |

非ATK Lv1のみでも序盤目標は成立するが、新上限へ投資しないと深層で遅れる。Speed/Critの追加投資には意味があり、2〜3CycleをATKだけで終わらせる必要はない。30秒間隔はAUTO解禁後も購入判断を遅らせる保守的モデル。最低300秒はなく、3Cycleの300.18秒は操作遅れによる自然な結果。

均等SOUL配分だけの参考結果で、全POWER等の極端配分や最適戦略の保証ではない。実装後、予約Goldを含むAUTO運用・初心者の購入順・SOUL自由配分をプレイテストする。

## 9. BURSTと再現方法

一定Stage・能力なら `N=floor(phase + elapsed/ClearTime)`、phase繰越、Gold=N×当該StageのGold/CLEAR。途中購入・Stage跨ぎは区間ごとの合算。

| Clear Time | 5秒の周回（phase=0） |
|---:|---:|
| 30秒 | 0、phase=1/6 |
| 5秒 | 1 |
| 1秒 | 5（通常表示の境界） |
| 0.8秒 | 6、phase=.25 |
| 5/128秒 | 128 |
| 5e-6秒 | 1e6 |
| 5e-12秒 | 1e12 |

初期コンテンツで1e12へ到達する必要はないが、計算/表示/Saveの入力テストを必須とする。将来のParallel/Time Compression等は連続周回率倍率として接続し、固定Delayにフレーム下限を掛けない。

```sh
python docs/balance/simulate.py --cycles 12
python docs/balance/simulate.py --cycles 12 --soul-exponent 1.25
python docs/balance/simulate.py --cycles 10 --decision-interval 30
python docs/balance/simulate.py --cycles 10 --normal-policy lv1-only
python docs/balance/simulate.py --check
```

イベント刻みでdt誤差を避け、1秒の購入境界は整数時刻で保つ。指数はCLIで変更でき、恒久配分はbalanced/power/wealth/tempoを比較できる。試算は1Cycle7200秒を計算上の検証範囲とし、超えたらエラーとして設計の再検討を促す。これはゲーム内の制限やPrestige条件ではない。巨大周回の性能をこの参照スクリプトで評価しない。
