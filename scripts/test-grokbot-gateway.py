#!/usr/bin/env python3
"""Local synthetic tests only: no SSH, gateway, credentials or live transcripts."""
import argparse
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("gateway", Path(__file__).with_name("grokbot-gateway.py"))
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)


class CorrelationTests(unittest.TestCase):
    marker = "DOC_NETBIRD_SYNTHETIC_TEST"

    def prompt(self, rowid=9, request_id="our-request"):
        return (rowid, json.dumps({"kind": "message", "role": "user", "content": self.marker, "requestId": request_id}))

    def reply(self, rowid=11, request_id="our-request", text=None):
        return (rowid, json.dumps({"kind": "send-message", "requestId": request_id, "message": {"type": "text", "content": text or "Hello " + self.marker}}))

    def test_correlates_only_same_request_after_prompt(self):
        rows = [self.reply(7), self.prompt(), self.reply(10, "unrelated"), self.reply()]
        result = gateway.inspect_rows(rows, self.marker)
        self.assertEqual(result["status"], "reply_recorded")
        self.assertEqual([r["rowid"] for r in result["replies"]], [11])

    def test_echo_without_user_entry_is_not_delivery(self):
        self.assertEqual(gateway.inspect_rows([self.reply()], self.marker)["status"], "prompt_not_recorded")

    def test_user_entry_without_reply_is_pending(self):
        self.assertEqual(gateway.inspect_rows([self.prompt()], self.marker)["status"], "prompt_recorded_waiting_for_reply")

    def test_duplicate_prompts_are_ambiguous(self):
        self.assertEqual(gateway.inspect_rows([self.prompt(), self.prompt(10)], self.marker)["status"], "ambiguous_multiple_prompts")

    def test_missing_request_id_does_not_correlate(self):
        self.assertEqual(gateway.inspect_rows([self.prompt(request_id=None), self.reply(request_id=None)], self.marker)["replies"], [])

    def test_tool_output_not_promoted_to_bot_reply(self):
        tool = (10, json.dumps({"kind": "tool-result", "requestId": "our-request", "content": self.marker}))
        self.assertEqual(gateway.inspect_rows([self.prompt(), tool], self.marker)["replies"], [])

    def test_truncation_explicit(self):
        result = gateway.inspect_rows([self.prompt(), self.reply(text="x" * 7000)], self.marker)
        self.assertTrue(result["replies"][0]["contentTruncated"])
        self.assertEqual(len(result["replies"][0]["content"]), 6000)

    def test_marker_constraints(self):
        self.assertEqual(gateway.marker_value(self.marker), self.marker)
        for invalid in ("short", "unsafe/marker/123", "has spaces marker", "x" * 121):
            with self.assertRaises(argparse.ArgumentTypeError):
                gateway.marker_value(invalid)

    def test_no_redirect(self):
        self.assertIsNone(gateway.NoRedirect().redirect_request(None, None, None, None, None, None))

    def test_sqlite_open_is_read_only(self):
        aid = "11111111-1111-4111-8111-111111111111"
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            path = base / "agents" / aid / "store.db"
            path.parent.mkdir(parents=True)
            writer = sqlite3.connect(path)
            writer.execute("CREATE TABLE transcript_entries (seq INTEGER PRIMARY KEY, id TEXT, entry TEXT)")
            writer.commit()
            writer.close()
            with patch.object(gateway, "BASE", base):
                reader = gateway.connect(aid)
                self.assertEqual(reader.execute("PRAGMA query_only").fetchone()[0], 1)
                with self.assertRaises(sqlite3.OperationalError):
                    reader.execute("INSERT INTO transcript_entries VALUES (1, 'id', '{}')")
                reader.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
