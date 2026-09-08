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


class HistoryTests(unittest.TestCase):
    aid = "11111111-1111-4111-8111-111111111111"

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.path = self.base / "agents" / self.aid / "store.db"
        self.path.parent.mkdir(parents=True)
        (self.path.parent / "profile.json").write_text(json.dumps({"name": "History fixture"}))
        self.db = sqlite3.connect(self.path)
        self.db.execute("CREATE TABLE transcript_entries (seq INTEGER PRIMARY KEY, id TEXT, entry TEXT)")
        self.patcher = patch.object(gateway, "BASE", self.base)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        self.db.close()
        self.temp.cleanup()

    def add(self, entry):
        self.db.execute("INSERT INTO transcript_entries(id,entry) VALUES ('fixture',?)", (json.dumps(entry),))
        self.db.commit()

    def test_only_user_facing_text_is_read_chronologically_without_writes(self):
        for entry in [
            {"kind": "message", "role": "user", "content": "สวัสดี", "timestampMs": 1700000000000},
            {"kind": "tool-result", "content": "not a reply"},
            {"kind": "message", "role": "user", "content": "internal", "fromAgent": "other"},
            {"kind": "message", "role": "assistant", "content": "internal", "toAgent": "other"},
            {"kind": "user-attachment", "file_path": "/private/not-read"},
            {"kind": "send-message", "requestId": "request", "message": {"type": "text", "content": "Hello"}},
            {"kind": "message", "role": "assistant", "content": "Alternate reply"},
        ]: self.add(entry)
        before = self.path.read_bytes()
        with patch.object(gateway, "request", side_effect=AssertionError("No HTTP allowed")):
            page = gateway.history_page(self.aid)
        self.assertEqual([e["role"] for e in page["entries"]], ["user", "assistant", "assistant"])
        self.assertEqual([e["rowid"] for e in page["entries"]], [1, 6, 7])
        self.assertEqual(page["entries"][0]["content"], "สวัสดี")
        self.assertIsNotNone(page["entries"][0]["timestamp"])
        self.assertFalse(page["hasMore"])
        self.assertEqual(self.path.read_bytes(), before)

    def test_pagination_has_no_overlap_and_cursor_progresses(self):
        for n in range(70): self.add({"kind": "message", "role": "user", "content": str(n)})
        recent = gateway.history_page(self.aid)
        earlier = gateway.history_page(self.aid, recent["nextBeforeRowid"])
        self.assertTrue(recent["hasMore"])
        self.assertEqual(recent["nextBeforeRowid"], 21)
        self.assertFalse(earlier["hasMore"])
        self.assertEqual([e["rowid"] for e in earlier["entries"] + recent["entries"]], list(range(1, 71)))

    def test_budget_and_truncation_are_explicit_without_losing_rows(self):
        for _ in range(20): self.add({"kind": "message", "role": "assistant", "content": "x" * 9000})
        recent = gateway.history_page(self.aid)
        self.assertLessEqual(sum(len(e["content"]) for e in recent["entries"]), 131072)
        self.assertTrue(all(e["contentTruncated"] for e in recent["entries"]))
        earlier = gateway.history_page(self.aid, recent["nextBeforeRowid"])
        self.assertEqual(len(earlier["entries"] + recent["entries"]), 20)

    def test_history_rejects_unsafe_paths_and_page_bounds(self):
        for aid, before, limit in [("../../elsewhere", None, 50), (self.aid, 0, 50), (self.aid, None, 51), (self.aid, None, 0)]:
            with self.assertRaises(ValueError): gateway.history_page(aid, before, limit)

    def test_history_cli_never_calls_gateway_http(self):
        self.add({"kind": "message", "role": "user", "content": "fixture"})
        with patch("sys.argv", ["gateway", "history", "--agent-id", self.aid]), patch.object(gateway, "request") as request, patch.object(gateway, "emit") as emit:
            gateway.main()
        request.assert_not_called()
        self.assertEqual(emit.call_args.args[0]["action"], "history")


class CreationTests(unittest.TestCase):
    def test_creation_uses_gateway_once_without_kickstart(self):
        operation = "a95379bc-cccb-44de-bda1-4629e750ec59"
        agent = "bb5379bc-cccb-44de-bda1-4629e750ec59"
        argv = ["gateway", "create-agent", "--operation-id", operation,
                "--name", "New bot", "--description", ""]
        with patch("sys.argv", argv), patch.object(gateway, "request", return_value=(200, {"agent": {"id": agent}})) as request, patch.object(gateway, "emit") as emit:
            gateway.main()
        request.assert_called_once_with("/api/createAgent", {
            "name": "New bot", "description": "", "clientNonce": operation,
            "creationRoute": {"kind": "box"}, "origin": "user",
            "isIntroductionSuppressed": True, "isKickstartRequested": False,
        })
        self.assertEqual(emit.call_args.args[0]["agentId"], agent)

    def test_creation_timeout_is_not_retried(self):
        argv = ["gateway", "create-agent", "--operation-id",
                "a95379bc-cccb-44de-bda1-4629e750ec59", "--name", "New", "--description", ""]
        with patch("sys.argv", argv), patch.object(gateway, "request", side_effect=TimeoutError()) as request:
            with self.assertRaises(TimeoutError):
                gateway.main()
        self.assertEqual(request.call_count, 1)


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
