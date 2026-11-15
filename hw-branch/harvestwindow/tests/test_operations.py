import json
from pathlib import Path
import unittest
import pandas as pd
from build_operations import describe


class OperationsTests(unittest.TestCase):
    def test_quality_keeps_missing_distinct_from_zero_and_suspect(self):
        row = describe(pd.Series([0, 6.5, 15, None]), "compartment/water_drain/ph")
        self.assertEqual(row["count"], 3)
        self.assertEqual(row["coverage"], 75)
        self.assertEqual(row["suspect"], 2)
        self.assertEqual(row["min"], 0)

    def test_history_excludes_future_and_harvest_labels(self):
        text = (Path(__file__).resolve().parents[1] / "dashboard/operations-data.js").read_text()
        data = json.loads(text.removeprefix("window.operationsData = ").strip().removesuffix(";"))
        self.assertEqual(len(data), 7)
        for source in data.values():
            self.assertLessEqual(source["end"], "2024-11-05")
            for channel in source["channels"]:
                self.assertNotEqual(channel["channel"], "dwarf_tomato/harvest_date")
                self.assertTrue(all(day["date"] <= "2024-11-05" for day in channel["daily"]))


if __name__ == "__main__":
    unittest.main()
