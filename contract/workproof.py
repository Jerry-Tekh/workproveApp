# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# WorkProof — AI-Verified Freelance Escrow
# GenLayer Intelligent Contract

from genlayer import *
from datetime import datetime, timezone
import json

PLATFORM_FEE_BPS = 200
PASS_SCORE_MIN   = 70
SCORE_TOLERANCE  = 10


@gl.evm.contract_interface
class _EOARecipient:
    class View:
        pass
    class Write:
        pass


class WorkProof(gl.Contract):

    jobs:     TreeMap[str, str]
    job_ids:  DynArray[str]
    treasury: str

    def __init__(self, treasury_address: str) -> None:
        self.treasury = treasury_address
        self.jobs     = TreeMap()
        self.job_ids  = DynArray()

    def _load_job(self, job_id):
        return json.loads(self.jobs[job_id])

    def _save_job(self, job_id, job):
        self.jobs[job_id] = json.dumps(job)

    @gl.public.write.payable
    def create_job(
        self,
        job_id:              str,
        acceptance_criteria: str,
        deadline_ts:         int,
        revision_limit:      int,
    ) -> None:
        client = str(gl.message.sender_address)
        value  = gl.message.value
        now    = int(datetime.now(timezone.utc).timestamp())

        if value == u256(0):
            raise gl.vm.UserError("Attach GEN tokens as payment")
        if len(job_id.strip()) == 0:
            raise gl.vm.UserError("job_id cannot be empty")
        if len(acceptance_criteria.strip()) < 20:
            raise gl.vm.UserError("Acceptance criteria too short (min 20 chars)")
        if deadline_ts <= now:
            raise gl.vm.UserError("deadline_ts must be in the future")
        if revision_limit < 1 or revision_limit > 5:
            raise gl.vm.UserError("revision_limit must be 1-5")

        try:
            _ = self.jobs[job_id]
            raise gl.vm.UserError(f"Job '{job_id}' already exists")
        except KeyError:
            pass

        self._save_job(job_id, {
            "client":                  client,
            "criteria":                acceptance_criteria,
            "payment_wei":             str(value),
            "deadline_ts":             int(deadline_ts),
            "revisions_left":          int(revision_limit),
            "status":                  "open",
            "freelancer":              "",
            "score":                   -1,
            "last_review_pass":        False,
            "last_review_summary":     "",
            "met_criteria":            [],
            "unmet_criteria":          [],
            "last_submission_tx_note": "",
        })
        self.job_ids.append(job_id)

    @gl.public.write
    def accept_job(self, job_id: str) -> None:
        freelancer = str(gl.message.sender_address)
        job = self._load_job(job_id)
        now = int(datetime.now(timezone.utc).timestamp())

        if job["status"] != "open":
            raise gl.vm.UserError("Job is not open")
        if job["client"] == freelancer:
            raise gl.vm.UserError("Client cannot be their own freelancer")
        if now > int(job["deadline_ts"]):
            job["status"] = "expired"
            self._save_job(job_id, job)
            raise gl.vm.UserError("This job's deadline has passed")

        job["freelancer"] = freelancer
        job["status"]     = "in_progress"
        self._save_job(job_id, job)

    @gl.public.write
    def submit_work(
        self,
        job_id:           str,
        work_url:         str,
        submission_notes: str,
    ) -> None:
        freelancer = str(gl.message.sender_address)
        job = self._load_job(job_id)

        if job["freelancer"] != freelancer:
            raise gl.vm.UserError("Only the assigned freelancer can submit")
        if job["status"] != "in_progress":
            raise gl.vm.UserError("Job is not in progress")

        _stripped = work_url.strip()
        if len(_stripped) == 0:
            raise gl.vm.UserError("work_url is required")
        if not (_stripped.startswith("http://") or _stripped.startswith("https://")):
            raise gl.vm.UserError("work_url must start with http:// or https://")

        _criteria = job["criteria"]
        _notes    = submission_notes
        _url      = _stripped

        def leader_fn():
            response  = gl.nondet.web.get(_url)
            body_text = response.body.decode("utf-8", errors="replace")
            prompt = (
                "You are a rigorous senior technical reviewer for a trustless freelance escrow. "
                "Real payment is held in a smart contract. Be strict and objective.\n\n"
                f"CLIENT ACCEPTANCE CRITERIA:\n{_criteria}\n\n"
                f"FREELANCER SUBMISSION NOTES:\n{_notes}\n\n"
                f"FETCHED WORK CONTENT (from {_url[:100]}):\n{body_text[:5000]}\n\n"
                "SCORING: 90-100=all criteria met, 70-89=met with minor issues, "
                "50-69=most criteria met, 30-49=partial, 0-29=mostly unmet\n\n"
                "Respond ONLY with valid JSON (no markdown, no code fences):\n"
                '{"pass": true/false, "score": 0-100, '
                '"met_criteria": ["..."], "unmet_criteria": ["..."], '
                '"summary": "2 sentences"}'
            )
            raw = gl.nondet.exec_prompt(prompt)
            cleaned = raw.strip()
            if "```" in cleaned:
                for part in cleaned.split("```"):
                    part = part.strip()
                    if part.startswith("json"):
                        part = part[4:].strip()
                    if part.startswith("{"):
                        cleaned = part
                        break
            return json.loads(cleaned)

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                try:
                    leader_fn()
                    return False
                except Exception:
                    return True
            try:
                my_result = leader_fn()
            except Exception:
                return False
            leader_data = leader_result.calldata
            leader_pass = bool(leader_data.get("pass", False))
            my_pass     = bool(my_result.get("pass", False))
            if leader_pass != my_pass:
                return False
            leader_score = int(leader_data.get("score", -1))
            my_score     = int(my_result.get("score", -1))
            if leader_score < 0 or my_score < 0:
                return False
            if leader_score < 30 or my_score < 30:
                return (leader_score < 30) == (my_score < 30)
            return abs(leader_score - my_score) <= SCORE_TOLERANCE

        try:
            result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        except Exception as fetch_err:
            raise gl.vm.UserError(
                f"Could not evaluate submission — URL may be unreachable or AI response malformed. "
                f"This attempt was NOT counted against your revisions. ({fetch_err})"
            )

        score_int = int(result.get("score", 0))
        passed    = bool(result.get("pass", False)) and score_int >= PASS_SCORE_MIN
        summary   = str(result.get("summary", ""))
        met       = result.get("met_criteria", [])
        unmet     = result.get("unmet_criteria", [])
        if not isinstance(met, list):
            met = [str(met)]
        if not isinstance(unmet, list):
            unmet = [str(unmet)]

        job = self._load_job(job_id)
        job["score"]               = score_int
        job["last_review_pass"]    = passed
        job["last_review_summary"] = summary
        job["met_criteria"]        = [str(item) for item in met]
        job["unmet_criteria"]      = [str(item) for item in unmet]

        if passed:
            job["status"] = "completed"
            self._save_job(job_id, job)
            total          = u256(int(job["payment_wei"]))
            fee            = (total * u256(PLATFORM_FEE_BPS)) // u256(10000)
            freelancer_pay = total - fee
            _EOARecipient(Address(job["freelancer"])).emit_transfer(value=freelancer_pay)
            if fee > u256(0):
                _EOARecipient(Address(self.treasury)).emit_transfer(value=fee)
        else:
            revisions = int(job["revisions_left"]) - 1
            job["revisions_left"] = revisions
            job["status"] = "disputed" if revisions <= 0 else "in_progress"
            if job["status"] == "disputed":
                job["last_submission_tx_note"] = (
                    "All revisions exhausted. Use the transaction hash shown "
                    "above with: genlayer transactions appeal --tx <hash>"
                )
            self._save_job(job_id, job)

    @gl.public.write
    def cancel_job(self, job_id: str) -> None:
        caller = str(gl.message.sender_address)
        job    = self._load_job(job_id)
        if job["client"] != caller:
            raise gl.vm.UserError("Only the client can cancel")
        if job["status"] != "open":
            raise gl.vm.UserError("Can only cancel an open (unaccepted) job")
        job["status"] = "cancelled"
        self._save_job(job_id, job)
        _EOARecipient(Address(job["client"])).emit_transfer(
            value=u256(int(job["payment_wei"]))
        )

    @gl.public.write
    def reclaim_expired_job(self, job_id: str) -> None:
        caller = str(gl.message.sender_address)
        job    = self._load_job(job_id)
        now    = int(datetime.now(timezone.utc).timestamp())
        if job["client"] != caller:
            raise gl.vm.UserError("Only the client can reclaim this job")
        if job["status"] != "in_progress":
            raise gl.vm.UserError("Job must be in_progress to reclaim")
        if now <= int(job["deadline_ts"]):
            raise gl.vm.UserError("Deadline has not passed yet")
        job["status"] = "expired"
        self._save_job(job_id, job)
        _EOARecipient(Address(job["client"])).emit_transfer(
            value=u256(int(job["payment_wei"]))
        )

    @gl.public.view
    def get_job(self, job_id: str) -> dict:
        job = self._load_job(job_id)
        return {
            "job_id":                  job_id,
            "client":                  job["client"],
            "criteria":                job["criteria"],
            "payment_wei":             job["payment_wei"],
            "deadline_ts":             int(job["deadline_ts"]),
            "revisions_left":          int(job["revisions_left"]),
            "status":                  job["status"],
            "freelancer":              job["freelancer"],
            "score":                   int(job["score"]),
            "last_review_pass":        bool(job["last_review_pass"]),
            "last_review_summary":     job["last_review_summary"],
            "met_criteria":            job["met_criteria"],
            "unmet_criteria":          job["unmet_criteria"],
            "last_submission_tx_note": job["last_submission_tx_note"],
        }

    @gl.public.view
    def list_jobs(self, offset: int, limit: int) -> list:
        result = []
        ids    = self.job_ids
        total  = len(ids)
        end    = min(offset + limit, total)
        for i in range(offset, end):
            jid = ids[i]
            try:
                job = self._load_job(jid)
                result.append({
                    "job_id":         jid,
                    "client":         job["client"],
                    "criteria":       job["criteria"][:120] + ("..." if len(job["criteria"]) > 120 else ""),
                    "payment_wei":    job["payment_wei"],
                    "status":         job["status"],
                    "revisions_left": int(job["revisions_left"]),
                    "freelancer":     job["freelancer"],
                })
            except KeyError:
                pass
        return result

    @gl.public.view
    def job_count(self) -> int:
        return len(self.job_ids)

    @gl.public.view
    def list_jobs_by_status(self, status: str, offset: int, limit: int) -> list:
        result = []
        count  = 0
        skip   = 0
        for i in range(len(self.job_ids)):
            if count >= limit:
                break
            jid = self.job_ids[i]
            try:
                job = self._load_job(jid)
                if job["status"] == status:
                    if skip < offset:
                        skip += 1
                        continue
                    result.append({
                        "job_id":         jid,
                        "client":         job["client"],
                        "criteria":       job["criteria"][:120] + ("..." if len(job["criteria"]) > 120 else ""),
                        "payment_wei":    job["payment_wei"],
                        "status":         job["status"],
                        "revisions_left": int(job["revisions_left"]),
                        "freelancer":     job["freelancer"],
                    })
                    count += 1
            except KeyError:
                pass
        return result
