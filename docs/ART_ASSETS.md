# LOOP BREAKER Art Assets

Issue #5 / 2026-10-04。内蔵image_genで、Hero・ロゴ・Enemy 5種・Boss 5種・背景5帯の計17枚を新規生成した。外部サイト・ストック・既存ゲーム画像を取得していない。既存作品・キャラクター・ロゴの参照画像を使っていない。共通方針は [VISUAL_DESIGN.md](VISUAL_DESIGN.md)、実際の最終プロンプト一式は [art/prompts.json](art/prompts.json)。

全素材は「ネイビーの大きな面・淡い石材の縁・破断した輪」で揃える。Heroは白布とシアン、敵は琥珀/珊瑚、後半は紫の亀裂を追加する。背景には文字・敵・UIを生成しない。ロゴ以外の説明・数値はHTMLテキストで維持する。

## 最終アセット

合計 **733,396 bytes / 716.21 KiB / 0.699 MiB**。ゲーム用画像のみの総量で、レビュー用スクリーンショットは含まない。全17枚がWebP、透過対象12枚のalphaを維持している。

| ファイル（public/assets配下） | 用途・生成種別 | サイズ | Alpha | bytes |
|---|---|---|---|---:|
| [characters/hero.webp](../public/assets/characters/hero.webp) | Hero / 全Stage | 256×256 | 透過 | 16,964 |
| [branding/loop-breaker-logo.webp](../public/assets/branding/loop-breaker-logo.webp) | タイトルロゴ | 720×180 | 透過 | 34,854 |
| [enemies/enemy-zone-01.webp](../public/assets/enemies/enemy-zone-01.webp) | 通常Enemy / 浮遊結晶 | 256×256 | 透過 | 14,976 |
| [enemies/enemy-zone-02.webp](../public/assets/enemies/enemy-zone-02.webp) | 通常Enemy / 装甲甲虫 | 256×256 | 透過 | 17,516 |
| [enemies/enemy-zone-03.webp](../public/assets/enemies/enemy-zone-03.webp) | 通常Enemy / 石の精霊 | 256×256 | 透過 | 23,396 |
| [enemies/enemy-zone-04.webp](../public/assets/enemies/enemy-zone-04.webp) | 通常Enemy / 断片化した影獣 | 256×256 | 透過 | 25,876 |
| [enemies/enemy-zone-05.webp](../public/assets/enemies/enemy-zone-05.webp) | 通常Enemy / 崩壊する多面体 | 256×256 | 透過 | 24,634 |
| [bosses/boss-zone-01.webp](../public/assets/bosses/boss-zone-01.webp) | Boss / 結晶門番 | 320×320 | 透過 | 36,832 |
| [bosses/boss-zone-02.webp](../public/assets/bosses/boss-zone-02.webp) | Boss / 環状装甲巨人 | 320×320 | 透過 | 41,480 |
| [bosses/boss-zone-03.webp](../public/assets/bosses/boss-zone-03.webp) | Boss / 浮遊石像 | 320×320 | 透過 | 46,150 |
| [bosses/boss-zone-04.webp](../public/assets/bosses/boss-zone-04.webp) | Boss / 裂けた翼の守護者 | 320×320 | 透過 | 51,344 |
| [bosses/boss-zone-05.webp](../public/assets/bosses/boss-zone-05.webp) | Boss / 破断した輪の王 | 320×320 | 透過 | 47,454 |
| [backgrounds/background-zone-01.webp](../public/assets/backgrounds/background-zone-01.webp) | Stage背景 / 静かなデジタル遺跡 | 960×540 | 非透過 | 58,730 |
| [backgrounds/background-zone-02.webp](../public/assets/backgrounds/background-zone-02.webp) | Stage背景 / 光の門の回廊 | 960×540 | 非透過 | 69,270 |
| [backgrounds/background-zone-03.webp](../public/assets/backgrounds/background-zone-03.webp) | Stage背景 / 浮遊する石の庭 | 960×540 | 非透過 | 75,884 |
| [backgrounds/background-zone-04.webp](../public/assets/backgrounds/background-zone-04.webp) | Stage背景 / 時間の亀裂 | 960×540 | 非透過 | 77,994 |
| [backgrounds/background-zone-05.webp](../public/assets/backgrounds/background-zone-05.webp) | Stage背景 / 崩壊するループ | 960×540 | 非透過 | 70,042 |

## Stageとの対応

`src/config/visual.ts` に最小Stageと背景・Enemy・Bossの対応を集中管理する。ゲーム計算からvisualへの依存はない。ZoneはSaveに保存せず、表示中Stageだけから選択する。

| Zone | Stage | 使用ファイルの接尾辞 |
|---|---|---|
| 01 | 1–99 | zone-01 |
| 02 | 100–199 | zone-02 |
| 03 | 200–349 | zone-03 |
| 04 | 350–549 | zone-04 |
| 05 | 550以降 | zone-05 |

RUN内の4体は同じEnemy画像を使い、既存phaseによるBoss切替を保つ。Heroは常に同じ画像。BURSTは背景と固定CSSリング/圧縮線を使い、専用大画像や大量particleを追加しない。

## 最適化と再生成

生成元PNGはCodexのgenerated_images配下に保持し、コミットしない。Pillow 12.3.0を一時的なツール環境へ導入して `scripts/optimize_assets.py` で処理した。Pillowはゲーム・CI実行には不要。再実行する場合のみ `python -m pip install Pillow` でツール環境へ導入する。

```sh
python scripts/optimize_assets.py source-manifest.json
```

入力はキーhero/logo/enemy01…05/boss01…05/background01…05と生成PNGのパスを対応させたJSON。出力はこの表のpublic/assets配下に限定する。ソースは変更しない。透過はalphaの被写体範囲を切り出し、縦横比を保って6%余白でcontain。ロゴだけは不可視に近いalpha画素を範囲判定から除外し、文字が小さくなりすぎるのを防ぐ。背景は960×540へfit。透過画像はquality86、背景はquality80、method6でWebP化し、metadataはコピーしない。

元のalphaは再合成時も維持し、擬似的な黒背景除去や色置換は行っていない。再生成は内蔵image_genを使い、共通スタイルのpromptと各素材のsubjectを維持して行う。生成モデル固有の名称や固定seedは出力されておらず、同じpromptで完全同一の画像が戻る保証はない。

## UIとアクセシビリティ

- AssetImageは寸法を固定し、読込失敗時だけ同じ枠に図形/文字fallbackを表示する。普段は生成画像を使用する。
- ロゴは装飾画像＋アクセシブルな見出し。Hero/Enemy/Bossも装飾画像で、役割・HP・数値のテキストを維持する。
- 戦闘画像領域は144px固定。画像追加前の162pxより縮め、320pxのAUTO表示時もCLEAR・DPS・Clear Timeが購入欄に隠れないことをテストする。
- BURSTは固定リング、擬似要素、圧縮線、集計カード。3e15級CLEARでもDOM件数は変わらない。
- Prestigeは紫/金のSOUL面とMASTERYカード。BREAK I/IIの実獲得コマンドだけ5秒の通知を出し、Load/Importで再生しない。通知はシート内へ即時スクロールして可視化し、閉じる操作も可能。
- OSのprefers-reduced-motionまたは既存設定が有効なら、画像浮遊・光刃・リング・圧縮線・獲得通知のアニメーションとtransitionを止める。数値・進捗・静的な状態表示は維持する。

## 検証・残課題

既存40件を維持し、Zone境界10ケースと17枚のWebP/alpha/寸法/容量検証を追加して単体・統合51件。既存E2E18件に4シナリオ×320/360/PCを追加して30件。全Zoneの画像デコード・404なし、Boss、固定Arena、購入48px、重要数値の非遮蔽、BURST固定DOM、巨大表示、二種類のReduced Motion、MASTERY/期限/Import非再生、失敗fallback、横スクロールなし、pageerrorなしを確認する。

lint・typecheck・単体/統合51件・E2E30件・production buildはすべて成功。buildのbaseは /loop-breaker/。レビュー画像は [review/ISSUE_5_VISUAL_REVIEW.md](review/ISSUE_5_VISUAL_REVIEW.md)。ゲーム計算・balance設定・Save・runtime・既存テストは変更していない。iOS Safari実機の画面ロック/スクロール/描画負荷は未確認で、ブラウザ自動検証はChromium。公開・deploy・新機能・バランス調整はこのIssueに含めない。
