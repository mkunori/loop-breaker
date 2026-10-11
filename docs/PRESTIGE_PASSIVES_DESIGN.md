# Issue #19 差分設計・実装前比較

2026-10-10、speed-6を凍結基準として `balance/passives.py` で5案×3戦略、D案の4購入方針、単独AUTO/予約Goldを比較した。ゲームコードを変更する前の採用判断。

## 採用D案

Speed=min(8,1+floor((p+1)/2))、Crit通常=min(10,1+floor(p/2))、Overkill通常=min(10,1+floor(max(0,p−1)/2))。p>=16ならDeep保証=min(12,8+d)、それ以前0。Crit/Overkillは通常とDeep保証のmax。P0は6/20/40 CLEARにそれぞれLv1、解禁前0。確定Deepのみ使用する。

旧効果1.25^Speed、1+.1×(3−1)×Crit、1+.15×Overkillを完全維持する。Crit11/12は期待値倍率3.2/3.4として表示し、120%の確率とは説明しない。購入Lvはrun.upgradesのatk/delayだけ。パッシブLvは保存せず導出する。

## 実装前の数値比較

手動Route MAX→ATK MAX、1秒間隔の共通モデル。Pは完了Prestige回数。操作待ち時間を含まない。

| 案 | Escape P20/P30/P50 秒 | Deep Run P20/P30/P50 秒 |
|---|---|---|
| speed-6 |190.97 / 122.72 / 98.58|751.41 / 325.09 / 381.92|
| 最大8 |165.82 / 109.59 / 88.66|710.42 / 320.20 / 378.88|
| 通常12 |120.13 / 67.70 / 54.69|508.21 / 233.39 / 228.54|
| Deep12 |165.82 / 109.59 / 88.66|591.87 / 233.39 / 228.54|
| D 通常10・Deep12 |127.41 / 84.55 / 68.40|591.87 / 233.39 / 228.54|

Dは通常Prestigeでも育ち、11/12をDeep報酬として残す。初Prestige347.88秒（旧354.03）、Active Farm初BURST920.08秒=15:20（旧933.06秒=15:33）。参考のATK50先行とは購入順が違うため、Escapeの暫定値93/66/54秒には合わせない。他Balance値を調整しない。

## AUTO ROUTE購入方針

Stage900生涯CLEARで解禁、初期OFF。ON設定はSave/Prestige保持。解禁前に内部ON予約はできない。既存1秒AUTO時計を共用する。AUTO ATKだけONなら従来の予約Gold付きMAX。AUTO ROUTEだけONならRoute MAX。両ONなら現在Stageにおける次1LvのClear Time短縮量÷価格を比較し、高い方を先にMAX、残額で他方をMAX。同効率はATK。優先候補が未購入可能ならその候補の資金を貯め、他方へ使い流さない。全自動購入は共通reserveGoldを残す。MAXは幾何級数・対数で行いLv比例loopなし、比較は2候補の定数回。

| 両AUTO方針 | Deep Run P20/P30/P50 秒 | +1 Deep P20/P30/P50 秒 |
|---|---|---|
| ATK優先 |397.46 / 188.27 / 176.72|200.55 / 212.79 / 133.94|
| Route優先 |591.87 / 233.39 / 228.54|250.74 / 284.59 / 178.82|
| ATK50先行 |398.54 / 192.38 / 228.12|203.59 / 212.84 / 139.04|
| 短縮効率・資金確保（採用） |325.24 / 165.94 / 149.67|170.23 / 183.65 / 116.99|

このAUTOモデルは解禁前にATKだけを買い、Stage900以後にユーザーがRoute ONを選ぶ想定。Escapeだけでは900へ行かないためAUTO ROUTEは解禁されず、4方針ともP20/30/50=70.67/53.46/44.51秒。手動モデルと混同しない。

ATK優先のDeep RunではRoute購入間隔が最大246秒、採用方針では7秒（購入時点間、未解禁期間除外）。ATK側も購入を継続し、同モデルの最大間隔159秒（HP攻略中のGold供給待ちを含む）。P17/Deep1・予約0/1000の復帰比較では採用併用102.91/89.79秒、ATKのみ77.73/78.02秒。両ONが全Stage攻略で最速とは限らず、RouteはFarm時短への投資。RouteだけでATKを一切買わないモデルは7200秒でもStage800未達、これは攻撃育成不足。AUTO ROUTEがATKを勝手に購入する仕様にはせずUIでATKも育成する旨を示す。

## 実装と回帰方針

P0パッシブ境界は最大3個で積分を区切り、効果をCLEAR時点から適用。stageSums/rangeTotals/二分探索/巨大BURST/AUTO ADVANCEを維持する。UIは購入ボタン2つ、パッシブ現在Lv/期待倍率/次Prestige成長/Deep差分を既存シートへ表示。AUTO ROUTE設定はUPGRADESシートへ置きQuick Buy高さを増やさない。

speed-7 / saveVersion1。旧speed-6を明示拒否し原文保持・Export・手動新規開始を維持。新Saveは購入Lv2つとrouteEnabledを保存。無料Lvをrun.upgradesへ混ぜず、旧キー混入も拒否する。

既存3 Python --checkはspeed-6および過去HP比較の凍結検証として残す。新規passives.pyと本体のLv・価格・購入順の一致を追加テストする。旧Gold購入を前提としたテストは無料パッシブ条件へ変更し、その理由と新旧数値を記録する。HP/SOUL/MASTERY/Stage800/Deep獲得/1ms BURST/AUTO ADVANCEは無変更。

## 全チェックポイントと再現

[5案×3戦略・AUTO4方針のCSV](balance/issue19-comparison.csv)はP0/1/2/10/15/16/17/20/25/30/40/50を記録する。単位は秒/Gold、空欄のBURST・Stage800はそのCycle未到達。Cycle時間・累計、Stage800、Speed/Crit/Overkill、ATK/Route Lvと支出、旧パッシブ支出、購入操作数、SOUL/分、Deep前後、BURST、開始/終了Clear Time、恒久Lvを含む。必要Stage800より浅いCycleのStage800欄は空欄。以下はDの手動Route優先比較。

| P | Escape 秒 | +1 Deep 秒 | Deep Run 秒 | Escape 累計秒 | Escape SOUL/分 | Deep Run SOUL/分 |
|---:|---:|---:|---:|---:|---:|---:|
|0|347.88|347.88|347.88|347.88|0.69|0.69|
|1|97.20|97.20|97.20|445.08|4.94|4.94|
|2|42.95|42.95|42.95|488.03|5.59|5.59|
|10|19.42|19.42|19.42|702.65|135.93|135.93|
|15|120.96|120.96|120.96|1004.46|40.67|40.67|
|16|205.51|299.78|575.07|1209.97|26.28|12.21|
|17|158.36|284.85|514.36|1368.33|34.10|16.91|
|20|127.41|250.74|591.87|1771.31|42.38|24.74|
|25|107.28|371.32|273.98|2306.33|50.34|96.58|
|30|84.55|284.59|233.39|2757.55|63.87|173.02|
|40|68.46|194.70|181.56|3562.28|78.88|405.50|
|50|68.40|178.82|228.54|4246.71|78.94|494.09|

**トレードオフ:** 手動Route優先のP16はspeed-6の178.96秒から205.51秒に伸びる。無料化で浮いた資金をRouteへ早く支出しATKの育成順が変わるため、無料化でも全Cycleが必ず短くなるわけではない。HP等を変更して帳尻を合わせず、固定順と効率優先を比較した。短いEscapeとDeepの追加SOUL/パッシブ成長の選択を残す。P50以降のテンポは未保証。

参考モデルの初BURSTはActive15:20、Casual16:25、AUTO ATK Only20:56。初Prestige5:48。1秒151秒、100ms438.88秒、10ms562.08秒、1ms920.08秒。CasualはRouteだけ60秒毎、AUTO OnlyはRouteなし。全モデルで無料パッシブは自動適用される。AUTO ROUTEはStage900以降なので初回Farm BURSTには介入しない。

speed-6 Escape P0〜P50では旧3パッシブのMAX購入が合計406回、約529,100 Gold。Dは両方0。これは1秒毎判断の参照モデルで購入が成立したMAX操作数であり、クリックの所要時間や人間の反応時間は含めない。ATK/RouteとPrestige選択は残る。

再現:

```sh
python docs/balance/passives.py --check
python docs/balance/passives.py --check --csv docs/balance/issue19-comparison.csv
```

初回比較で各CLEARを計算し、共通HPと能力の同じ算術のみを有限LRUキャッシュする。意思決定・Gold支出・CLEARを省略しない。独立参照と本体をtests/data/auto-route-reference.jsonの10ケースで照合し、購入順・Lv・残Goldを検証。参照のdoubleでは11664Gが11664.000000000002になり得るため、購入可否だけ絶対1e-9の許容差を使う。本体は既存Big価格/MAX補正を使い、この許容差を導入しない。speed-6の17Cycle一致と初BURST933.056秒を--checkで固定する。

## 旧テストの変更理由と検証

- 5購入ボタン→2、旧購入Lv fixture→atk/delayだけ。Lvはp/deep/CLEARから導出。旧passive buy commandは無支出no-opを追加検証。
- P1/SOUL各Lv1直後は無料Speed2/Crit1/Overkill1により1.76s→1.07s。初Prestige/初BURSTの旧期待は凍結Pythonで保持し、新本体は新参照JSONと照合。
- P17/Stage807→850の回帰は、Crit/Overkillが購入8から自動9になるため77秒→67秒。HP変更なし、2分以内を維持する。
- speed-6を新たに非対応Balanceテストへ追加し、speed-3/4/5等の拒否と原文保持も残す。
- 全購入/解禁/UI/BURST/巨大CLEAR・AUTO ADVANCE・Saveテストは上の意味変更を明示して維持する。

unit/integration182件、E2E104件（320/360/390/PC）。Quick Buy191px。Reduced Motion、横スクロールなし、画像読込、console/pageerrorなし、固定DOM/React/通信予算を確認する。4つのPython --checkをCIへ登録する。iOS Safari実機とP50超の長期プレイは未確認。

最終ローカル検証: lint / typecheck / unit・integration 182件 / E2E 104件 / 既存3 + 新規1 simulation --check / production build はすべて成功。JS 285.93KB（gzip88.45KB）、CSS14.70KB（gzip4.13KB）。[320pxの2購入・パッシブ表示](review/issue19/passives-320.png)。Quick Buyは全4幅191px、1e6/1e12 CLEARで固定DOM9・5秒のReact更新50〜52・追加通信0、AUTO ADVANCEの高速経路でも固定DOM17・更新50・追加通信0を確認。
