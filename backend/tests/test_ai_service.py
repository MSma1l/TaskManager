"""Tests for app.services.ai_service (Phase 3 AI estimation).

No live network: when no OpenRouter key is set the rule-based fallback runs;
the AI path is exercised by monkeypatching `_openrouter_chat`.
"""
import pytest

from app.services import ai_service


@pytest.fixture(autouse=True)
def _no_key(monkeypatch):
    """Default to NO OpenRouter key so rules run unless a test opts in."""
    monkeypatch.setattr(ai_service.settings, "OPENROUTER_API_KEY", "", raising=False)


# ── rule-based fallback (no key) ─────────────────────────────────────

def test_generate_questions_rules_when_no_key():
    out = ai_service.generate_questions("Add login", "")
    assert out["source"] == "rules"
    assert out["questions"] == ai_service._RULE_QUESTIONS
    assert 3 <= len(out["questions"]) <= 5


def test_estimate_rules_simple_task():
    out = ai_service.estimate("Fix typo", "", {})
    assert out["source"] == "rules"
    assert 1 <= out["storyPoints"] <= 10
    assert out["shouldSplit"] is False
    assert out["suggestedSubtasks"] == []


def test_estimate_rules_should_split_when_large():
    # Pack the blob with complexity keywords + length to push score > 8.
    desc = ("complex migr refactor integrare securitate risc cercetare dependenta "
            "necunoscut " * 20)
    out = ai_service.estimate("Big complex migration", desc, {"q1": desc})
    assert out["storyPoints"] > 8
    assert out["shouldSplit"] is True
    assert len(out["suggestedSubtasks"]) > 0


# ── _clamp_points ────────────────────────────────────────────────────

@pytest.mark.parametrize("value,expected", [
    (0, 1), (-5, 1), (1, 1), (5, 5), (10, 10), (11, 10), (999, 10),
    (3.4, 3), (3.6, 4), ("7", 7), (None, 1), ("abc", 1),
])
def test_clamp_points_bounds(value, expected):
    assert ai_service._clamp_points(value) == expected


# ── _parse_json ──────────────────────────────────────────────────────

def test_parse_json_plain():
    assert ai_service._parse_json('{"a": 1}') == {"a": 1}


def test_parse_json_strips_json_fence():
    text = '```json\n{"story_points": 5}\n```'
    assert ai_service._parse_json(text) == {"story_points": 5}


def test_parse_json_strips_bare_fence():
    text = '```\n{"x": true}\n```'
    assert ai_service._parse_json(text) == {"x": True}


def test_parse_json_empty_raises():
    with pytest.raises(ValueError):
        ai_service._parse_json("")


# ── AI path (monkeypatched, no network) ──────────────────────────────

def _enable_key(monkeypatch):
    monkeypatch.setattr(ai_service.settings, "OPENROUTER_API_KEY", "test-key", raising=False)


def test_generate_questions_ai_source(monkeypatch):
    _enable_key(monkeypatch)
    payload = '{"questions": [{"id": "q1", "text": "Intrebare?"}, {"text": "Alta?"}]}'
    monkeypatch.setattr(ai_service, "_openrouter_chat", lambda prompt: payload)

    out = ai_service.generate_questions("Title", "Desc")
    assert out["source"] == "ai"
    assert len(out["questions"]) == 2
    assert out["questions"][0]["text"] == "Intrebare?"
    # Missing id is backfilled.
    assert out["questions"][1]["id"] == "q2"


def test_generate_questions_ai_falls_back_on_error(monkeypatch):
    _enable_key(monkeypatch)
    def boom(prompt):
        raise RuntimeError("network down")
    monkeypatch.setattr(ai_service, "_openrouter_chat", boom)

    out = ai_service.generate_questions("Title", "Desc")
    assert out["source"] == "rules"


def test_generate_questions_ai_empty_falls_back(monkeypatch):
    _enable_key(monkeypatch)
    # Valid JSON but no usable questions -> _ai_generate_questions raises -> rules.
    monkeypatch.setattr(ai_service, "_openrouter_chat", lambda p: '{"questions": []}')
    out = ai_service.generate_questions("Title", "Desc")
    assert out["source"] == "rules"


def test_estimate_ai_source(monkeypatch):
    _enable_key(monkeypatch)
    payload = ('{"story_points": 4, "rationale": "Motiv in romana", '
               '"should_split": false, "suggested_subtasks": []}')
    monkeypatch.setattr(ai_service, "_openrouter_chat", lambda p: payload)

    out = ai_service.estimate("Title", "Desc", {"q1": "raspuns"})
    assert out["source"] == "ai"
    assert out["storyPoints"] == 4
    assert out["rationale"] == "Motiv in romana"
    assert out["shouldSplit"] is False
    assert out["suggestedSubtasks"] == []


def test_estimate_ai_large_keeps_subtasks(monkeypatch):
    _enable_key(monkeypatch)
    payload = ('{"story_points": 10, "rationale": "Mare", '
               '"should_split": false, "suggested_subtasks": ["a", "b", ""]}')
    monkeypatch.setattr(ai_service, "_openrouter_chat", lambda p: payload)

    out = ai_service.estimate("Title", "Desc")
    assert out["storyPoints"] == 10
    assert out["shouldSplit"] is True   # forced True because points > 8
    assert out["suggestedSubtasks"] == ["a", "b"]  # empties stripped


def test_estimate_ai_falls_back_on_error(monkeypatch):
    _enable_key(monkeypatch)
    monkeypatch.setattr(ai_service, "_openrouter_chat", lambda p: (_ for _ in ()).throw(ValueError("bad")))
    out = ai_service.estimate("Title", "Desc")
    assert out["source"] == "rules"


def test_estimate_ai_non_list_subtasks(monkeypatch):
    _enable_key(monkeypatch)
    payload = ('{"story_points": 3, "rationale": "x", "suggested_subtasks": "nope"}')
    monkeypatch.setattr(ai_service, "_openrouter_chat", lambda p: payload)
    out = ai_service.estimate("Title", "Desc")
    assert out["suggestedSubtasks"] == []  # not a list and not should_split


# ── plan_sprint (genereaza taskuri din brief liber) ───────────────────

def test_plan_sprint_rules_splits_lines():
    """Fara cheie: fiecare linie a brief-ului devine un task determinist."""
    out = ai_service.plan_sprint("Adauga login\nRepara bug\nScrie teste")
    assert out["source"] == "rules"
    assert len(out["tasks"]) == 3
    titles = [t["title"] for t in out["tasks"]]
    assert titles == ["Adauga login", "Repara bug", "Scrie teste"]
    for t in out["tasks"]:
        assert 1 <= t["storyPoints"] <= 10


def test_plan_sprint_rules_empty_brief():
    out = ai_service.plan_sprint("   ")
    assert out["source"] == "rules"
    assert out["tasks"] == []


def test_plan_sprint_ai_source(monkeypatch):
    _enable_key(monkeypatch)
    payload = (
        '{"tasks": ['
        '{"title": "Implementeaza login", "description": "criterii", "story_points": 5},'
        '{"title": "Scrie teste", "description": "", "story_points": 13}'
        ']}'
    )
    monkeypatch.setattr(ai_service, "_openrouter_chat", lambda p: payload)
    out = ai_service.plan_sprint("brief liber")
    assert out["source"] == "ai"
    assert len(out["tasks"]) == 2
    assert out["tasks"][0]["title"] == "Implementeaza login"
    assert out["tasks"][1]["storyPoints"] == 10  # 13 -> clamp la 10


def test_plan_sprint_ai_skips_items_without_title(monkeypatch):
    _enable_key(monkeypatch)
    payload = '{"tasks": [{"description": "fara titlu"}, {"title": "Bun", "story_points": 2}]}'
    monkeypatch.setattr(ai_service, "_openrouter_chat", lambda p: payload)
    out = ai_service.plan_sprint("brief")
    assert [t["title"] for t in out["tasks"]] == ["Bun"]


def test_plan_sprint_ai_falls_back_on_error(monkeypatch):
    _enable_key(monkeypatch)
    def boom(prompt):
        raise RuntimeError("network down")
    monkeypatch.setattr(ai_service, "_openrouter_chat", boom)
    out = ai_service.plan_sprint("Adauga login\nRepara bug")
    assert out["source"] == "rules"
    assert len(out["tasks"]) == 2


def test_plan_sprint_ai_empty_falls_back(monkeypatch):
    _enable_key(monkeypatch)
    monkeypatch.setattr(ai_service, "_openrouter_chat", lambda p: '{"tasks": []}')
    out = ai_service.plan_sprint("Adauga login")
    assert out["source"] == "rules"  # raspuns AI gol -> reguli
