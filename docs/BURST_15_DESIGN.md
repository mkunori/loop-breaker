> speed-4当時の記録。現行speed-5の深部HP・Save方針は[DEEP_HP_DESIGN](DEEP_HP_DESIGN.md)を参照。AUTO ADVANCEの仕様・式・schemaは同じ。旧Balance移行は行わない。

# Issue #11: 15分BURST / Quick Buy

実装前にPythonで候補を比較し、PR #12レビューで4モデルまで拡張。初期5秒、1ms enter / 1.1ms exit、5秒window、HP・Gold・SOUL指数1.5・POWER/WEALTH/TEMPO効果を維持する。BREAK II以降のMASTERY継続短縮だけを今回のレビューで追加した。

## 採用候補

Damage60・ATK効果1.16は維持。ATK価格35×1.12^Lv、Route価格2000×1.8^Lv。Stage密度5 CLEAR/Stage、初回攻略496 CLEAR。Route capはmin(30,6+3p)。Unlock Speed6/Crit20/Overkill40/Route70、AUTO120 CLEAR。

固定待ちのATK単独短縮を追加する:

```text
FixedDelay = 1 × .85^TEMPO / (.94^(-ATK) + .60^(-Route) − 1)
```

旧式はATKを無限に上げてもRoute0なら1×.85^TEMPO×MASTERYの下限が残り、AUTO Onlyの20〜25分到達に対応できない。ATKの弱い待ち短縮とRouteの強い短縮を分母へ加算し、効果の積算による早すぎるBURSTを避ける。両Lv0は1秒、Route0は.94^ATK、ATK0は.60^Route。どちらを買っても改善し、追加通貨や時刻ゲートはない。

## 比較（ATK35 / growth1.12、Stage密度5、ATK待ち係数.94）

| Route base | Active秒 | Casual秒 | AUTO Only秒 |
|---:|---:|---:|---:|
| 1500 | 866.06 | 1022.87 | 1389.89 |
| 2000 | 933.06 | 1082.87 | 1389.89 |
| 2500 | 959.06 | 1082.87 | 1389.89 |

2000を採用。約15分中心で、序盤ATK、msでRouteの役割を残す。先行比較の待ち短縮を積算する案は約8分まで短くなったため不採用。

別候補のStage密度4ではATK35/Route2000で895秒、初Prestige325秒。密度5を採用して初Prestige354秒・10ms576秒と段階を少し長くした。密度40維持や固定待ち旧式維持は初回/単独ATK目標に不適合。今回1ms境界を緩めない。

## 購入モデル（プレイヤーの参考行動、ゲームの自動規則ではない）

- Active Farm: 1秒ごとに解禁済み非ATKをSpeed/Crit/Overkill/Route順でMAX、残りATK MAX。
- Immediate Prestige: 購入はActive Farmと同じ。ただし全Cycleで目標CLEAR直後にPrestigeし、農場育成はしない。
- Casual: ATKは1秒ごと、非ATKは60秒ごと。同じ優先順。
- AUTO ATK Only: 初期は手動ATK、AUTO解禁後は1秒ATK MAX。他の通常強化は買わない。
- 全モデルで恒久は最低Lv優先・同LvはPOWER→WEALTH→TEMPO、実価格を支払いSOUL繰越。
- Immediate以外は最初2回を攻略後にPrestige、Cycle3はStage100を攻略しても初BURSTまで育成・稼ぎを続け、以降は攻略時にPrestige。プレイヤー参考方針であり、Prestige待ち時間や自動化を実装しない。

| Active到達 | 累積秒 |
|---|---:|
| 初購入 | 約20 |
| 1分Clear Time | 2.89s |
| 1秒未満 | 158 |
| 初Prestige | 354.03 |
| 100ms未満 | 450.03 |
| 10ms未満 | 576.06 |
| 初BURST | 933.06 |
| AUTO解禁 | 195.41 |

| モデル | 初Prestige | 初BURST（累積） | 初BURST Cycle / Stage |
|---|---:|---:|---|
| Active Farm | 354.03秒 / 5:54 | 933.06秒 / 15:33 | 3 / 100 |
| Immediate Prestige | 354.03秒 / 5:54 | 1477.76秒 / 24:38 | 18 / 187 |
| Casual | 365.84秒 / 6:06 | 1082.87秒 / 18:03 | 3 / 100 |
| AUTO ATK Only | 432.15秒 / 7:12 | 1389.89秒 / 23:10 | 3 / 100 |

### 即Prestigeの改善と比較

旧案はMASTERYがBREAK IIの.36で止まり、即Prestigeを選ぶと通常強化のリセットと深部HP増加が先行する。初期12CycleでBURSTへ入れず、Cycle16が約735秒まで延びていた。説明だけで農場育成を誘導する設計を避け、3回目以降も各Prestigeで全RUN時間を12%短縮する。

```text
MASTERY(p) = [1, .55, .36][min(2,p)] × .88^max(0,p−2)
```

| 3回目以降の係数 | Immediate初BURST | 判断 |
|---:|---|---|
| 1.00（旧案） | 12Cycle内で未到達 | リセットを続ける選択に不足 |
| .85 | Cycle15 / 813.74秒（13:34） | Active Farmより速く、農場育成の価値を弱める |
| **.88** | **Cycle18 / 1477.76秒（24:38）** | 農場育成より遅いが25分以内、採用 |
| .90 | Cycle19 / 2671.54秒（44:32） | 目標25分を超える |

候補は `--normal-policy immediate --cycles 20 --mastery-growth .85/.88/.90` で再現できる。旧案のみ `--cycles 12 --mastery-growth 1`。細かな係数変更で購入順・Lvが変わるため、到達時間は単調な補間にならない。初回と2回目のBREAK倍率、必要Stage、通常cap、価格、SOUL効果はレビュー前の値を維持。最初3CycleのFarm到達時間も変わらない。最低時間ゲートやBURST前Prestige禁止は設けない。

Prestige画面に継続12%短縮と現在/次の累積倍率を表示。BREAK II以降・BURST未解禁なら農場育成でもBURSTを目指せる案内を出す。継続倍率はBigで計算し、Prestige10000回でもNumberのアンダーフローで0へ潰れない。Saveへ新フィールドは追加しない。

### Cycle1〜12と深部逆成長

[4モデル比較表](balance/issue-11-cycle-comparison.md)と各 `balance/issue-11-{active,immediate,casual,auto}.txt` に必要Stage・時間・SOUL・恒久Lv・開始/終了時間・BURSTを記録。Pythonはイベント参照、TypeScript統合テストは本体batch/AUTOを使い、到達時間の許容帯を照合する。

ImmediateではCycle18開始43.4msから6秒後、Stage187で1ms未満に入り、累積24:38で初BURST。初BURST後も深部HPは維持するため、Cycle18のStage850終了時は2.77s、Cycle19/20は終了8.41s/17.31sに逆成長する。Cycle所要は676/2063/4311秒。この設計は「初BURST25分以内」を保証する参照モデルであり、「一度BURSTに入ると全深度で永久にBURST」「深いStageの攻略も25分以内」ではない。開始時間はCycle1〜20で毎回改善し、19/20でも序盤にBURSTへ再到達する。深部への挑戦か同じ目標での育成かを選べる。極端な長期インフレ帯のバランス完成は保証せず、深部曲線の追加調整は別Issueとする。

## Quick Buy

全幅でATK + 非ATK候補1つ。候補は解禁済み・未上限から購入可能なものを先に選び、同条件なら既存のRoute→Overkill→Crit→Speed順。買えるものがなければ同順の次候補を表示する。常駐欄は短い名前、Lv、価格、購入後Clear Time。非ATKは現在→購入後を表示。倍率やCap・UnlockはUPGRADESへ。x1 / MAXを維持し、AUTOは小さなチェック行、予約Goldはシート内のみ。Compact Mode設定なし。320×800で通常/解禁後とも200px以内をE2Eで検証する。

## Save

saveVersion1、balanceVersion speed-4を維持。**正式リリースまではBalance間のSave互換性を保証しない。** prototype-2 / speed-3の経路変換と互換テストは削除。speed-4以外を読込/Importすると「開発版の仕様変更により旧Saveは利用できません。新規開始してください。」を表示し、暗黙の変換や自動wipeをしない。currentが旧版でもbackupが現行なら復旧できる。両方利用不可なら進行/自動保存を停止し、元の文字列をExportできる。ユーザーが二段階確認で「新規開始」を選ぶ。現行版同士のreload/Export/Import、current/backup、将来のschema migration registryは維持。レビュー中の未merge版の調整なので新しいbalanceVersionは発行しない。

## 検証

unit / integration72件・E2E68件。4モデル、12〜20Cycle、Route短縮、SOUL台帳、現行Save往復と旧版の明示拒否、320/360/390/PC、Reduced Motion、横スクロール/pageerrorなしを検証する。320px常駐191px（AUTO行込み）。Route例4.88ms→3.41ms。[レビュー画像](review/ISSUE_11_QUICK_BUY_REVIEW.md)。1e6/1e12以上CLEARでも固定9 DOM・50〜51 commits/5秒・画像warmup後追加通信0。旧互換テスト削除による件数減を記録し、現行Saveと旧版拒否は新テストで維持する。GitHub Actions最終結果はPR本文へ記録。
