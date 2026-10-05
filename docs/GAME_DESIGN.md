# LOOP BREAKER — ゲーム設計 v4（Issue #11）

設計日: 2026-10-03。原案: [Issue #1](https://github.com/mkunori/loop-breaker/issues/1)。本書群は初期実装の仕様。数値の正本は [BALANCE_DESIGN.md](BALANCE_DESIGN.md)、処理・保存の正本は [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md)。Issue #3の初期実装・検証結果は [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) を参照。

## 1. 体験と対象範囲

LOOP BREAKERは巨大数を増やしながらClear Timeの桁を削っていくゲーム。自動戦闘の5秒RUNを秒→ms→μs→BURSTへ圧縮する。プレイヤーの仕事は強化購入とPrestigeの判断。敵の種類や装備管理で複雑さを増やさない。

初期実装に含める: 自動戦闘、5種類の通常強化、3種類の恒久強化、AUTO ATK、Stage進行、Prestige、BURST、Save/Export/Import、集計統計。装備、ランダムドロップ、実績報酬、クエスト、手動攻撃、スタミナ、広告、課金、サーバー、ランキングは含めない。実績候補は統計から後で判定でき、初期は到達通知だけ。

起動中かつページ表示中のみ進む。背景タブ、画面ロック、終了中は進まない。復帰時に経過時間を精算しない。数分で購入と短縮を体験し、中断時点の周回進捗を再開できる。

## 2. 用語と基本ループ

- RUN / 周: 現在Stageの敵列（通常敵4体＋Boss1体）を倒して、次の開始待ちまでを終える1単位。
- CLEAR: 完了RUN数。敵1体の撃破数ではない。
- Stage: 敵HPの難度。1周でStageが1つ増える意味ではない。
- Cycle: Prestigeから次のPrestigeまでの期間。初回プレイもCycleに含む。
- Clear Time: 現在能力・Stageでの理論1周時間。直近実測は別ラベル。

開始→表示中の時間を周回進捗へ換算→完了数分のGoldを受け取る→Stage条件を評価→購入→新能力で次の時間区間へ進む。死亡・被ダメージ・回復管理はない。敵HPとHero DPSだけが戦闘速度を決める。

戦闘は連続DPSで解く。攻撃アニメーションやCrit表示は計算結果の演出で、報酬乱数ではない。固定待ちは初期1秒。攻撃演出はClear Time別のLODで制限し、敵ごとのタイマーをゲーム状態に持たない。

Stage開始境界は経路進行CLEAR `5 × (Stage−1)`。初期Stage100への到達は495 CLEAR、そこで最低1周を完了した496 CLEARでPrestigeのStage条件を満たす。途中Stageの必要周回数は5。現在Cycleの到達目標までは自動でStageを上げ、目標到達後は同Stageで周回する。初回〜3Cycleの目標は100、その後150、200…と上がる。Stage100までは緩いHP上昇で圧縮を優先し、101以降は敵HP成長を強めて深度と成長を釣り合わせる。

3回目Prestige以降、現在のtargetStageを実際にCLEAR済みの場合のみ「さらに進む」で目標を25増やせる。目標への入場だけでは不可。+25直後は次の目標をCLEARするまで再実行できない。UIとgame commandで同じ条件を確認する。必要Stageを1000で固定しない。技術上の数値保護限界を超えた場合は進行停止・Exportとし、限界StageのPrestigeを無制限に繰り返させない。各CLEARのGoldにStageごとの小さな倍率を掛け、Stage101以降は最大+5%で固定する。深いStageの即時メリットを保ち、Goldインフレの主因にはしない。

目標到達後の稼ぎCLEARは経路進行へ貯めない。総Cycle CLEARと、目標Stageの初CLEARまで進む経路進行CLEAR（routeClears）を別集計し、後者は目標で止める。「さらに進む」でも経路進行から再開するため、弱いStageで貯めた大量CLEARで深い敵を飛ばしてSOULを得ることはできない。過去CLEARへの新Stage倍率の遡及付与もない。通常の自動進行中は両CLEARが同じ値になる。

Issue #13: 任意のAUTO ADVANCEを「さらに進む +25」の隣へ追加。Prestige3回以上で表示し、現在Target攻略後だけ+25を自動実行する。OFFは既存Farm、ONは連続した経路進行。攻略済みでONなら1回だけ進め、手動DeepenはON中disabled/no-op。Prestigeは手動で、設定はReset後も保持。Target更新を集約し、Stageスキップ・無料攻略・新たな購入機会は与えない。[AUTO_ADVANCE](AUTO_ADVANCE.md)を参照。

## 3. 通常強化と解禁

ATKは最初から購入可能。Attack Speed、Critical、Overkill、Route CompressionはCycle CLEAR 6 / 20 / 40 / 70で順に解禁。120でAUTO ATK解禁。約0:29 / 1:13 / 1:52 / 2:31 / 3:15の目安であり、時計による待機ゲートにはしない。一度解禁した機能はPrestigeを越えて残る。

初回はSpeed/Crit/Overkillの上限Lv1、RouteはLv6で以後Prestige毎+3、最大Lv30。初回PrestigeでSpeed Lv2、2回目PrestigeでCrit Lv2を解放し、2〜3Cycle目にも「新しい強化にGoldを回すか、ATKを優先するか」という判断を残す。解禁カードに効果、価格、購入後のClear Timeを表示する。購入は即時、現在周の進捗比率は保つ。購入前の時間を先に精算し、Gold不足なら何も変更しない。x1 / MAXのみ用意し、MAXは現在の残高以内、解禁・上限以内。誤購入の取消は設けない。

AUTO ATKは通常攻撃の自動化ではなく**ATK強化の自動購入**。戦闘は初めから自動。解禁時はOFF、明示してONにできる。1秒の表示中時間ごとに予算内でATKをMAX購入する。他強化のためにGoldを残す任意の「予約Gold」を1つだけ設定できる（既定0）。購入停止は即時。Prestige後もON/OFFと予約額を保持。ほかのAUTO系は初期実装に含めず、購入設定を強化IDごとに追加できる構造にする。

3回目PrestigeではSpeed Lv3、Overkill Lv2、Compression Lv15を解放。以後も段階的に上限が上がり、最終上限はSpeed/Crit/Overkill各8、Compression30。全上限を一度に開かず、圧縮の節目を残す。具体的な回数別の上限式はバランス書参照。SOULを消費する解放ではなく、Prestigeマイルストーンの報酬。

## 4. Prestige

Prestige解禁は初回CycleでStage100を1周以上CLEAR。以後は現在Cycleの必要Stageを1周以上CLEARした時点で可能。最低Cycle時間、クールダウン、待機ゲートは設けない。Cycle時間は統計・表示専用で、Prestige可否には使わない。

必要Stageは `100 + 50 × max(0, prestigeCount−2)`（prestigeCountは完了済み回数）。次Cycleの目標はその必要Stage。100→100→100→150→200…と深くし、Stage101以降の敵HP成長と指数的な恒久強化価格で自然に間隔を調整する。現行ActiveのCycle4〜12は約23〜46秒。長期の一定テンポを保証するものではなく、Cycle13以降の深部では所要時間が伸びる。[4モデルと深部検証](BURST_15_DESIGN.md)を参照。AUTO Prestigeは設けない。

Prestige画面に獲得SOUL、次Cycleの必要Stage、LOOP MASTERY報酬、通常強化の新しい上限、残るもの・リセットされるもの、予測Clear Timeを表示。「Prestigeする」を押すと同じパネル内で確認し確定する。開いたパネルは戦闘を止めないが、確定時に最新の条件を再判定する。予測は現在の恒久Lv・通常Lv0・Stage1・完了済み回数p+1（今回のLOOP MASTERY獲得後）に基づき、未購入SOUL強化を勝手に仮定しない。

SOUL表示はPrestige可能な場合のみ「今回 +N SOUL」とする。未達成時は「Stage N CLEARでPrestige可能」と表示し、現在の未攻略深度から算出した未確定報酬を今回獲得扱いにしない。SOUL式・2回目ボーナスはそのまま維持する。

リセット: Gold、通常強化全Lv、Cycle CLEAR、経路進行CLEAR、現在Stage、周回進捗、Cycle時間、Cycle内最高CLEAR Stage。保持: SOUL、恒久強化、Prestige回数、解禁フラグ、AUTO設定、累積統計、UI設定。SOULを付与し回数を増やす操作とResetは1トランザクション。

POWER / WEALTH / TEMPOはIssueの効果・価格を採用。恒久強化はSOULで買い、自由な配分を認める。初回4 SOULでLv1を1つずつ買える。2回目のみ追加4 SOULを贈り、計8で各Lv2を買える。Cycle2約1分42秒、Cycle3は初BURSTまで約7分57秒はこの均等配分の参考ルートで検証する。別配分まで同じ到達時間にはしない。SOUL指数1.5は12Cycleまでの比較検証を踏まえて維持する。

**LOOP MASTERY（仮称）**は「Prestigeで周回の仕組みそのものを圧縮する」明示的なマイルストーン。初回PrestigeでBREAK I、2回目でBREAK IIを自動獲得し、全RUN時間の倍率が1→0.55→0.36となる。第4のSOUL購入系統にはしない。

Prestige画面のマイルストーン欄には「BREAK I: 全周回時間×0.55（45%短縮）」「BREAK II: 全周回時間×0.36（未獲得時から64%短縮、BREAK Iからさらに約34.5%短縮）」を表示。0.55と0.36を乗算するのではなく、現在の累積倍率を置き換える。3回目以降は毎Prestigeでさらに×0.88（12%短縮）、現在/次の累積倍率も表示する。通常強化上限解放と深いStageも報酬として示す。回数からBigで導出しSaveに重複フィールドを追加しない。獲得済み効果はUPGRADES/Statsでも確認できる。

## 5. 通常表示からBURSTへ

現在Clear Timeが厳密に1ms未満になった時、BURST表示を恒久解禁し現在Cycleの表示を切り替える。同じ進捗・同じ報酬式を継続し、速度ボーナスや無料CLEARを付けない。Prestige後など1.1ms以上なら通常表示へ戻る。1.0〜1.1msでは直前表示を維持して振動を避ける。

通常画面は1周の進捗バーと敵演出。BURSTは5秒の表示中時間を1区切りに「BURST 5.00 sec / CLEAR ×N / Gold +G」を表示する。区切り中の購入は可能で、その前後の速度で計算する。切替時から新しい5秒窓を始めるが、周回進捗を消さない。途中の窓を表示切替・Prestigeで閉じると「部分BURST」と表示し、Best BURSTの対象にしない。

Nはその窓で実際に完了した整数周回数。窓ごとに端数を切り捨て直さず、周回進捗として繰り越す。1ms未満ならBURSTに入る。数百、数百万、1e12周で敵カードを大量生成せず、斬撃LODは最大4回/秒、結果カード1枚だけ。Multi Clear、Parallel Runs等は将来の設定倍率へ接続可能だが、初期実装は倍率1。

## 6. モバイルUI

基本画面1枚＋Prestige/Stats/設定のボトムシート。BATTLEとUPGRADEは同画面に統合。上段はStageとGold、中央は敵/Hero・DPS・Clear Time・CLEAR数、下段の親指領域にATKと非ATK候補1つを固定する。全強化一覧は下段から展開。AUTO切替も同じ領域。初期にPrestige用の空タブを表示しない。

基準幅360px、320pxでも横スクロールなし。ボタン最小48px、セーフエリア対応、文字の省略より科学表記を優先。敵演出より数値の読める大きさを優先する。色だけに依存せず、フォーカス・キーボード・スクリーンリーダー対応。数値は5〜10Hz更新、読み上げは購入/解禁/区切りのみ。減速アニメ設定、音は既定OFF。

PCは中央最大幅480pxを基本とし、広幅では右側に強化一覧を併設できる。新しい管理画面は増やさない。StatsにはTotal Clears / Fastest Clear（Stage付き）/ Highest Stage / Total Gold / Prestige Count / Best BURST / Total Play Timeの集計のみ。BURSTのFastestは理論値であることを示す。

## 7. 過去のIssue #9の調整

Damage base60、待ち1秒、ATK価格100/1.2、Route価格100/1.8、Stage密度40、Route上限6+2p、解禁を調整。HP・Gold・SOUL・MASTERY・深部曲線は維持。候補比較・12Cycle結果・Save互換性・CSS LODは[SPEED_REWORK](SPEED_REWORK.md)を参照。後半の深部停滞と配分による所要時間差は残る。生存戦や新通貨は追加しない。

## Issue #11: 15分BURSTとQuick Buy

ATK価格35/1.12・Route価格2000/1.8・Stage密度5・Route上限6+3p。ATK単独でも固定待ちを圧縮する式を採用。常駐はATK+候補1つの名前/Lv/価格/短縮時間、詳細はシート、AUTO予約はシートのみ。[BURST_15_DESIGN](BURST_15_DESIGN.md)に購入モデルと比較理由を記録。Active Farm初Prestige5:54・初BURST累積15:33、Casual18:03、AUTO Only23:10。3Cycle目はStage100で初BURSTまで育成継続する参考方針。即Prestigeを毎回選ぶImmediateも継続MASTERYで24:38に初BURSTへ到達する。Cycle3以降・BURST未解禁ならPrestige画面に育成継続の選択肢を案内する。強制制限はない。

正式リリースまではBalance間のSave互換性を保証しない。speed-5以外は明示的に拒否し、自動変換/wipeは行わない。旧SaveのExportと確認付き新規開始を用意する。現行版同士のSave往復・current/backupは維持する。Issue #9の互換記述は当時の記録であり現行方針ではない。

Issue #15はStage701以降の追加HP成長のみ変更。Stage700以下、Required +50、MASTERY、恒久強化、AUTO ADVANCE、UIは維持。[詳細・検証](DEEP_HP_DESIGN.md)。
