import unittest

import main


def item(symbol, price=100, candle_id=1):
    return {"symbol": symbol, "price": price, "change": 3.0, "change_15m": 0.2,
            "volume_24h": 50_000_000, "rsi": 55, "histogram": 1,
            "volume_ratio": 1.3, "atr": 2, "support": 96, "resistance": 105,
            "trend": "alcista", "candle_id": candle_id}


class PaperTradingTests(unittest.TestCase):
    def test_entry_has_reserve_and_no_duplicate_within_candle(self):
        state = main.blank_state()
        analyses = {s: item(s) for s in main.CORE}
        first = main.update_paper(state, analyses, "2026-10-21T00:00:00Z")
        self.assertEqual(len(first), 3)
        self.assertGreaterEqual(state["cash"], 20)
        self.assertEqual(len(state["positions"]), 3)
        second = main.update_paper(state, analyses, "2026-10-21T00:15:00Z")
        self.assertEqual(second, [])
        self.assertEqual(len(state["trades"]), 3)
        for symbol, position in state["positions"].items():
            potential_loss = position["quantity"] * (position["entry"] - position["stop"])
            self.assertLessEqual(potential_loss, 1.0)
            self.assertGreaterEqual(position["target"] - position["entry"],
                                    2 * (position["entry"] - position["stop"]) - 1e-8)

    def test_stop_records_loss_and_halts_new_entries(self):
        state = main.blank_state()
        analyses = {s: item(s) for s in main.CORE}
        main.update_paper(state, analyses, "2026-10-21T00:00:00Z")
        for symbol in analyses:
            analyses[symbol] = item(symbol, price=90, candle_id=2)
        events = main.update_paper(state, analyses, "2026-10-21T00:15:00Z")
        self.assertTrue(any("VENTA FICTICIA" in event for event in events))
        self.assertEqual(state["positions"], {})
        self.assertTrue(all(trade["pnl"] < 0 for trade in state["trades"] if trade["side"] == "SELL"))

    def test_meme_needs_extra_liquidity_and_momentum(self):
        asset = item("DOGEUSDT")
        self.assertFalse(main.candidate(asset, meme=True))
        asset["volume_ratio"] = 1.6
        self.assertTrue(main.candidate(asset, meme=True))
        asset["change"] = 25
        self.assertFalse(main.candidate(asset, meme=True))

    def test_drawdown_pauses_new_paper_buys(self):
        state = main.blank_state()
        state["cash"] = 94.0
        analyses = {s: item(s) for s in main.CORE}
        events = main.update_paper(state, analyses, "2026-10-21T00:00:00Z")
        self.assertEqual(state["status"], "paused")
        self.assertEqual(state["positions"], {})
        self.assertTrue(any("PAUSADAS" in event for event in events))


if __name__ == "__main__":
    unittest.main()
