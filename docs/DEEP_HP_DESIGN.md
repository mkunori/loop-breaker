# 深部HP曲線 / Issue #15 / speed-5

変更はStage701以降の追加HP成長だけ。初期5秒、Upgrade・解禁・Gold・Stage密度、Required Stage +50、SOUL指数1.5、恒久強化、MASTERY ×0.88、BURST 1ms / 5秒窓、AUTO ADVANCEは維持する。UI追加はない。

## 候補比較と採用

実装前にPython参照モデルで旧式とA/B/Cを比較した。基礎成長1.002は全区間で継続する。

| 候補 | 最初の追加成長 | 第2区間 | 第3区間 | P17 fixture秒 | P20 Cycle秒 | P30 Cycle秒 |
|---|---|---|---|---:|---:|---:|
| 旧 | 101以降1.020 | — | — | 457.70 | 7200秒の計算上限超過 | — |
| A | 101–700:1.020 | 701–1000:1.006 | 1001以降:1.002 | 76.08 | 414.96 | 743.00 |
| **B採用** | **101–700:1.020** | **701–1000:1.005** | **1001以降:1.001** | **67.00** | **350.36** | **447.94** |
| C | 101–750:1.020 | 751–1100:1.005 | 1101以降:1.001 | 140.28 | 680.21 | 1248.39 |

Bはfixtureの1〜2分目標を満たし、P20→30のCycle増加が約1.28倍。Aは1.79倍、Cは1.84倍でP30は12.38分/20.81分。Cはfixtureも2分を超える。BでもP30は7.47分で、すべてのCycleを数分以内・一定時間にはしない。許可されたHP曲線だけで最も停滞を抑えるBを採用する。Stage1000以降もHPは1.003002倍/Stageで増え、50Stageは約1.1617倍、MASTERYと競争する。P30より先の恒久価格上昇も含む無期限のテンポ保証はしない。

```text
HP(s) = 240 × 1.002^(s−1)
      × 1.020^min(max(s−100,0),600)
      × 1.005^min(max(s−700,0),300)
      × 1.001^max(s−1000,0)
```

`BALANCE.hp.deepSegments`に3区間を集中管理。700/1000まで直前区間、701/1001から新倍率を適用する。700以下は旧Big演算と同じ順序にし、後半区間のpow(0)/mul(1)も加えない。Stage1/100/250/500/700でBigの等値をテストする。

| Stage | 旧HP | B HP |
|---:|---:|---:|
| 701 | 1.4332421e8 | 1.4121650e8 |
| 850 | 3.6900788e9 | 3.9987029e8 |
| 1000 | 9.7100091e10 | 1.1402147e9 |
| 1500 | 5.2621871e15 | 5.1037118e9 |

## 実プレイ回帰

P17 / Required850 / Stage807 / highest806 / ATK55・Speed8・Crit8・Overkill8・Route6 / POWER10・WEALTH9・TEMPO9 / Gold6538 / AUTO ATK ON / AUTO ADVANCE ON。未提供のphase=0、予約Gold=0、autoClock=0とし、Stage807最初のCLEAR直前の経路位置4030から開始。手動強化やSOUL購入なし。Stage850へ入るだけではなく、最初のCLEARまで216CLEARを確認する。

Python旧457.7008秒→B67.0047秒。AUTO購入でATK55→56になる。購入なしでも旧472.69秒→B68.60秒。本体の1秒tickは旧458秒→新68秒。ブラウザは76秒進行（5秒自動Saveの完了も待つ）でhighest>=850、AUTOでTarget>=875、Prestige17/Route6が変わらないことを確認する。fixtureは現行版のtest/simulation状態として再構築し、本番Save migrationには使用しない。

## 長期Prestige

Pは完了Prestige数（Cycle=P+1）。Requiredの最初のCLEARで手動Prestige、AUTO ADVANCE OFF。1秒毎に非ATK上限へMAX購入→ATKへ残額。恒久は最低Lvを優先、同LvならPOWER→WEALTH→TEMPO。SOULは実支払いと繰越。巨大資金や未獲得Lvの注入なし。BURST欄はCycle内でClear Timeが1ms未満になる最初の時刻。その後深部HPで通常へ戻る場合がある。

| P | Required | 開始秒 | 攻略秒 | 攻略時秒 | 獲得SOUL | POWER/WEALTH/TEMPO | BURST再到達秒 |
|---:|---:|---:|---:|---:|---:|---|---:|
| 10 | 500 | 0.13660416 | 23.15 | 0.02840313 | 44 | 7/6/6 | 未到達 |
| 15 | 750 | 0.06002667 | 139.42 | 0.28722973 | 82 | 8/8/8 | 未到達 |
| 17 | 850 | 0.04340974 | 196.57 | 0.30037287 | 99 | 9/9/8 | 6 |
| 20 | 1000 | 0.02637997 | 350.36 | 0.39554338 | 126 | 10/10/9 | 4 |
| 25 | 1250 | 0.01249494 | 401.76 | 0.26013096 | 176 | 11/11/10 | 2 |
| 30 | 1500 | 0.00595361 | 447.94 | 0.19974634 | 232 | 12/12/11 | 1 |

全P0〜30とA/Cは[比較結果](balance/issue-15-comparison.txt)。PythonはCLEARイベント列挙の小規模参照、本体は集約計算。操作を1秒に量子化する本体参照プレイヤーとの差は既存の許容範囲で検証する。本体31CycleテストはP16〜30が480秒未満、P20→30増加が1.3倍未満を確認する。

## 序盤回帰

| モデル | 旧初BURST秒 | B初BURST秒 |
|---|---:|---:|
| Active Farm | 933.06 | 933.06 |
| Casual | 1082.87 | 1082.87 |
| AUTO ATK Only | 1389.89 | 1389.89 |
| Immediate Prestige | 1477.76 | 1276.04 |

Active初Prestige354.03秒、1s未満158秒、100ms未満450.03秒、10ms未満576.06秒、1ms未満933.06秒。Stage100でFarmする3方針は完全一致。Immediateは700超のCycleを通過してBURSTへ到達するため24.63分→21.27分。最初15Cycle（P0〜14、Required<=700）は全方針で同じ秒数。初期5秒・約15分Active BURST・Immediate25分以内を維持する。

## 集約計算

hpは固定3区間。stageSumsはHP境界101/701/1001とGold境界の和集合で分割。既定Gold境界101は重複し最大4ブロック、各ブロック1幾何級数（Stage周期1）。Goldを独立に変更しても有限個のブロック。1区間O(B log R)、Bは固定ブロック数、Rは到達可能経路CLEAR。HP和O(B)、AUTO最終Target導出は既存O(1)。Stage/CLEAR/Target数比例のproduction loopなし。

境界跨ぎ範囲和と逐次参照を比較し、1e9 Stageの和が4 formulaGroupsで終わることを検証。既存AUTO ADVANCE、BURST、1e6/1e12 CLEAR、DOM/React/通信上限テストを維持する。深部が緩くなり既存巨大fixtureのBURST退出が遅れるため、E2Eの安定DOM計測前のwarmupを1秒から6秒に延ばす。モード退出を明示確認してから従来の固定DOM/更新/通信上限を検証する。AUTOロジック・UIを変更する対応ではない。

## Save・検証

Save Version1を維持、balanceVersion=speed-5。speed-4以前は既存エラーで拒否、migration/読替え/自動wipeなし。current/backup、原文Export、確認付き新規開始を維持。speed-5同士のreload/Export/ImportとautoAdvance欠損falseは利用可能。正式リリースまではBalance間のSave互換性を保証しない。

```sh
python docs/balance/simulate.py --check
python docs/balance/deep_hp.py --check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

CIに2つのsimulation --checkを追加、PRはdeployしない。iOS Safari実機とP30より先の長期テンポは未確認。

検証結果: lint / typecheck成功、unit/integration **101件**、Playwright **88件**すべて成功。320/360/390px・PC、Reduced Motion、画像・pageerror・横スクロール確認を含む。Quick Buyは191px。巨大AUTO経路はTarget約494375でもDOM17個・React commits50/5秒・追加request0（この計測区間）。1e6/1e12 FarmもDOM9・commits51/5秒・追加request0。2つのsimulation --check成功。production buildはJS279.58kB（gzip86.62kB）、CSS14.70kB（gzip4.13kB）、画像変更なし。
