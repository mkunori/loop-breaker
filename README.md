# LOOP BREAKER

自動戦闘の周回を30秒から5秒、1秒、さらに5秒で大量CLEARするBURSTへ圧縮していく、モバイル向けブラウザゲーム。

現在は[Issue #1](https://github.com/mkunori/loop-breaker/issues/1)に基づく設計フェーズです。ゲーム本体は未実装です。

- [ゲーム仕様](docs/GAME_DESIGN.md): 周回、Stage、解禁、Prestige、UI、原案からの調整
- [バランス設計](docs/BALANCE_DESIGN.md): 数式、価格、初回30分と次の2Cycleの数値検証
- [技術設計](docs/TECHNICAL_DESIGN.md): 技術構成、一括計算、Save/Migration、自動テスト、実装手順

設計用の計算はPython 3で再現できます（外部依存なし）。ゲーム本体の実装ではありません。

```sh
python docs/balance/simulate.py
```

参考ルートでは初回Prestige約30分27秒、2Cycle目約9分42秒、3Cycle目約5分。購入配分や操作の遅れで変化するため、実装後にプレイテストで調整します。
