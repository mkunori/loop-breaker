# LOOP BREAKER — 技術設計 v4（Issue #11）

実装方針を定義する文書。[GAME_DESIGN](GAME_DESIGN.md) と [BALANCE_DESIGN](BALANCE_DESIGN.md) を仕様として使用する。Issue #3で初期実装を追加した。具体的な構成・検証結果・仕様補足は [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) を参照。

## 1. 技術構成

React + TypeScript + Vite、通常CSS、Vitest、Playwright、break_infinity.jsを採用案とする。バージョンは実装開始時に互換性を確認してlockfileへ固定する。バックエンド不要。Reactはカード/シートとアクセシビリティに使用し、戦闘はDOM/CSSで十分。Canvasゲームエンジン、Redux、ECS、DIコンテナ、イベントバス、プラグイン基盤、Workerは初期導入しない。

Viteの静的ビルドをGitHub Pagesへ配信できる構成にする。リポジトリ公開パスならbaseは `/loop-breaker/`、単一画面なのでルーター不要。[Vite公式配信ガイド](https://vite.dev/guide/static-deploy.html)。Reactの状態を適切な所有元へまとめる考え方は[公式ガイド](https://react.dev/learn/managing-state)に従う。単体テストは[Vitest](https://vitest.dev/guide/)、ブラウザ操作は[Playwright](https://playwright.dev/docs/intro)を使用する。

巨大数は[break_infinity.js](https://github.com/Patashu/break_infinity.js)を薄いnumberモジュールで包む。同ライブラリは精度より大きな桁と速度を優先するため、厳密な整数台帳とみなさない。初期に独自巨大数ライブラリを実装しない。

想定構成（将来作成する場所）:

```text
src/config/balance.ts       # 数式の係数、価格、上限、解禁、Stage、Prestige
src/config/presentation.ts  # UI更新/演出/Save間隔、表示桁
src/game/state.ts           # GameState、Command、初期状態
src/game/math.ts            # Damage/DPS/価格/SOUL/ClearTime/Stage積分
src/game/advance.ts         # advance、周回集計、AUTO、BURST
src/game/commands.ts        # buy、Prestige、deepen、AUTO設定
src/game/number.ts          # Decimal生成/演算補助/表記/シリアライズ
src/game/save.ts            # schema検証、migration、encode/decode
src/platform/storage.ts    # localStorage読み書き
src/platform/runtime.ts    # clock、visibility、UI通知
src/ui/App.tsx             # 画面とシート、表示用selector
tests/                     # 純粋関数、Save fixture、統合、ブラウザ
```

当初は数ファイルでよく、複雑化した時だけ分割する。計算がUIから独立していることが重要で、レイヤーの数は目標ではない。game層はReact/window/storage/Dateに依存しない。引数State/Config/elapsedを入力として結果Stateと少数の集計通知を返す。演出通知もCLEAR回数分の配列にしない。

## 2. 設定と状態

balance.tsの1オブジェクトに以下を集中させる: HP内訳/初期成長1.002/追加成長3区間（101–700:1.020、701–1000:1.005、1001以降:1.001）、攻撃/速度/Crit/Overkill/Delayの全係数、Gold/CLEARとStage倍率（増分.0005、上限+5%）、初期Damage60/固定待ち1秒/Route上限6+3p、5強化の価格とGrowth、Prestige回数別の上限解放式、解禁CLEAR、恒久価格と効果、LOOP MASTERYの回数/名称/累積倍率、SOUL式係数/指数1.5/2回目ボーナス、Stage境界の5/1、初期目標100/増分50/Prestige cap800、継続MASTERY固定開始P16、Deep間隔50、深化25、BURST閾値.001/復帰.0011/窓5秒、将来の周回率倍率（初期1）。balanceVersionはspeed-6。Prestige最低時間の設定は存在しない。UIから参照し、同じ数値を重複定義しない。

presentation.tsにはUI通知100ms、AUTO判断1秒、Save5秒、演出LODはcombatVisual.tsで斬撃上限4/秒、説明用桁数。AUTO間隔は収入に影響するため変更時はバランス検証も行う。設定検証で負数、成長係数1以下の価格、Crit率100%超、ゼロClearTime、整合しない上限を拒否する。

所有するStateは現在Gold、通常Lv、Cycle CLEAR、経路進行routeClears、周回進捗phase、Cycle表示中時間、現在目標Stage、Cycle最高CLEAR Stage、SOUL、恒久Lv、Prestige回数、Deep MASTERY Lv、生涯解禁、AUTO設定、集計統計、部分BURST、AUTO時計。Damage/DPS/HP/価格/現在Clear Timeは派生値。現在StageはrouteClears/目標から導出しSaveでは参考値としてのみ保存する。LOOP MASTERYはPrestige回数とDeep MASTERY Lv、通常上限はPrestige回数から導出する。累積倍率をSaveに重複保存しない。Cycle時間は統計専用。UI用の開いているシート、アニメ進捗、選択カードは永続化しない。

固定範囲のLv/Stage/フラグはnumber/boolean。Lvは安全な整数かつ数値保護上限1,000,000以下（ATKのゲーム上の到達上限ではない）、Crit<=8。Stage/目標は数値保護上限1,000,000,000以下。Required Stageはゲーム上800でcapするが、任意深化のStage保護上限は1e9を維持する。Prestige回数はStageとの上限連動を外し、独立した安全整数上限1e9を設定する（待機ゲートではない）。Deep Lv上限はfloor((Stage保護上限−800)/50)=19,999,984。routeClearsもnumberで、目標初CLEARの境界+1以下（最大約4e10）。巨大量はDecimal。設定変更で保護限界を広げる時は再検証する。

## 3. 時間の進め方とイベント順序

runtimeだけがperformance.now相当の単調時計を読む。rAFは演出に使い、経過時間からadvanceを呼ぶ。UI描画は最大10Hz。遅いフレームでもdeltaをフレーム固定秒に置き換えない。ページ非表示時はそこまで精算し保存、時計基準を捨てる。復帰時は新しい基準時刻から始める。deltaが5秒を超える長時間中断は最大5秒だけ進め、余剰は破棄して「中断中は進行しません」を表示する。通常の小さなカクつきでは時間を失わない。Date.nowはSaveの表示日時にだけ使う。

1. 次のAUTO整数秒境界、BURST5秒境界、外部操作時刻までを時間区間として取る。
2. その区間を購入前の一定能力で積分する。Stageは区間内でも変わるので後述のStage積分を使用する。
3. CLEAR/Gold/経路進行/統計/Cycle時間/Stage最高CLEAR/解禁をまとめて反映。
4. 同じ時刻ならBURSTを閉じてからAUTO購入、その後ユーザー操作。通知はまとめる。
5. 能力を再計算して残区間を進める。

unlockは区間内の閾値通過で記録するが、自動で新能力を購入しない。AUTO ATKだけONなら、解禁後の次の1秒境界から実行する。解禁の境界処理が必要な範囲は固定5件。初回の参考手動購入モデルは本体AUTOと別物。

ユーザー購入時はその瞬間までadvanceしてからbuyを処理。phaseは0〜1の周回比率なので能力変更時も維持し、新ClearTimeの残り `(1−phase)×T` を使う。これは能力購入で現在周も速くなる仕様であり、開始時能力のスナップショットをSaveしない。

Prestigeはadvance→必要StageのCLEAR条件再確認→部分BURSTを終了→SOUL付与/回数加算/Reset→保存。経過秒数は条件に含めない。1回のCommand内で完結し、連打による二重付与を拒否する。回数加算によりLOOP MASTERYと上限マイルストーンを導出し、UIへ1件の報酬サマリーを返す。UIは古い価格や可能判定を送らず、強化IDと操作だけ送る。

## 4. 一定Stageの一括計算

```text
rate = 1 / ClearTime                     # Decimal
work = phase + elapsed × rate
completed = floor(work)
phase = work − completed
Gold += completed × goldPerClear(currentStage)
cycleClears += completed
totalClears += completed
```

completed分のfor/while、敵・装備・ドロップ配列、乱数抽選はしない。毎秒AUTO ATKの購入も幾何級数のMAX価格式で一括。BURSTの5秒集計は最大5つのAUTO区間と1つの端区間＋少数の手動購入境界を処理する。購入で変わった条件を5秒窓全体へ遡って適用しない。

目標での初CLEARまでrouteClearsを増やし、それ以降の稼ぎ周では固定する。総CLEAR/Goldは増やし続ける。deepen後は固定された経路進行から再開し、稼ぎ周数を攻略済みの深度に変換しない。

deepenの共通判定は `prestigeCount >= 3 && highestClearedStage >= targetStage`。UIは条件未達で無効化し、command側も未達の要求をno-opにする。現在の目標を+25した後は、次の目標の実CLEARまで再深化できない。

Best BURSTは完全な5秒窓だけ。Total Goldは支出前の獲得量、Fastest Clearは実際にCLEARした時の能力/Stageの理論時間の最小値（Stageも保存）、最高Stageは実際にCLEARしたStage。数値表示の都合でアニメーションを省略しても報酬は同一。

## 5. Stageが変わる区間の一括積分

単に「5秒開始時のStageで全部計算」するとStage進行と報酬が不整合になる。初期から以下を採用する。capStageは現在目標（Required Stageまたは任意深化）、capに達した残時間は一定Stage式。HP境界101/701/1001とStage Gold境界の和集合で最大4ブロックへ分ける（既定Gold境界101）。

境界 `b(s)=5(s−1)`。整数routeClears nのStageは `min(capStage, 1+floor(n/5))`。Stage sに属するCLEAR数は `q(s)=b(s+1)−b(s)`、周期1の `[5]`。capStageは残CLEAR全て同Stageとなる。現在の未完了周を処理した後、整数周境界から計算する。

未完了周の残時間よりelapsedが短ければphaseだけを進めて終了する。巨大総CLEARをStage算出のためnumberへ変換しない。経路カウンターは目標までの必要周だけを積分し、capでの大量周回はDecimalのまま集計する。

一定能力・同HPブロックの `T(s)=A × h^(s−offset)+B`。Stage<=100はh=1.002/offset=1、Stage101–700はh=1.02204、Stage701–1000はh=1.00701、Stage1001以降はh=1.003002で、offsetは各ブロック先頭。Aにはブロック先頭HP×LOOP MASTERY/(DPS×OverkillFactor)を使う。B=LOOP MASTERY×FixedDelay。Stage i…jの全周に必要な時間は:

```text
time(i..j) = A × sum(q(s) × h^(s−offset)) + B × sum(q(s))
sum(q(s)) = b(j+1) − b(i)
```

qは1周期なので、HP和を各ブロック最大1本の幾何級数に分ける。各剰余群の先頭s0、項数mについて `q(s0) × h^(s0−offset) × ((h^1)^m−1)/(h^1−1)`。途中の最初/最後Stageは残周数だけ計上する。h≈1はexpm1/log1pで安定化、h=1は項数の積。境界に一律epsilonを足すのでなく、数値誤差規則を共通化する。

Goldも周回を列挙しない。G0=10×WEALTH、Stage<=100は倍率 `a+b×s`（a=.9995、b=.0005）、Stage>=101はa=1.05/b=0。各ブロックのGold和は `G0×[a×sum(q(s))+b×sum(q(s)×s)]`。周期の各群は `sum(q×s)=q(s0)×m×[2s0+(m−1)]/2` の等差数列で一括。終端の部分Stageとcapでの稼ぎは実際の周数×そのStage倍率で足す。Stage報酬の追加でも周回数比例処理を導入しない。

elapsed以内に完了する最後のStageを単調二分探索（Stage450なら最大9比較、保護上限1e9でも最大30比較）し、最後のStageの追加最大5周はfloor、残時間をphaseに戻す。到達capでは残り数百万〜1e12周も一定式1回。highestClearedStageは最後に完了した周のStageを用い、Stageに入っただけでは更新しない。

初期実装では端Stageと完了周の境界を一つの探索にまとめ、必要な経路CLEAR境界を二分探索する。上限は約5×targetStageなので最大33比較（Stage450は最大12比較）。計算量は同じ対数で、目標到達後の大量CLEARには探索しない。HPの深層境界とGold上限を別々に変更できるよう、その境界の和集合で区間分割する。既定値は4ブロック、Goldに別の境界を設定した場合は最大5ブロックとなる。

これにより1区間の計算量は `O(4×1 log capStage)`、周回数に依存しない。Stage目標が増えても境界周期と式を保てば対数。新Stage特性を追加するなら特性が一定の区間に分け、区間数を小さく保つ。敵ごとの条件分岐を後から各周へ持ち込まない。

開発時に少数周だけの逐次参照実装をテスト内に置き、Stage跨ぎ一括式と比較する。製品には参照ループを使わない。高周回時にStageを固定するため計算結果を近似する必要はない。

## 6. 数値精度と上限

Gold、HP、Damage、DPS、ClearTime、rate、SOUL、CLEAR集計はDecimal。時間入力/AUTO時計/BURST時計/phaseはnumber。巨大ClearTimeをnumberへ変換して0やInfinityになってから計算しない。Timeが極端に小さい場合もrateをDecimalで掛ける。

小さなCLEAR（<=2^53−1）は整数として扱い、phaseを保存する。floor近傍の丸め誤差は共通補助関数で吸収し、許容誤差は `4×Number.EPSILON×max(1,work)` を上限にする。1e12周の区間でGold/CLEAR相対誤差1e−12以内、完了数の誤差最大1周を許容する。既知のぴったり128/1e6/1e12周の入力は正しい整数結果になるよう境界テストする。細かい時間分割で毎回独自epsilonを加えない。

初期実装では時間区間の小ささだけを理由に進行を捨てない。AUTO/BURSTの時計境界だけ `8×Number.EPSILON×窓秒数` の丸め範囲で閉じる。1e−11秒でも高速周回ではCLEARが発生するため、絶対値1e−10秒等の打ち切りは使わない。周回整数の丸めは上記共通規則に従う。

work>2^53−1では1周単位のfloor/余りが表現できないため、指数表記の近似集計へ移行する。`approximateClears=true`を保存し、区間の完了量はDecimalの近似整数、phase=0とする。この段階では1周分より表現誤差が大きく、表示にも「約」を付ける。相対誤差目標1e−12、厳密な1周単位の統計・報酬保証はしない。通常速度へ戻った新Cycleではphaseを通常扱いへ戻せるが、生涯統計の近似フラグは保持する。

小さな追加値が巨大Goldへ吸収されるのは巨大数表示上の仕様。SOUL・Lvの購入判定は必要価格で確認し、減算で僅かな負数が出た時だけ相対許容範囲内で0へ補正。誤差を利用した無限購入を避け、対数で求めた購入nを合計式と照合し前後補正は最大数回。補正が収束しなければ購入を失敗させ診断する。

SaveではDecimalを正規化した科学表記文字列にする（例 `"1.25e42"`）。Infinity/NaN/負の通貨/ゼロ以下時間は拒否。指数絶対値1,000,000,000を初期の運用保護限界にし、超えた時は最後の有効Stateを保持して進行を停止、Exportを可能にする。これは1e12や1e42を十分超える有限の限界で、無制限対応を約束しない。

表示: 1000未満は最大2小数、1e3〜1e12未満はK/M/B、以後は有効3桁の科学表記。極小ClearTimeも科学表記で「0.00秒」にしない。Gold画面は丸め表示でも購入可否は内部値で決まる。巨大数文字列を直接JS numberへ戻さない。

## 7. Save schema v1

localStorageにJSONを保存。現在・前回正常Saveの2スロット、合計10KB以内を初期予算にする。単独payload目標2〜4KB、1万Cycle後も5KB以下。巨大値は桁数分の十進文字列ではなく科学表記なのでサイズは増えない。圧縮/DB/戦闘履歴は不要。

次は新規開始の完全な形の例（UI設定の初期値も含む）:

```json
{
  "saveVersion": 1,
  "balanceVersion": "speed-6",
  "savedAt": "2026-10-03T00:00:00.000Z",
  "run": {
    "stage": 1, "targetStage": 100,
    "gold": "0", "clears": "0", "routeClears": 0, "phase": 0,
    "activeSeconds": 0, "highestClearedStage": 0,
    "upgrades": {"atk": 0, "speed": 0, "crit": 0, "overkill": 0, "delay": 0},
    "approximateClears": false,
    "autoClock": 0,
    "burst": {"active": false, "seconds": 0, "clears": "0", "gold": "0"}
  },
  "meta": {
    "prestigeCount": 0, "deepMasteryLevel": 0, "soul": "0",
    "upgrades": {"power": 0, "wealth": 0, "tempo": 0},
    "unlocks": {"speed": false, "crit": false, "overkill": false, "delay": false, "autoAtk": false, "burst": false}
  },
  "automation": {"atkEnabled": false, "autoAdvanceEnabled": false, "reserveGold": "0"},
  "stats": {
    "totalClears": "0", "totalGoldEarned": "0",
    "fastestClear": null, "fastestClearStage": null,
    "highestStage": 0, "bestBurstClears": "0",
    "activeSeconds": 0, "approximateClears": false
  },
  "settings": {"sound": false, "reducedMotion": false}
}
```

phase/時計/部分BURSTを保持してLoadで端数を失わない。savedAtは報酬計算に使わない。BURST途中で中断したら5秒の表示中時間の続きから再開する。PRESTIGE Reset時はrun全体を新規値にし、targetStageは新しい回数から計算する。statsと設定は残す。

保存は5秒ごと、購入/Prestige/Import/visibilitychange時。ストレージ失敗でもプレイを継続し「保存失敗、Exportしてください」を表示する。書込前にencode/decode検証、前回正常payloadをbackupへ、今回をcurrentへ書く。localStorageの1キー置換を単位にする。中断で片方だけ更新しても正常スロットを復旧できる。

Loadはcurrent検証→失敗ならbackup→両方失敗なら新規開始の選択を提示。壊れたデータを自動で上書きしない。Importは最大32KB、JSON/schema/範囲/migrationを検証、プレビュー後に置換、現在Saveをバックアップする。ExportはJSONファイル。署名・暗号化・改ざん防止は不要。プレイヤーが自己編集できるゲーム。

初期リリースは単一タブ利用を前提とし、Web Locks、localStorage lease、revision競合復旧は必須要件から外す。設定/ヘルプに「複数タブで同時にプレイしないでください」を1行表示する程度とする。並行タブでは最後の保存が優先され、current/backupも排他制御ではない。安全な自動マージを保証しない。visibilitychangeの進行停止は維持する。

将来対応としてWeb Locksによる単一writerを優先検討し、未対応環境のleaseやrevision競合検出は必要性を確認して別途設計する。初期のruntime/Saveスキーマ/受入テストへ予防的な複数タブ基盤を入れない。

## 8. Version / Migration

Issue #13の同一Balance拡張: automation.autoAdvanceEnabledをbooleanで保存。欠損時false、型不正は拒否。当時はsaveVersion1 / balanceVersion speed-4。現在はspeed-6のみ受理し、同一Balanceの欠損false補完は継続。旧Balance拒否は変更しない。Prestigeはautomation全体を保持する。集約進行は計算用の最終+25上限を使い、実際の最高CLEAR StageからTargetをO(1)で導出する。BURST退出探索も同じ上限を使う。CLEAR/Target比例loopやUI通知を追加しない。[AUTO_ADVANCE](AUTO_ADVANCE.md)に式・計算量・保護上限・テスト方針を記録。

saveVersionは構造変更、balanceVersionは式や価格変更。**正式リリースまではBalance間のSave互換性を保証しない。** schema v1を維持し、balanceVersion speed-6へ更新し、異なるBalanceはdecode/Importで明示的に拒否する。prototype-2 / speed-3の経路変換を削除し、旧版の暗黙読替えをしない。将来のschema migration registryは残し、登録された純粋関数を順に適用して最後に全体検証する。今は架空のv0 migrationを実装しない。Migrationにclockやネットワークを使わない。

将来のschema変更では追加フィールドのdefault、削除、ID mappingを個別に設計する。装備個体や履歴へ変換しない。現行BalanceのStageはrun.routeClears/targetから再計算し、保存stageとの差があれば表示用stageを修復する。経路進行は0〜b(target)+1かつ総CLEAR以下を検証する。Balance間の変換や補償を汎用registryへ詰め込まない。

不一致Balanceや未来schemaは読取/Importを拒否し元文字列をExport可能にする。current→backupの順に現行版を検証し、両方不可ならfatal/pausedで進行と自動保存を停止する。「開発版の仕様変更により旧Saveは利用できません。新規開始してください。」を表示する。不明versionを自動で新規Saveへ上書きしない。設定の二段階確認付き新規開始だけが置換を行う。現行版のroundtrip、backup復旧、Import拒否時の無変更、旧版拒否/原文保持/手動新規開始をテストする。prototype-2 / speed-3互換fixtureは廃止。

## 9. 自動テストと受入条件

| 対象 | 必須検証 |
|---|---|
| Damage/DPS | 初期60/60、ATK Lv1=69.6、POWER1=102、Speed1×1.25、Crit1×1.2、Crit上限 |
| 価格/MAX | ATK最初35/39.2、合計と逐次和、予算ぴったり/不足、上限、巨大Lvでも回数非依存 |
| Overkill | Lv0=1、Lv1=1.15、再利用率、固定Delayに影響なし、期待値と表示式一致 |
| ClearTime | 初期5、TEMPOが戦闘に適用されない、LOOP MASTERY全体適用/初期累積倍率置換/3回目以降12%短縮、設定変更時の派生値更新 |
| Stage / Gold | 0→1、5→2、495→100入場/496→100CLEAR、Stage100/101のHP・Gold境界、目標で経路停止、深化に稼ぎCLEARを流用しない、時間/Gold積分と少数参照比較 |
| SOUL | 100で4、2回目のみ8、150で7、未CLEAR Stage除外、条件未達0発行 |
| Prestige / Reset | 必要Stage条件だけで即実行（299秒未満も可）、目標100/150/200上昇、Gold/Lv/routeClears/phase/Cycle時間初期化、上限・MASTERY導出、解禁/設定/統計/恒久Lv保持、二重コマンド拒否 |
| AUTO | OFF時不購入、ONの1秒境界、予約Gold、区間途中unlock、購入前後で収入再計算 |
| BURST | T=5/128/1e6/1e12ケース、端数繰越、途中購入、Stage跨ぎ、切替で二重報酬なし、部分窓はBest除外 |
| 数値 | 1e42 Save往復、極小時間、2^53境界、NaN/負数拒否、相対誤差、巨大数formatter |
| Save | 完全往復、partial BURST、破損backup復旧、書込失敗、未来version拒否、migration、サイズ上限 |
| 中断 | hidden/復帰/Reloadでオフライン報酬なし、長delta5秒上限。複数タブ排他は初期受入対象外 |

一定能力/Stageでは5秒一括と0.1秒×50分割のGold/CLEAR/phaseを比較。Stage跨ぎでも一括と逐次参照が許容誤差内で一致すること。AUTO付きは同じ1秒境界を含む分割同士で比較する（異なる購入機会は同じ結果を要求しない）。

シナリオテストに参考購入ポリシーと実際のSOUL購入/繰越を入れ、新規5秒、Active Farm初Prestige300〜360秒/初BURST780〜1020秒、CasualはFarmより遅い、AUTO Only1200〜1500秒、Immediate Prestige1200〜1500秒で初BURSTを検証する。4モデルの12CycleとImmediate20Cycleで必要Stage/SOUL/恒久Lv/時間/開始終了Clear Time、深部逆成長も記録する。最低時間を待たず条件達成でPrestigeできること。シミュレーションの全フレーム完全一致は要求せず、式単体は厳密値、体験時間は許容帯で確認する。

性能テストはelapsed5秒を固定して128/1e6/1e12CLEARの設定を比較。演算/イベント件数が周回数に依存しないことを計測し、一定Stageは区間あたり定数、Stage跨ぎは最大33比較×2ブロック×5系列、AUTO区間最大6に収まること。Stage Goldを含めて検証する。ベンチマークの絶対時間はCI機種依存なので合否を倍率/件数中心にし、実機スマホで5秒精算10ms以内・Save書込で目立つ停止なしを目標にする。

ブラウザ受入は360×800/320px/PC、購入・シート・Save復帰・Import・背景停止。最小限のChromium E2Eに加え、モバイルSafariは実機でvisibility/localStorage/片手到達範囲を確認する。画面からDebug時間加速を使わず、純粋エンジンへテスト時計を注入する。

## 10. 次の実装フェーズ

1. この設計の追加案をレビューし、balance.tsと型、number/mathの純粋関数から作る。
2. Stage時間/Gold積分・BURST・MAX・Prestigeをテストで固め、参考12Cycleを本体計算で再現する。
3. Save v1/検証/バックアップ/Export/Importとruntimeの表示中時間を実装する。
4. モバイルの単一画面とシート、解禁説明、AUTOを接続する。
5. 型検査、単体/統合/E2E、巨大数性能、実機の初回30分/新上限解放/初BURSTを検証する。
6. 仕様差を設計書へ反映してレビュー可能なPRを作る。配信は実装依頼の範囲を確認して行う。

完了条件は「見た目が動く」だけでなく、通常/BURST共通計算、全Save項目、背景停止、参考時間帯、周回数非依存、設定集中、テスト成立。後半未定の装備や新Prestige系を実装判断で付け足さない。

## Issue #9の現在値と互換性

formatTimeはBigのままs/ms/μs/ns/ps表示。presentation LODは独立設定、React commit既存10Hz・固定DOM・attackごとの通信なし。Issue #9の過去比較は[SPEED_REWORK](SPEED_REWORK.md)。

## Issue #11補足

固定待ちはBigの指数2項を分母へ合算する .85^TEMPO / (.94^(-ATK)+.60^(-Route)−1)。全Lv0で1秒。MASTERYもBigの.88^max(0,p−2)を初期倍率へ乗算し、Numberアンダーフローを避ける。全時間積分へ同じ倍率を適用するためStage積分/二分探索/batchの構造変更は不要。Saveは現行Balanceのみ受理し、変換はしない。Quick Buyの候補は従来優先順・固定最大4件の探索。攻撃/CLEAR単位のUI処理は追加しない。[BURST_15_DESIGN](BURST_15_DESIGN.md)を参照。

Issue #15（過去記録）: balanceVersion speed-5、schema Version1。speed-4 migrationなし。hp/stageSumsのみ3区間の有限式へ変更し、AUTO ADVANCE・binary search・BURSTは無変更。[DEEP_HP_DESIGN](DEEP_HP_DESIGN.md)。

Issue #17: meta.deepMasteryLevelはspeed-6の必須整数フィールド（初期0）。saveVersion1を維持し、speed-5 migrationは追加しない。旧Balanceは検証入口で明示拒否し原文Exportを維持する。Prestige確定で最高milestoneをmax更新し、同一transactionでSOUL/回数/Resetを反映する。Required Stage・Deep Lv・MASTERYはO(1)式（Bigの有限回演算）で導出しmilestone履歴を保存しない。rangeTotals・stageSums・経路二分探索・AUTO ADVANCE集約は無変更、CLEAR数にもmilestone数にも比例しない。[検証・off-by-one](PRESTIGE_CAP_DESIGN.md)。
