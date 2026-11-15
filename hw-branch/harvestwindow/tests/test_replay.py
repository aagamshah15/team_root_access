from datetime import date, timedelta
import json
from pathlib import Path
import unittest

from model import Curve, confirmed_onset


ROOT = Path(__file__).resolve().parents[1]


class ForecastTests(unittest.TestCase):
    def test_camera_confirmation_needs_three_consecutive_available_days(self):
        first = date(2024, 11, 3)
        days = [first + timedelta(days=i) for i in range(5)]
        frames = {day: 0.2 for day in days}
        self.assertIsNone(confirmed_onset(frames, days[1]))
        self.assertEqual(confirmed_onset(frames, days[2]), first)
        del frames[days[1]]
        self.assertIsNone(confirmed_onset(frames, days[3]))
        self.assertEqual(confirmed_onset(frames, days[4]), days[2])

    def test_anchor_moves_curve_toward_sample_without_inverting_it(self):
        curve = Curve(0.03, 700)
        adjusted = curve.anchored(730, 0.50)
        self.assertLess(adjusted.predict(730), curve.predict(730))
        self.assertGreater(adjusted.predict(730), 0.50)
        self.assertGreater(adjusted.predict(740), adjusted.predict(730))

    def test_replay_contains_a_real_sampling_decision_and_fallback(self):
        asset = (ROOT / "dashboard/replay-data.js").read_text(encoding="utf-8")
        replay = json.loads(asset.removeprefix("window.harvestReplay = ").strip().removesuffix(";"))
        self.assertEqual(len(replay["evaluation"]), 6)
        self.assertIsNone(replay["rooms"]["Reference"]["cameraOnset"])
        self.assertEqual(replay["rooms"]["Reference"]["prior"], replay["rooms"]["Reference"]["warmth"])
        requests = [row["room"] for row in replay["evaluation"] if row["requested"]]
        self.assertEqual(requests, ["MuGrow"])
        mugrow = replay["rooms"]["MuGrow"]
        self.assertEqual(mugrow["prior"]["selected"], 0)
        self.assertEqual(mugrow["after"]["selected"], 1)
        for room in replay["rooms"].values():
            for plan in (room["prior"], room["after"]):
                self.assertEqual(len(plan["points"]), 22)
                for point in plan["points"]:
                    self.assertLessEqual(point["low"], point["red"])
                    self.assertLessEqual(point["red"], point["high"])


if __name__ == "__main__":
    unittest.main()
