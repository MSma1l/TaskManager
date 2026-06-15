"""Serviciu AI pentru estimarea dificultatii taskurilor.

Foloseste OpenRouter (gateway OpenAI-compatibil) cand exista o cheie API;
altfel cade pe euristici locale deterministe. Calea AI nu trebuie sa arunce
NICIODATA catre client — orice exceptie => fallback pe reguli.

Textele vizibile userului (rationale, intrebari) sunt in romana.
"""
import json
import re

import httpx

from app.core.config import settings


def _ai_available() -> bool:
    return bool(settings.OPENROUTER_API_KEY)


def _openrouter_chat(prompt: str) -> str:
    """Apeleaza OpenRouter (chat completions) si intoarce continutul mesajului.

    Arunca exceptie la orice eroare (retea, http, cheie lipsa) — apelantul
    prinde si cade pe reguli.
    """
    url = f"{settings.OPENROUTER_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://taskmanager.local",
        "X-Title": "TaskManager",
    }
    body = {
        "model": settings.OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1024,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    with httpx.Client(timeout=30) as client:
        resp = client.post(url, headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"]


# ── intrebari de clarificare (rule-based fallback) ──────────────────

_RULE_QUESTIONS = [
    {"id": "q1", "text": "Cat de bine este definita sarcina (necunoscute)?"},
    {"id": "q2", "text": "Cate componente/fisiere atinge?"},
    {"id": "q3", "text": "Exista dependente de alti oameni/sisteme?"},
    {"id": "q4", "text": "Necesita cercetare sau e clar de facut?"},
    {"id": "q5", "text": "Cat de critic/riscant este?"},
]


def generate_questions(title: str, description: str = "") -> dict:
    """Intoarce 3-5 intrebari scurte care ajuta la estimarea dificultatii."""
    if _ai_available():
        try:
            return _ai_generate_questions(title, description or "")
        except Exception:
            pass
    return {"questions": list(_RULE_QUESTIONS), "source": "rules"}


def _ai_generate_questions(title: str, description: str) -> dict:
    prompt = (
        "You help estimate software task difficulty. Given a task title and "
        "optional description, produce 3 to 5 SHORT clarifying questions (in "
        "Romanian) that would help estimate the difficulty/story points.\n"
        "Return STRICT JSON ONLY, no prose, no code fences, in this exact shape:\n"
        '{"questions": [{"id": "q1", "text": "..."}, ...]}\n\n'
        f"Title: {title}\n"
        f"Description: {description}\n"
    )
    content = _openrouter_chat(prompt)
    data = _parse_json(content)
    questions = data.get("questions") or []
    cleaned = []
    for i, q in enumerate(questions):
        if isinstance(q, dict) and q.get("text"):
            cleaned.append({"id": str(q.get("id") or f"q{i+1}"), "text": str(q["text"])})
    if not cleaned:
        raise ValueError("Raspuns AI fara intrebari valide")
    return {"questions": cleaned, "source": "ai"}


# ── estimare story points ───────────────────────────────────────────

def estimate(title: str, description: str = "", answers: dict | None = None) -> dict:
    """Estimeaza story points (1..10) cu motivare; sugereaza subtaskuri daca e mare."""
    answers = answers or {}
    if _ai_available():
        try:
            return _ai_estimate(title, description or "", answers)
        except Exception:
            pass
    return _rule_estimate(title, description or "", answers)


def _ai_estimate(title: str, description: str, answers: dict) -> dict:
    answers_text = "\n".join(f"- {k}: {v}" for k, v in answers.items()) or "(none)"
    prompt = (
        "You estimate software task difficulty in story points (Fibonacci-ish, "
        "integer from 1 to 10). Consider the title, description and the user's "
        "answers to clarifying questions. If the task is large (> 8), suggest "
        "2 to 4 smaller subtasks.\n"
        "The 'rationale' field MUST be written in Romanian (user-facing).\n"
        "Return STRICT JSON ONLY, no prose, no code fences, in this exact shape:\n"
        '{"story_points": <int 1-10>, "rationale": "<romana>", '
        '"should_split": <bool>, "suggested_subtasks": ["...", "..."]}\n\n'
        f"Title: {title}\n"
        f"Description: {description}\n"
        f"Answers:\n{answers_text}\n"
    )
    content = _openrouter_chat(prompt)
    data = _parse_json(content)

    points = _clamp_points(data.get("story_points"))
    should_split = points > 8
    subtasks = data.get("suggested_subtasks") or []
    if not isinstance(subtasks, list):
        subtasks = []
    subtasks = [str(s) for s in subtasks if s]
    rationale = str(data.get("rationale") or "Estimare generata de AI.")

    return {
        "storyPoints": points,
        "rationale": rationale,
        "shouldSplit": should_split,
        "suggestedSubtasks": subtasks if should_split else [],
        "source": "ai",
    }


# ── euristici locale ────────────────────────────────────────────────

_COMPLEXITY_KEYWORDS = [
    "complex", "necunoscut", "multe", "dependent", "dependenta", "dependență",
    "cercetare", "risc", "integr", "refactor", "migr", "securitate",
]


def _rule_estimate(title: str, description: str, answers: dict) -> dict:
    blob = " ".join([
        title or "",
        description or "",
        " ".join(str(v) for v in (answers or {}).values()),
    ]).lower()

    # Scor de baza din lungimea textului raspunsurilor + titlu/descriere.
    length_score = min(len(blob) // 120, 5)  # 0..5

    keyword_hits = sum(1 for kw in _COMPLEXITY_KEYWORDS if kw in blob)
    keyword_score = min(keyword_hits * 2, 5)  # 0..5

    score = length_score + keyword_score
    points = _clamp_points(max(1, score))
    should_split = points > 8

    rationale = (
        f"Estimare euristica (fara AI): {keyword_hits} indicii de complexitate "
        f"detectate, scor {points}/10."
    )

    subtasks = []
    if should_split:
        subtasks = [
            "Imparte sarcina in pasi clari, independenti",
            "Trateaza separat partea cea mai necunoscuta/riscanta",
            "Lasa la final integrarea si testarea",
        ]

    return {
        "storyPoints": points,
        "rationale": rationale,
        "shouldSplit": should_split,
        "suggestedSubtasks": subtasks,
        "source": "rules",
    }


# ── utilitare ───────────────────────────────────────────────────────

def _clamp_points(value) -> int:
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        n = 1
    return max(1, min(10, n))


def _parse_json(text: str) -> dict:
    """Parseaza JSON din raspunsul modelului, scotand eventualele code fences."""
    if not text:
        raise ValueError("Raspuns AI gol")
    cleaned = text.strip()
    # Scoate ```json ... ``` sau ``` ... ```
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()
    return json.loads(cleaned)
