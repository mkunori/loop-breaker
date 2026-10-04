# Issue #13: AUTO ADVANCE

QoLのみ。初期5秒、全価格/強化/Unlock、Stage密度、Prestige条件、SOUL、MASTERY、HP曲線、BURST1ms/5秒window、Offlineなしの方針を変更しない。`src/config/balance.ts` と設計用Balance simulationは無変更。

## 操作と保存

AUTO ADVANCEはTarget更新だけを自動化する。既定OFF。Prestige3回以上になった時、既存の「さらに進む +25」の隣へcheckboxを表示する。未攻略でもONを予約できる。実際の更新条件はPrestige3回以上＋現在Target CLEAR済み。序盤には表示しない。

- OFF: 現在TargetでFarmし、既存の手動+25を選べる。
- ON: Target攻略後に+25。未攻略では進めず、各Stageの実CLEAR/HP/Goldを通常と同じ式で処理する。
- 攻略済みでON: 即座に+25を1回だけ実行。既存Farmの大量CLEARを次の経路へ移さない。phase/Gold/Lvも保持。
- ON中の手動DeepenはUIでdisabled、command側でもno-op。繰返しONも次Target未攻略なら何も変更しない。
- Prestigeは手動のまま。ON/OFFはReset後も保持し、新Cycleの初期Targetを攻略するまではそのTargetのまま。
- Upgrade購入はAUTO ATKの既存設定だけで行う。AUTO ADVANCEから購入・Prestigeのcommandは呼ばない。
- Target保護上限では最後に到達可能な+25 TargetでFarm。設定ONは保持するが、それ以上更新せずエラーを繰返さない。非整列の上限にも+25を超えた端数ジャンプをしない。

Quick Buy領域の構成は変えない。AUTO ADVANCEは補助操作navに置き、操作範囲を44px確保。小さなcheckboxとON/OFF文字だけで新しいシートやModalは追加しない。高速時のTarget通知も発行せず、既存HUDの `STAGE / TARGET` が最終値を表示する。Quick BuyはAUTO ATK行込み191pxを維持。

## 集約処理

Targetの停止規則以外に、CLEAR時間・Gold・Stage進行を変えないため、AUTO ON中は経路を連続したStage列として積分できる。

現在TargetをT、増分をd=25、Stage保護上限をLとする。計算用の経路上限を `C = T + floor((L−T)/d)×d` とする。`integrate`内部だけでこのTarget上限を使用し、既存 `rangeTotals` / Stage二分探索を呼ぶ。UI・SaveへCを途中公開しない。

実際の最高CLEAR StageをHとして、積分後のTargetは:

```text
H < T: T
H >= T: T + d × min(floor((H−T)/d)+1, floor((L−T)/d))
```

例: Target200で最高CLEAR249なら250、最高CLEAR250なら275。Target境界を超えた数だけ計算で増やすが、全区間の時間・Goldと `highestClearedStage` は積分で実際に支払ったCLEARから計算する。Targetを増やすだけでStage攻略や周回を無料付与しない。

各AUTO ATK/5秒BURST/モード退出区間の末尾でTargetを1回復元・導出する。`finally`で計算用上限を戻すため途中例外時にも上限値は公開状態へ残らない。`untilModeExit`も同じ経路上限で退出Stageを二分探索し、以前のTargetを通過した後のHP増加とpartial BURSTを正しく精算する。AUTO設定を読み込んだまま攻略済みTargetで再開した場合も、表示中の `advance`で同じ条件を再判定する。非表示時間には進まない。

### 計算量

Targetの最終値はO(1)。CLEARや+25回数ごとのloopはない。経路二分探索は保護上限までの経路長に対してO(log R)（現密度と上限なら最大約33比較/探索）。Stage時間/Goldの和は既存の有限ブロック・等比級数。AUTO ATKの1秒区間、BURSTの5秒窓、モード退出でだけ分割し、Targetごとの区間分割・イベント配列は作らない。Reactは既存最大10Hz、Target単位のstate更新やDOM/particle生成なし。

OFFは従来のTargetを積分上限に使うので結果が変わらない。ONは無制限に深く進むため、FarmよりHP増加が早く、同じLvでもClear Timeが遅くなることがある。Balance変更ではなく既存の深部進行の結果。Farmしたい場合はOFFに戻す。

## Save

`automation.autoAdvanceEnabled: boolean` を追加。Save Version1 / balanceVersion speed-4のまま。現行Balanceの旧v1でフィールドが欠けている場合だけfalseを補う。null/数値などの不正値は拒否する。encodeは明示的に保存。current/backup、Export/Import、Prestige時automation保持は既存経路を使用する。

これは同一Balanceの小さな任意フィールド拡張で、旧Balance互換ではない。prototype-2 / speed-3は引き続き拒否し、自動変換/wipeしない。正式リリースまではBalance間のSave互換性を保証しない。

## 検証

既存72 unit / integrationと68 E2Eを維持し、AUTO ADVANCE15件とE2E8件を追加。合計87 / 76件。手動1CLEARずつのテスト専用参照と集約結果を比較し、時間/Gold/phase/最高Stage/Targetが一致することを検証。5秒一括と0.1秒分割、AUTO ATKとの併用、BURST退出/部分窓、保護上限、1e6/1e12 CLEARの演算上限、現行Saveの欠損default/reload/Export/Import、非表示停止を含む。

320/360/390px/PCで既定OFF、序盤非表示、攻略済みON、未攻略ON、手動disabled、Prestige保持、Export/Import、横スクロール/pageerrorなしを確認。実インフレfixtureでStage2950から約68700まで（約2600 Target）進め、arena DOM数は測定中固定、React commitは5秒で50前後・最大55。経路位相による既存Enemy/Boss画像切替は最大2種類・既存UI更新頻度以内、Target/CLEAR単位の通信なし。既存の1e6/1e12 Farmテストは追加通信0のまま維持する。

lint・typecheck・production build・Balance simulation `--check`・全自動テスト・GitHub Actionsを実行し、確定結果はPRに記録する。レビュー画像は `docs/review/issue-13/`、ゲーム17画像と配信容量へは追加しない。

既知課題: iOS Safari実機未確認。深部Stageの長期テンポは今回調整しない。手動でもAUTOでも保護上限を超えたStageは作れない。
