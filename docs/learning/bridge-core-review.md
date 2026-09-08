# Bridge core review

Reviewed 2026-09-08 (UTC). Scope: `server/core.ts`, `store.ts`, `remote.ts`, `history.ts`, `cli.ts`, `config.ts`, plus the server lock/recovery boundary in `main.ts`. Authentication/UI review is a separate workstream.

## Result

The issues identified during this review were corrected by the implementation owner. The core/history regression suite passed **11/11** independently; after the final vector-cache recovery fix, the focused history suite passed **7/7**, including its new recovery test. This is not a claim of production readiness or a full security audit.

Verification was local and offline: source inspection, temporary synthetic SQLite/LanceDB stores, deterministic fixture encoders, and the core/history tests. No SSH, real prompt delivery, model download, private-history read, or private-corpus modification was performed in this review. Temporary fixtures were removed. Real-model semantic quality and network-egress behavior were not independently measured here.

## Prioritized findings and disposition

| Priority | Finding | Current disposition |
| --- | --- | --- |
| P1 | A delayed send acknowledgement or verification result could downgrade a recorded reply. | **Fixed.** `Store.update` now uses an immediate transaction, terminal-state guards, and monotonic status ranks. A delayed-acknowledgement synthetic probe and the regression suite preserve `reply_recorded`. |
| P1 | Importing a replacement while inference was pending could mark the replacement embedded using its predecessor's vector. | **Fixed.** Readiness is updated only for the snapshot's ID and content hash; a conflicting replacement is marked dirty for retry. A synthetic interleaving returned zero falsely completed rows, then one successful retry; the regression suite also passes. |
| P1 | Automatic stale-lock unlinking could remove a competing starter's fresh lock; a recovered prepared run could still proceed to POST. | **Fixed in inspected source.** An existing lock now fails closed; creation is exclusive. `send` proceeds only if its persisted transition actually returns `sending`. Manual stale-lock removal remains an owner operation, not automatic recovery. |
| P1 | Credential-like quoted values could retain a secret suffix; metadata bypassed text redaction. | **Fixed for the reported cases.** Whole quoted values and remaining credential-like lines are redacted. Credential-like or control-character-bearing provenance fields are rejected. Synthetic multiword-password leak checks both return false; a synthetic credential-bearing URL in provenance is rejected. |
| P2 | Retired Lance rows could occupy every candidate and hide a valid current result. | **Fixed for correctness.** Search now pages past stale candidates until it has enough validated results or exhausts the table. The original synthetic 7-to-1 chunk replacement previously yielded zero vector hits despite one current keyword hit; the updated, larger stale-tail regression passes. Physical stale vectors are still retained. |
| P2 | The import size limit was checked only after reading the whole input. | **Fixed in inspected source.** `importFile` checks regular-file status/size through the opened handle and performs a capped read, including a growth check, before parsing. The cap is 10 MiB, with at most 500 reviewed excerpts per file import. |
| P2 | SQLite embedding markers can outlive the physical Lance table after an incomplete restore or cache loss. | **Fixed for an absent table.** Status reports zero ready rows when the table is absent, and explicit embedding clears current-model readiness before rebuilding. The new focused recovery regression passes. |

### Final P2 disposition: missing vector table recovery fixed

The original synthetic reproduction imported and embedded one excerpt, removed only that fixture's vector directory, then constructed a new `History` instance using the unchanged SQLite database. Before the fix, it observed:

```json
{"reportedReady":1,"repaired":0,"searchFailure":true}
```

Previously, SQLite readiness markers prevented the explicit embedding command from rebuilding an absent table. The final implementation checks table availability: `status()` reports zero when it is absent, while `performEmbedding()` clears current-model readiness and rebuilds from SQLite. The new missing-vector-store regression passes in the independently rerun **7/7** history suite. This scenario models a mismatched restore or lost derived index, not an ordinary clean restart.

Remaining operational limit: retain a coordinated backup/restore procedure and do not describe `embeddedChunks` alone as a full physical integrity check. Partial table corruption or missing individual vector rows requires stronger reconciliation than merely checking table existence; those scenarios were not validated by this bounded review.

## Verified design properties

- **Durable at-most-once attempt per retained message ID:** the ID and prompt are reserved transactionally before sending. Reusing the same ID returns the stored run; changed content is rejected. An ambiguous send result stays reserved and is verified read-only rather than automatically resent. This is not an exactly-once delivery guarantee across lost/restored databases or independently chosen new IDs.
- **Conservative recovery:** CLI readers do not reconcile active sends. Only the exclusively locked server performs startup recovery; a prior `sending` run becomes uncertain, while `prepared` becomes failed. Recovery does not initiate a POST.
- **Reply correlation:** verification checks agent, marker, watermark, exact submitted prompt, client nonce, later row ordering, and matching request ID. Truncated or explicitly streaming replies are not promoted to recorded replies.
- **SSH variable-data handling:** prompt/ID arguments travel through JSON stdin to fixed gateway code, not interpolated shell arguments. SSH uses batch mode, strict host-key checking, a connection timeout, an overall timeout, and an output threshold. Raw stderr is not retained or returned. No transport retry is implemented.
- **Explicit local import and inference:** importing selected excerpts does not embed them automatically. The source pointer remains provenance; reading an indexed hit reads SQLite, not an arbitrary source path or remote history file.
- **Separated vector spaces:** directory and SQLite readiness identity include the configured model and pipeline settings. Same-dimension but different-model fixture tests pass. Vectors contain IDs, hashes, and projects rather than duplicate source text; results are reconstructed from authoritative SQLite rows after hash/model validation.
- **Local inference path:** source uses the installed Transformers feature-extraction pipeline on CPU, with multilingual token windows and normalized vectors. Model assets may be downloaded when uncached; no remote embedding API is called by this code path. This source observation is not an independent packet-capture guarantee.
- **Bounded retrieval:** search input and result limits are validated, SQL parameters protect keyword queries, and project filters use exact equality. Lance results with stale IDs/hashes or the wrong readiness model are filtered out.

## Operational and privacy limits

1. **Regex redaction is data minimization, not complete secret detection.** Unknown credential formats, personal information, private paths, and free-form sensitive text can survive. Import only manually reviewed, topic-limited selections; keep the corpus private. Public documentation must not embed returned raw excerpts.
2. **Model identity is not a weight fingerprint.** A mutable upstream model revision or altered local cache could retain the same logical identity. Pin an immutable revision or record/validate an artifact fingerprint before claiming reproducibility across installations or upgrades. The manifest currently records model/dimensions rather than enforcing immutable weight identity.
3. **Stale vectors are filtered, not physically pruned.** Pagination repairs false negatives but may perform increasing work as retired rows accumulate. Add bounded maintenance/rebuild tooling before scaling beyond the selected corpus.
4. **Provenance is caller-supplied.** Validation preserves selection pointers and safe metadata; it does not cryptographically prove that a quoted excerpt still matches a remote source. Chunk pointers cover the imported excerpt's line span rather than newly calculated per-chunk source lines.
5. **Default FTS tokenization is not a multilingual substring guarantee.** Unicode-safe chunking and a multilingual embedding model do not by themselves establish Thai keyword-search recall. Evaluate representative Thai and mixed-language queries separately.

## Validation record and next checks

Executed with Node 22.20.0 and the installed local dependencies:

```sh
node --import tsx --test tests/core.test.ts tests/history.test.ts
```

Result: **11 tests passed, 0 failed**, covering durable duplicate suppression, uncertain delivery/no resend, mismatched proof rejection, explicit recovery, monotonic terminal state, idempotent/source-linked import, stale content rejection, model isolation, representative redaction, concurrent import/inference, and stale-candidate pagination. Test encoders are synthetic; these are storage/correlation tests, not evidence of semantic accuracy.

Final focused rerun after the recovery fix: `node --import tsx --test tests/history.test.ts` — **7 passed, 0 failed**, including missing-vector-store detection and explicit rebuild.

Recommended additional focused tests: partial vector-store damage; concurrent server startup and manual stale-lock workflow; malformed/oversized/growing/nonregular import inputs; invalid inference dimensions; project-isolation queries containing quote characters; restart after each durable send phase. Test all remote-send failure paths with a fake gateway, not real prompt delivery.
