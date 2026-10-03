# 初期実装・検証記録（Issue #3）

2026-10-03。仕様の正本はGAME_DESIGN / BALANCE_DESIGN / TECHNICAL_DESIGN。バランス値、SOUL指数1.5、Prestigeの条件、解禁、Save v1は変更していない。画像素材・配信・追加ゲームシステムはこの実装に含めない。

## 構成

- `src/config/`: prototype-2の数値と表示・保存間隔。起動時に負数・非有限値・価格成長率・Crit上限等を検証する。
- `src/game/`: ReactやブラウザAPIに依存しない状態、巨大数ラッパー、数式、一括進行、購入/Prestigeコマンド、Save検証/Migration。
- `src/platform/`: localStorage current/backup、注入可能な時計、visibilityの停止、保存失敗通知。
- `src/ui/`: 単一ゲーム画面、固定下部購入欄、全強化/Prestige/Stats/設定のdialog。敵はCSS図形で、素材へ置換できる。
- `tests/`: Vitestの式・進行・Save・runtime・12Cycleシナリオと、Playwrightの実ブラウザ操作。製品内のデバッグ時計や加速ボタンは追加していない。
- `.github/workflows/ci.yml`: Node 24、npm ci、lint、型検査、単体テスト、build、Chromium E2E。失敗時はブラウザ証跡を保存する。

React 19 / TypeScript 7 / Vite 8 / Vitest 5 / Playwright 1.63 / break_infinity.js 2.2 / Biome 2.5をlockfileへ固定した。ReactはUI、runtimeは時間と副作用、gameは純粋計算を担当する。

## 設計からの実装上の補足

| 問題 | 対応 | 理由 |
|---|---|---|
| Stage単位の探索では端Stageの残周を別処理する必要がある | 経路CLEAR境界を二分探索し、時間/Goldの周期和を評価する。最大32比較 | 未CLEAR Stageを攻略扱いしない境界を一箇所にまとめる。計算量は対数のままで、大量の稼ぎ周は定数処理 |
| HPとGoldの境界が一致する前提だと、設定を片方だけ変更した際にGold和が不正になる | 境界の和集合で最大3ブロックに分ける。既定値は2ブロック | 設定集中管理の意図を保ち、独立したバランス調整を可能にする |
| 非常に小さい残時間を固定epsilonで捨てると、高速時に数CLEARを失う | 微小区間も進め、時計の整数境界だけ機械精度で丸める | 5秒で1e12周以上でも時間・周回端数を保持する |
| ブラウザの表示更新と描画フレームを二重管理すると初期実装が複雑になる | 100ms intervalで単調時計の実deltaを読む。図形の動きはCSS | 10Hzの表示要件を満たし、固定フレーム秒による進行を避ける |

これらは計算手順・境界・表示実装の具体化であり、成長曲線やゲーム機能の変更はない。Saveはschema v1、balanceVersion prototype-2。将来版への純粋Migration登録口を用意し、存在しないv0への変換は追加しない。

## ローカル検証

Windows / Node 24.21.0でlint、型検査、Vitest 40件、Chromium E2E 18件、production buildが成功した。E2Eは320×800、360×800、1280×900の3構成で同じ6シナリオを実行する。

確認内容は自動戦闘、購入、全強化シート、Prestige二段階確認、永久強化、MASTERY、AUTO設定保持、BURST集計/Reload/通常復帰、Save Export/Import、破損入力、背景停止・再開。未処理のpageerrorがないこと、横スクロールがないこと、主要購入ボタンが48px以上であることも検証する。スクリーンショットで320pxの通常/BURSTを確認した。

buildはGitHub Pages用base `/loop-breaker/` で成立。JS約272KB（gzip約84KB）、CSS約8.5KB（gzip約2.6KB）。外部画像・フォントへのネットワーク依存はない。

### PR #4レビュー修正

- 問題: Prestige 3回以降、目標未攻略でもdeepenを繰り返し実行できた。対応: `canDeepen`を共通判定とし、現在のtargetStageの実CLEARを必須にした。UIは未達成時disabled、commandはno-op。理由: 深化を目標攻略後の選択に限定し、一段ごとの挑戦を保つ。目標で稼いだ通常CLEARは経路進行へ転用しない。
- 問題: 2Cycle目の開始直後などにも、2回目ボーナス込みの未確定SOULを「今回」と表示していた。対応: Prestige未達成時は必要StageのCLEAR条件のみ表示し、達成後だけ「今回 +N SOUL」とする。理由: 確定報酬との混同を避ける。SOUL式と2回目+4は変更していない。
- 追加検証: Prestige 0/1/2回、3回以上の目標未入場/入場済み未CLEAR、目標CLEAR後+25、連続deepen拒否、次の目標CLEAR後の再深化、稼ぎCLEARを流用しない進行。UIでは2Cycle開始直後とStage100入場時に報酬を表示せず、CLEAR後に8 SOULを表示すること、深化ボタンが各目標のCLEARでのみ再有効化することを確認した。
- 修正後も12Cycleの参考所要時間、25分時点4.8834秒/周、初BURST 3Cycle目は同じ。Save構造・balanceVersionに変更はない。

### バランスの再現

本体の `advance` と `command` を使用し、1秒ごとにSpeed→Crit→Overkill→Compression→ATKの順で上限/予算まで購入、Prestige後はLvが最小のPOWER→WEALTH→TEMPOを実価格で購入する。AUTOはこの参考購入モデルの代わりにしない。設計用Pythonとのフレーム粒度差は最大約1秒。

| Cycle | 本体の秒数 | 時間 | 設計用参照の秒数 |
|---|---:|---:|---:|
| 1 | 1824 | 30:24 | 1823.23 |
| 2 | 556 | 9:16 | 555.77 |
| 3 | 277 | 4:37 | 276.27 |
| 4 | 245 | 4:05 | 244.62 |
| 5 | 311 | 5:11 | 310.72 |
| 6 | 208 | 3:28 | 207.21 |
| 7 | 224 | 3:44 | 223.53 |
| 8 | 177 | 2:57 | 176.11 |
| 9 | 202 | 3:22 | 201.81 |
| 10 | 205 | 3:25 | 204.41 |
| 11 | 322 | 5:22 | 321.02 |
| 12 | 466 | 7:46 | 465.84 |

初期Clear Timeは30秒、25分時点は4.8834437秒/周、初BURSTは3Cycle目。各PrestigeでSOUL付与と実購入/繰越を検証する。操作の遅れや配分の違いで実プレイ時間は変わる。最低Prestige時間を設けず、後半は必要StageとHP曲線で自然に所要時間が増える。

### 巨大数・性能・Save

128、1e6、1e12 CLEAR/5秒の一定Stageケースは全て5区間・Stage探索0回。同じモデルで端数、購入、Stage境界、ヒステリシスを検証する。毎周ループや毎周DOMはない。

実際の成長式でもPrestige 59回、目標Stage2950、ATK1000、POWER/WEALTH150、TEMPO120、Speed/Crit/Overkill8、Compression30から5秒を進め、約3.0882e15 CLEARを処理した。時間区間5、探索比較13、級数グループ140。約2msだったローカル計測は参考値で、合否は処理件数で判断する。さらにTEMPO200の2^53超ケースで近似フラグとSave往復を確認した。

通常Saveサンプルは867 bytes。1万Cycle相当でも2KB未満をテストし、単独5KB制限・2スロット合計10KB予算を満たす。1e42 Gold、極小時間、partial BURSTを科学表記で保存する。NaN/Infinity/負値/指数限界超過、時計・経路・Lvの矛盾、不足キー、未来版を拒否する。current破損時はbackupを使い、両方破損なら自動上書きせずExport/新規開始の選択を残す。ストレージ書込失敗時は進行を継続してExportを案内する。

## 残る確認・レビュー論点

- iOS Safariの実機で画面ロック、localStorage、シートのスクロール、片手操作を確認する。今回のブラウザ自動確認はChromiumで、実機10ms性能目標の検証は未実施。
- 初回30分の実機プレイで強化候補の優先表示、予約Gold、Prestige画面の効果説明が理解しやすいか評価する。数値自体の変更は別レビューで判断する。
- 深層StageでBURSTから通常へ戻る流れは実装・テスト済み。Stage550以降の成長曲線は設計どおりで、新装備や追加Prestige系で独自補正していない。
- 厳密な複数タブ排他とオフライン進行は初期範囲外。現在のSaveには履歴・個体配列を追加しない。
- GitHub Pagesへの公開は別途行う。今回のPRはレビュー用で、mergeしない。
