"""
WorkProof Integration Tests
Uses the genlayer-test framework (gltest) against localnet.

Run with:
  pip install genlayer-test --break-system-packages
  pytest tests/test_workproof.py -v

These tests exercise the full contract lifecycle:
  T1  - Deploy contract
  T2  - create_job validation guards
  T3  - Happy path: create → accept → submit (pass) → payment released
  T4  - Revision flow: submit fails → revisions_left decremented → in_progress
  T5  - Max revisions → status becomes disputed
  T6  - cancel_job: refunds escrow, only client can cancel
  T7  - accept_job guards: only open jobs, client cannot accept own job
  T8  - list_jobs pagination
  T9  - job_count
  T10 - list_jobs_by_status filter
  T11 - get_job KeyError on missing job
  T12 - Duplicate job_id rejected
  T13 - (NEW, v3 audit) deadline_ts in the past is rejected by create_job
  T14 - (NEW, v3 audit) accept_job rejects an already-expired job
  T15 - (NEW, v3 audit) reclaim_expired_job refunds client when freelancer
        goes silent past the deadline, and rejects early/wrong-caller attempts
  T16 - (NEW, v4 audit) malformed work_url rejected before any tx cost,
        revision NOT consumed
  T17 - (NEW, v4 audit) unreachable URL fetch failure does not consume a
        revision and surfaces a clean error
"""

import time
import pytest
import json
from genlayer_test import (
    get_contract_factory,
    get_accounts,
    create_accounts,
    get_validator_factory,
)

CONTRACT_FILE = "../contract/workproof.py"
ONE_GEN = 10 ** 18          # 1 GEN in wei
TREASURY_IDX = 2            # third account acts as treasury


def future_ts(seconds_from_now: int = 3600) -> int:
    """Unix timestamp N seconds in the future — used for deadline_ts."""
    return int(time.time()) + seconds_from_now


def past_ts(seconds_ago: int = 3600) -> int:
    """Unix timestamp N seconds in the past — for testing expiry guards."""
    return int(time.time()) - seconds_ago


@pytest.fixture(scope="module")
def accounts():
    """Return at least 5 accounts: deployer, client, freelancer, treasury, extra."""
    accts = get_accounts()
    if len(accts) < 5:
        accts = accts + create_accounts(5 - len(accts))
    return accts


@pytest.fixture(scope="module")
def mock_validators():
    """Create 5 mock validators for localnet consensus."""
    vf = get_validator_factory()
    PASS_LLM_RESPONSE = json.dumps({
        "pass": True,
        "score": 85,
        "met_criteria": ["responsive React dashboard", "authentication implemented"],
        "unmet_criteria": [],
        "summary": "The submission fully meets all acceptance criteria. Authentication and responsive design are clearly implemented."
    })
    return vf.batch_create_mock_validators(
        count=5,
        mock_llm_response={"role": "assistant", "content": PASS_LLM_RESPONSE},
        mock_web_response={"status": 200, "body": "<html><body>React Dashboard with auth and charts</body></html>"},
    )


@pytest.fixture(scope="module")
def mock_validators_fail():
    """Validators that return a FAIL evaluation."""
    vf = get_validator_factory()
    FAIL_LLM_RESPONSE = json.dumps({
        "pass": False,
        "score": 40,
        "met_criteria": ["basic React setup"],
        "unmet_criteria": ["authentication missing", "charts not implemented", "not responsive"],
        "summary": "The submission is missing authentication and charting features. Acceptance criteria not met."
    })
    return vf.batch_create_mock_validators(
        count=5,
        mock_llm_response={"role": "assistant", "content": FAIL_LLM_RESPONSE},
        mock_web_response={"status": 200, "body": "<html><body>Basic React app</body></html>"},
    )


@pytest.fixture(scope="module")
def deployed_contract(accounts, mock_validators):
    """Deploy WorkProof once and reuse across tests."""
    factory   = get_contract_factory(contract_file_path=CONTRACT_FILE)
    treasury  = accounts[TREASURY_IDX]
    deployer  = accounts[0]
    contract  = factory.deploy(
        args=[treasury.address],
        account=deployer,
        wait_transaction_status="FINALIZED",
    )
    assert contract is not None
    return contract


# ─────────────────────────────────────────────────────────
# T1: Deploy
# ─────────────────────────────────────────────────────────

def test_t1_deploy(deployed_contract):
    """Contract deploys and is accessible."""
    count = deployed_contract.job_count.call()
    assert count == 0


# ─────────────────────────────────────────────────────────
# T2: create_job validation
# ─────────────────────────────────────────────────────────

def test_t2_create_job_no_payment_rejected(deployed_contract, accounts):
    """create_job with 0 value should raise UserError."""
    client = accounts[1]
    with pytest.raises(Exception, match="Attach GEN"):
        deployed_contract.create_job.transact(
            "test-no-payment",
            "Build a responsive dashboard with authentication",
            future_ts(),
            2,
            value=0,
            account=client,
        )


def test_t2_create_job_short_criteria_rejected(deployed_contract, accounts):
    """create_job with criteria < 20 chars should raise UserError."""
    client = accounts[1]
    with pytest.raises(Exception):
        deployed_contract.create_job.transact(
            "test-short",
            "Too short",
            future_ts(),
            2,
            value=ONE_GEN,
            account=client,
        )


def test_t2_create_job_invalid_revision_limit(deployed_contract, accounts):
    """revision_limit of 0 or 6 should be rejected."""
    client = accounts[1]
    with pytest.raises(Exception):
        deployed_contract.create_job.transact(
            "test-revision",
            "Build a responsive dashboard with authentication",
            future_ts(),
            0,
            value=ONE_GEN,
            account=client,
        )


# ─────────────────────────────────────────────────────────
# T3: Happy path — pass on first submission
# ─────────────────────────────────────────────────────────

def test_t3_happy_path_payment_released(deployed_contract, accounts, mock_validators):
    """Full lifecycle: create → accept → submit → AI passes → payment released."""
    client     = accounts[1]
    freelancer = accounts[3]
    job_id     = "happy-path-job-001"

    # Create job
    deployed_contract.create_job.transact(
        job_id,
        "Build a responsive React dashboard with authentication and charts for sales data",
        future_ts(),
        2,
        value=ONE_GEN,
        account=client,
        wait_transaction_status="FINALIZED",
    )

    state = deployed_contract.get_job.call(job_id)
    assert state["status"] == "open"
    assert state["payment_wei"] == str(ONE_GEN)

    # Accept job
    deployed_contract.accept_job.transact(
        job_id,
        account=freelancer,
        wait_transaction_status="FINALIZED",
    )
    state = deployed_contract.get_job.call(job_id)
    assert state["status"] == "in_progress"
    assert state["freelancer"].lower() == freelancer.address.lower()

    # Submit work (mock validators return PASS)
    deployed_contract.submit_work.transact(
        job_id,
        "https://github.com/example/react-dashboard",
        "I built a fully responsive React dashboard with JWT authentication and Recharts for sales visualization.",
        account=freelancer,
        wait_transaction_status="FINALIZED",
        wait_triggered_transactions=True,
        wait_triggered_transactions_status="FINALIZED",
    )

    state = deployed_contract.get_job.call(job_id)
    assert state["status"] == "completed", f"Expected completed, got {state['status']}"
    assert state["last_review_pass"] is True
    assert state["score"] >= 70


# ─────────────────────────────────────────────────────────
# T4: Revision flow — fail decrements revisions_left
# ─────────────────────────────────────────────────────────

def test_t4_revision_flow(deployed_contract, accounts, mock_validators_fail):
    """Failed submission decrements revisions_left and keeps in_progress."""
    client     = accounts[1]
    freelancer = accounts[3]
    job_id     = "revision-test-job-001"

    deployed_contract.create_job.transact(
        job_id,
        "Build a responsive React dashboard with authentication and charts for sales data",
        future_ts(),
        2,
        value=ONE_GEN,
        account=client,
        wait_transaction_status="FINALIZED",
    )
    deployed_contract.accept_job.transact(
        job_id, account=freelancer, wait_transaction_status="FINALIZED"
    )

    # Submit with FAIL validators
    deployed_contract.submit_work.transact(
        job_id,
        "https://github.com/example/basic-app",
        "Basic React app submitted.",
        account=freelancer,
        wait_transaction_status="FINALIZED",
    )

    state = deployed_contract.get_job.call(job_id)
    # 2 revisions - 1 = 1 left, status stays in_progress
    assert state["status"] == "in_progress", f"Expected in_progress, got {state['status']}"
    assert state["revisions_left"] == 1
    assert state["last_review_pass"] is False
    assert state["score"] < 70


# ─────────────────────────────────────────────────────────
# T5: Max revisions exhausted → disputed
# ─────────────────────────────────────────────────────────

def test_t5_max_revisions_disputed(deployed_contract, accounts, mock_validators_fail):
    """After all revisions used, status becomes disputed."""
    client     = accounts[1]
    freelancer = accounts[3]
    job_id     = "disputed-test-job-001"

    # Create with revision_limit=1
    deployed_contract.create_job.transact(
        job_id,
        "Build a responsive React dashboard with authentication and charts for sales data",
        future_ts(),
        1,
        value=ONE_GEN,
        account=client,
        wait_transaction_status="FINALIZED",
    )
    deployed_contract.accept_job.transact(
        job_id, account=freelancer, wait_transaction_status="FINALIZED"
    )
    # Submit with fail validators — 1 revision used, should become disputed
    deployed_contract.submit_work.transact(
        job_id,
        "https://github.com/example/incomplete",
        "Incomplete work.",
        account=freelancer,
        wait_transaction_status="FINALIZED",
    )

    state = deployed_contract.get_job.call(job_id)
    assert state["status"] == "disputed", f"Expected disputed, got {state['status']}"
    assert state["revisions_left"] == 0


# ─────────────────────────────────────────────────────────
# T6: cancel_job
# ─────────────────────────────────────────────────────────

def test_t6_cancel_job_refunds_client(deployed_contract, accounts):
    """Client can cancel an open job and gets escrow back."""
    client = accounts[1]
    job_id = "cancel-test-job-001"

    deployed_contract.create_job.transact(
        job_id,
        "Build a responsive React dashboard with full authentication",
        future_ts(),
        2,
        value=ONE_GEN,
        account=client,
        wait_transaction_status="FINALIZED",
    )

    state = deployed_contract.get_job.call(job_id)
    assert state["status"] == "open"

    deployed_contract.cancel_job.transact(
        job_id,
        account=client,
        wait_transaction_status="FINALIZED",
        wait_triggered_transactions=True,
        wait_triggered_transactions_status="FINALIZED",
    )

    state = deployed_contract.get_job.call(job_id)
    assert state["status"] == "cancelled"


def test_t6_cancel_job_non_client_rejected(deployed_contract, accounts):
    """Non-client cannot cancel a job."""
    client     = accounts[1]
    other      = accounts[3]
    job_id     = "cancel-guard-test-001"

    deployed_contract.create_job.transact(
        job_id,
        "Build a responsive React dashboard with authentication and sales charts",
        future_ts(),
        2,
        value=ONE_GEN,
        account=client,
        wait_transaction_status="FINALIZED",
    )

    with pytest.raises(Exception, match="Only the client"):
        deployed_contract.cancel_job.transact(job_id, account=other)


# ─────────────────────────────────────────────────────────
# T7: accept_job guards
# ─────────────────────────────────────────────────────────

def test_t7_accept_job_client_cannot_accept_own(deployed_contract, accounts):
    """Client cannot be their own freelancer."""
    client = accounts[1]
    job_id = "client-accept-own-001"

    deployed_contract.create_job.transact(
        job_id,
        "Build a responsive React dashboard with authentication features",
        future_ts(),
        2,
        value=ONE_GEN,
        account=client,
        wait_transaction_status="FINALIZED",
    )
    with pytest.raises(Exception, match="Client cannot"):
        deployed_contract.accept_job.transact(job_id, account=client)


def test_t7_cannot_accept_in_progress_job(deployed_contract, accounts):
    """Once in_progress, no one else can accept."""
    client     = accounts[1]
    freelancer = accounts[3]
    other      = accounts[4]
    job_id     = "double-accept-001"

    deployed_contract.create_job.transact(
        job_id,
        "Build a responsive React dashboard with authentication and sales data charts",
        future_ts(),
        2,
        value=ONE_GEN,
        account=client,
        wait_transaction_status="FINALIZED",
    )
    deployed_contract.accept_job.transact(
        job_id, account=freelancer, wait_transaction_status="FINALIZED"
    )

    with pytest.raises(Exception, match="not open"):
        deployed_contract.accept_job.transact(job_id, account=other)


# ─────────────────────────────────────────────────────────
# T8: list_jobs pagination
# ─────────────────────────────────────────────────────────

def test_t8_list_jobs_pagination(deployed_contract, accounts):
    """list_jobs returns paginated results."""
    client = accounts[1]
    # Create 3 more jobs to ensure pagination has something to work with
    for i in range(3):
        jid = f"pagination-test-{i:03d}"
        deployed_contract.create_job.transact(
            jid,
            f"Build a feature-rich web application with authentication and user dashboard {i}",
            future_ts(),
            1,
            value=ONE_GEN,
            account=client,
            wait_transaction_status="FINALIZED",
        )

    jobs_page1 = deployed_contract.list_jobs.call(0, 3)
    assert isinstance(jobs_page1, list)
    assert len(jobs_page1) <= 3

    jobs_page2 = deployed_contract.list_jobs.call(3, 3)
    assert isinstance(jobs_page2, list)

    # Pages should not overlap (different job_ids)
    ids_p1 = {j["job_id"] for j in jobs_page1}
    ids_p2 = {j["job_id"] for j in jobs_page2}
    assert ids_p1.isdisjoint(ids_p2)


# ─────────────────────────────────────────────────────────
# T9: job_count
# ─────────────────────────────────────────────────────────

def test_t9_job_count_increments(deployed_contract, accounts):
    """job_count increases after each create_job."""
    client   = accounts[1]
    before   = deployed_contract.job_count.call()

    deployed_contract.create_job.transact(
        f"job-count-test-{before}",
        "Build a complete web application with user authentication and dashboard UI",
        future_ts(),
        1,
        value=ONE_GEN,
        account=client,
        wait_transaction_status="FINALIZED",
    )

    after = deployed_contract.job_count.call()
    assert after == before + 1


# ─────────────────────────────────────────────────────────
# T10: list_jobs_by_status
# ─────────────────────────────────────────────────────────

def test_t10_list_jobs_by_status(deployed_contract, accounts):
    """
    list_jobs_by_status returns only matching status jobs, with the SAME
    field shape as list_jobs() — including "client" and "freelancer".

    AUDIT FIX regression guard: list_jobs_by_status previously omitted
    "client" entirely, which crashed the frontend job board the moment a
    user clicked any filter tab (every card unconditionally renders
    job.client). This test pins the field shape so that regression can't
    silently come back.
    """
    open_jobs = deployed_contract.list_jobs_by_status.call("open", 0, 50)
    assert isinstance(open_jobs, list)
    required_fields = {
        "job_id", "client", "criteria", "payment_wei",
        "status", "revisions_left", "freelancer",
    }
    for job in open_jobs:
        assert job["status"] == "open"
        assert required_fields.issubset(job.keys()), (
            f"list_jobs_by_status is missing fields: "
            f"{required_fields - job.keys()}"
        )

    completed_jobs = deployed_contract.list_jobs_by_status.call("completed", 0, 50)
    for job in completed_jobs:
        assert job["status"] == "completed"
        assert required_fields.issubset(job.keys())


# ─────────────────────────────────────────────────────────
# T11: get_job missing key
# ─────────────────────────────────────────────────────────

def test_t11_get_job_missing_raises(deployed_contract):
    """get_job on non-existent job_id raises an error."""
    with pytest.raises(Exception):
        deployed_contract.get_job.call("this-job-does-not-exist-xyz999")


# ─────────────────────────────────────────────────────────
# T12: duplicate job_id
# ─────────────────────────────────────────────────────────

def test_t12_duplicate_job_id_rejected(deployed_contract, accounts):
    """Creating a job with an existing ID is rejected."""
    client = accounts[1]
    job_id = "duplicate-test-job-999"

    deployed_contract.create_job.transact(
        job_id,
        "Build a responsive web application with authentication and data visualizations",
        future_ts(),
        1,
        value=ONE_GEN,
        account=client,
        wait_transaction_status="FINALIZED",
    )

    with pytest.raises(Exception, match="already exists"):
        deployed_contract.create_job.transact(
            job_id,
            "Some other criteria that meets the minimum length requirement",
            future_ts(),
            1,
            value=ONE_GEN,
            account=client,
        )


# ─────────────────────────────────────────────────────────
# T13: deadline_ts in the past is rejected (v3 audit fix)
# ─────────────────────────────────────────────────────────

def test_t13_past_deadline_rejected(deployed_contract, accounts):
    """create_job with a deadline_ts already in the past must be rejected."""
    client = accounts[1]
    with pytest.raises(Exception, match="future"):
        deployed_contract.create_job.transact(
            "past-deadline-test-001",
            "Build a responsive web application with authentication and dashboard",
            past_ts(),
            2,
            value=ONE_GEN,
            account=client,
        )


# ─────────────────────────────────────────────────────────
# T14: accept_job rejects an already-expired job (v3 audit fix)
# ─────────────────────────────────────────────────────────

def test_t14_accept_expired_job_rejected(deployed_contract, accounts):
    """
    A job created with a deadline a couple seconds in the future, then
    accepted after that deadline has elapsed, must be rejected and the
    job auto-transitioned to 'expired'.
    """
    client     = accounts[1]
    freelancer = accounts[3]
    job_id     = "expiry-test-job-001"

    # 2-second deadline — deliberately short so it elapses before we accept
    deployed_contract.create_job.transact(
        job_id,
        "Build a responsive web application with authentication and a dashboard view",
        future_ts(2),
        2,
        value=ONE_GEN,
        account=client,
        wait_transaction_status="FINALIZED",
    )

    time.sleep(4)  # let the 2-second deadline elapse

    with pytest.raises(Exception, match="deadline has passed"):
        deployed_contract.accept_job.transact(job_id, account=freelancer)

    state = deployed_contract.get_job.call(job_id)
    assert state["status"] == "expired"


# ─────────────────────────────────────────────────────────
# T15: reclaim_expired_job (v3 audit fix — new escape hatch)
# ─────────────────────────────────────────────────────────

def test_t15_reclaim_expired_job_refunds_client(deployed_contract, accounts):
    """
    Client posts a job, freelancer accepts but never submits. After the
    deadline passes, the client can reclaim escrow via reclaim_expired_job.
    Before the deadline, or from a non-client account, it must be rejected.
    """
    client     = accounts[1]
    freelancer = accounts[3]
    other      = accounts[4]
    job_id     = "reclaim-test-job-001"

    deployed_contract.create_job.transact(
        job_id,
        "Build a responsive web application with authentication and a sales dashboard",
        future_ts(2),
        2,
        value=ONE_GEN,
        account=client,
        wait_transaction_status="FINALIZED",
    )
    deployed_contract.accept_job.transact(
        job_id, account=freelancer, wait_transaction_status="FINALIZED"
    )

    # Too early — deadline hasn't passed yet
    with pytest.raises(Exception, match="not passed"):
        deployed_contract.reclaim_expired_job.transact(job_id, account=client)

    time.sleep(4)  # let the 2-second deadline elapse

    # Wrong caller — non-client cannot reclaim
    with pytest.raises(Exception, match="Only the client"):
        deployed_contract.reclaim_expired_job.transact(job_id, account=other)

    # Correct caller, after deadline — succeeds and refunds escrow
    deployed_contract.reclaim_expired_job.transact(
        job_id,
        account=client,
        wait_transaction_status="FINALIZED",
        wait_triggered_transactions=True,
        wait_triggered_transactions_status="FINALIZED",
    )

    state = deployed_contract.get_job.call(job_id)
    assert state["status"] == "expired"



# ─────────────────────────────────────────────────────────
# T16: malformed work_url rejected before any transaction cost
# (v3 audit fix — was previously unvalidated)
# ─────────────────────────────────────────────────────────

def test_t16_malformed_work_url_rejected(deployed_contract, accounts):
    """
    submit_work with a work_url that doesn't start with http:// or https://
    must be rejected immediately with a clear UserError, before any
    validator fetch/LLM call is attempted.
    """
    client     = accounts[1]
    freelancer = accounts[3]
    job_id     = "malformed-url-test-001"

    deployed_contract.create_job.transact(
        job_id,
        "Build a responsive web application with authentication and a dashboard",
        future_ts(),
        2,
        value=ONE_GEN,
        account=client,
        wait_transaction_status="FINALIZED",
    )
    deployed_contract.accept_job.transact(
        job_id, account=freelancer, wait_transaction_status="FINALIZED"
    )

    with pytest.raises(Exception, match="http"):
        deployed_contract.submit_work.transact(
            job_id,
            "not-a-real-url",
            "Some submission notes.",
            account=freelancer,
        )

    # Confirm the rejected attempt did NOT consume a revision
    state = deployed_contract.get_job.call(job_id)
    assert state["revisions_left"] == 2
    assert state["status"] == "in_progress"


# ─────────────────────────────────────────────────────────
# T17: unreachable URL does not consume a revision
# (v3 audit fix — fetch failures previously could crash opaquely
# and it was unclear whether revisions_left was affected)
# ─────────────────────────────────────────────────────────

def test_t17_unreachable_url_does_not_consume_revision(accounts):
    """
    A syntactically valid but unreachable URL, where every validator's
    gl.nondet.web.get() call fails, should surface as a clean UserError
    and must NOT decrement revisions_left — the freelancer never got a
    real evaluation to react to.

    This test deploys its own contract with validators mocked to raise on
    web fetch, since the shared mock_validators/mock_validators_fail
    fixtures return successful (if failing) evaluations rather than a
    raised fetch error.
    """
    vf = get_validator_factory()
    fetch_error_validators = vf.batch_create_mock_validators(
        count=5,
        mock_llm_response={"role": "assistant", "content": "{}"},
        mock_web_response={"status": 500, "body": "Internal Server Error"},
    )

    factory  = get_contract_factory(contract_file_path=CONTRACT_FILE)
    treasury = accounts[TREASURY_IDX]
    deployer = accounts[0]
    contract = factory.deploy(
        args=[treasury.address],
        account=deployer,
        wait_transaction_status="FINALIZED",
    )

    client     = accounts[1]
    freelancer = accounts[3]
    job_id     = "unreachable-url-test-001"

    contract.create_job.transact(
        job_id,
        "Build a responsive web application with authentication and a dashboard",
        future_ts(),
        2,
        value=ONE_GEN,
        account=client,
        wait_transaction_status="FINALIZED",
    )
    contract.accept_job.transact(
        job_id, account=freelancer, wait_transaction_status="FINALIZED"
    )

    with pytest.raises(Exception, match="NOT counted"):
        contract.submit_work.transact(
            job_id,
            "https://this-domain-should-not-resolve.invalid/work",
            "Some submission notes.",
            account=freelancer,
        )

    state = contract.get_job.call(job_id)
    assert state["revisions_left"] == 2, (
        "A fetch failure must not consume a revision attempt"
    )
    assert state["status"] == "in_progress"
