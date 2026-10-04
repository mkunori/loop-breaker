# Issue #11: 15分BURST / Quick Buy

実装前にPythonで3モデルを比較。初期5秒、1ms enter / 1.1ms exit、5秒window、HP・Gold・SOUL指数1.5・MASTERY・POWER/WEALTH/TEMPO効果を維持する。

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

- Active: 1秒ごとに解禁済み非ATKをSpeed/Crit/Overkill/Route順でMAX、残りATK MAX。
- Casual: ATKは1秒ごと、非ATKは60秒ごと。同じ優先順。
- AUTO ATK Only: 初期は手動ATK、AUTO解禁後は1秒ATK MAX。他の通常強化は買わない。
- 全モデルで恒久は最低Lv優先・同LvはPOWER→WEALTH→TEMPO、実価格を支払いSOUL繰越。
- 最初2回は攻略後にPrestige。Cycle3ではStage100を攻略しても初BURSTまで育成・稼ぎを続ける。その後の12Cycle検証は攻略時にPrestige。これは目標Stageで稼ぐ既存仕様の利用であり、Prestige待ち時間や自動化を実装しない。毎回即Prestigeを選ぶと到達時刻は変わる。

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

Casual初BURST1082.87秒、AUTO Only1389.89秒。詳細・12Cycleはbalance/issue-11-*.txt。後半も深部HPによりCycle時間が伸び始める。12Cycleだけで全インフレ帯のバランス完成は保証しない。

## Quick Buy

全幅でATK + 非ATK候補1つ。候補は解禁済み・未上限から購入可能なものを先に選び、同条件なら既存のRoute→Overkill→Crit→Speed順。買えるものがなければ同順の次候補を表示する。常駐欄は短い名前、Lv、価格、購入後Clear Time。非ATKは現在→購入後を表示。倍率やCap・UnlockはUPGRADESへ。x1 / MAXを維持し、AUTOは小さなチェック行、予約Goldはシート内のみ。Compact Mode設定なし。320×800で通常/解禁後とも200px以内をE2Eで検証する。

## Save

saveVersion1維持、balanceVersion speed-4。prototype-2（密度12/5）とspeed-3（密度40）を同じStageへ一度だけ写像。攻略済みStageと目標攻略sentinelを保持。Stage内の非ゼロ進捗は最低1へ丸め、highest整合を維持。Gold・実CLEAR・Lv・Prestige・SOUL・AUTO・統計・phase・部分BURSTは増減させない。現行版の再ロードは写像しない。既存上限は下げない。

## 検証

unit / integration80件・E2E64件。3モデルの実集計計算、Route短縮、SOUL台帳、prototype-2/speed-3移行、320/360/390/PC、Reduced Motion、横スクロール/pageerrorなしを確認。320px常駐191px（AUTO行込み）。Route例4.88ms→3.41ms。[レビュー画像](review/ISSUE_11_QUICK_BUY_REVIEW.md)。1e6/1e12以上CLEARでも固定9 DOM・50〜51 commits/5秒・画像warmup後追加通信0。GitHub Actions最終結果はPR本文へ記録。
