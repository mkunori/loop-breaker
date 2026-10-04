# GitHub Pages公開手順

想定URL: **https://mkunori.github.io/loop-breaker/**。Issue #7のPR段階では本番deploy・公開Smoke Testは実行しない。

## 構成

既存 `.github/workflows/ci.yml` に組み込む。PR / main pushともNode 24、npm ci、lint、typecheck、unit/integration、production build、Playwrightを実行し、成功した同じ `dist/` を公式 `actions/upload-pages-artifact@v5` でartifact化する。再buildはしない。PRでのartifact uploadは配信を行わない。

deploy jobは `needs: verify` と `github.event_name == 'push' && github.ref == 'refs/heads/main'` の両条件で実行する。公式 `actions/configure-pages@v6` / `actions/deploy-pages@v5`、`github-pages` environmentを使用し、このjobだけpages:write / id-token:writeを許可する。PRではjob全体をskipし、Pages設定取得やdeployも実行しない。手動dispatchやworkflow_runは追加しない。

CIはref別に新しい実行を優先し、deploy jobはgithub-pagesグループで直列化する。成功した最新mainの検証済みartifactを配信する。公式の[Pages workflow要件](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)に従う。

## Repository設定

2026-10-04にAPIで確認済み: Pages `build_type: workflow`（Source: GitHub Actions）、公開URLは想定どおり、HTTPS有効、custom domainなし。`github-pages` environmentはmainのみ許可。設定変更・ユーザーの追加操作は現時点で不要。

設定を復旧する場合はGitHub UIの **Settings → Pages → Build and deployment → Source → GitHub Actions**。**Settings → Environments → github-pages** のdeployment branchesにmainを許可する。権限や保護規則が後から変わった場合はdeploy jobのログとこの画面を確認する。

## Base path・metadata・Save

Vite baseは既存の `/loop-breaker/` を維持。JS/CSSはVite、画像は既存visual設定、faviconはHTMLの `%BASE_URL%` から参照する。faviconは既存の透過Hero WebPを再利用し、画像容量を増やさない。title / 日本語description / viewport-fit / theme-colorを維持・整備し、PWA/Service Workerは追加しない。

Save schema / version / migration / current + backup / Export / Importは無変更。localStorageはorigin単位（path単位ではない）。localhostのSaveはgithub.ioへ自動移行しないため、移行したいプレイヤーはExport / Importを使う。Pages上の同じoriginでreload後も保持する。オフライン進行はない。

`.gitattributes` はテキストをLF、WebPをbinaryとして扱う。Windows checkoutでCRLF化されたファイルをBiomeが拒否したため、開発環境の改行を統一した。ゲームコードの内容は変更しない。

## 公開前検証

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

既存全テストを維持し、390pxプロジェクトとPages用Smoke Testを追加。320 / 360 / 390 / PCでproduction previewを使用する。全17画像、JS、CSS、faviconのHTTP成功とbase path、metadata、画像デコード、自動戦闘、Gold、購入、Export、reload Save、Settings/Stats、横スクロール、console/pageerrorを検証する。既存テストでImport・Prestige後Save・BURST reload・Reduced Motion・巨大CLEARを検証する。

## merge後の手順と公開Smoke Test

1. 別途merge指示を受けてPRをmergeする。
2. main pushのCI verifyとdeployの完了を確認する。失敗したら公開成功と報告せず、原因を確認する。
3. Pages配信反映後、下記Smoke Testを実行し、結果とdeployment SHAを報告する。これは今回のPR段階では実行しない。

```sh
PAGES_SMOKE_URL=https://mkunori.github.io/loop-breaker/ npm run test:e2e -- tests/e2e/pages-smoke.spec.ts
```

PowerShell:

```powershell
$env:PAGES_SMOKE_URL = 'https://mkunori.github.io/loop-breaker/'
npm.cmd run test:e2e -- tests/e2e/pages-smoke.spec.ts
Remove-Item Env:PAGES_SMOKE_URL
```

公開URL指定時はローカルpreview serverを起動しない。各テストは新しい独立browser contextで一時Saveを作るため、人間のブラウザの本番Saveを読み書きしない。新規開始やfixture Importで既存Saveを破壊する操作は行わない。実際の公開ではfake clockの93秒進行はゲーム待ち時間を検証するためにだけ使用する。

## 制限

PRではworkflow構文・全CI・Pages artifact作成・deploy skipまで確認できる。本番のOIDC認証・Pages配信・実URLのHTTPはmerge後に初めて確認する。iOS Safari実機のブラウザUI/safe area・画面ロック・描画負荷は未確認。自動検証はChromiumであり、実機未確認を理由に今回の準備を止めない。Pagesの配信キャッシュ反映には時間がかかる場合がある。

## 検証記録（PR準備）

単体/統合51件、E2E48件（既存33件を維持し、390pxで11件とSmoke Test×4幅を追加）。actionlintでworkflow構文を検証。production build: HTML 0.68 kB、JS 275.12 kB（gzip 85.25 kB）、CSS 12.07 kB（gzip 3.57 kB）。17画像733,396 bytesは変更なし。dist全20ファイル1,021,277 bytes。READMEのレビュー画像はdistへ含まれない。CIの確定結果はPR本文へ記録する。
