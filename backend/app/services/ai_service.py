"""Serviciu AI pentru generarea si estimarea taskurilor.

Foloseste OpenRouter (gateway OpenAI-compatibil) cand exista o cheie API;
altfel cade pe euristici locale deterministe.

Doua tipuri de comportament la erori:
- pentru `generate_questions` / `estimate` (asistente, non-critice) orice
  exceptie => fallback silentios pe reguli (nu strica fluxul);
- pentru `generate_task` / `plan_sprint` (genereaza continut pe care userul il
  confirma) un raspuns AI care NU poate fi parsat / e gol arunca
  `AiResponseError`, ca ruta sa intoarca un 502 clar in loc sa produca taskuri
  incomplete in tacere. Erorile de retea raman fallback pe reguli (rezilienta).

Textele vizibile userului (rationale, intrebari, descrieri) sunt in romana.
"""
import json
import re
from datetime import datetime, timedelta

import httpx

from app.core.config import settings


class AiResponseError(Exception):
    """Modelul a raspuns, dar raspunsul e invalid / gol / fara taskuri utile."""


def _ai_available() -> bool:
    return bool(settings.OPENROUTER_API_KEY)


def _openrouter_chat(prompt: str, *, max_tokens: int = 1500) -> str:
    """Apeleaza OpenRouter (chat completions) si intoarce continutul mesajului.

    Arunca exceptie la orice eroare de retea/http — apelantul decide daca face
    fallback pe reguli sau propaga.
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
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a senior IT project planner. You ALWAYS reply with a "
                    "single valid JSON value and nothing else (no prose, no code "
                    "fences). All user-facing text inside the JSON is in Romanian."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.2,
        # Multe modele OpenRouter ignora/resping `response_format`; nu ne bazam pe
        # el — parsarea de mai jos extrage JSON-ul chiar daca modelul adauga proza.
        "response_format": {"type": "json_object"},
    }
    with httpx.Client(timeout=45) as client:
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
        "Return STRICT JSON ONLY in this exact shape:\n"
        '{"questions": [{"id": "q1", "text": "..."}, ...]}\n\n'
        f"Title: {title}\n"
        f"Description: {description}\n"
    )
    content = _openrouter_chat(prompt, max_tokens=600)
    data = _parse_json(content)
    questions = (data or {}).get("questions") or []
    cleaned = []
    for i, q in enumerate(questions):
        if isinstance(q, dict) and q.get("text"):
            cleaned.append({"id": str(q.get("id") or f"q{i+1}"), "text": str(q["text"])})
    if not cleaned:
        raise AiResponseError("Raspuns AI fara intrebari valide")
    return {"questions": cleaned, "source": "ai"}


# ── estimare story points (asistent, non-critic) ────────────────────

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
        "You estimate software task difficulty in story points (integer 1..10). "
        "Consider the title, description and the user's answers. If the task is "
        "large (> 8), suggest 2 to 4 smaller subtasks.\n"
        "The 'rationale' field MUST be written in Romanian.\n"
        "Return STRICT JSON ONLY in this exact shape:\n"
        '{"story_points": <int 1-10>, "rationale": "<romana>", '
        '"should_split": <bool>, "suggested_subtasks": ["...", "..."]}\n\n'
        f"Title: {title}\n"
        f"Description: {description}\n"
        f"Answers:\n{answers_text}\n"
    )
    content = _openrouter_chat(prompt, max_tokens=800)
    data = _parse_json(content)

    points = _clamp_points((data or {}).get("story_points"))
    should_split = points > 8
    subtasks = _str_list((data or {}).get("suggested_subtasks"))
    rationale = str((data or {}).get("rationale") or "Estimare generata de AI.")

    return {
        "storyPoints": points,
        "rationale": rationale,
        "shouldSplit": should_split,
        "suggestedSubtasks": subtasks if should_split else [],
        "source": "ai",
    }


# ── generare task complet (descriere -> preview bogat) ──────────────

def generate_task(title: str, description: str = "") -> dict:
    """Dintr-o descriere simpla genereaza UN task complet (preview, nepersistat).

    Intoarce {"task": {...}, "source"} unde task contine: title, description
    (cu criterii de acceptanta), storyPoints, subtasks[], dependencies[],
    dueDate (ISO) si rationale.

    Daca AI-ul e configurat dar raspunde invalid => AiResponseError (ruta da 502).
    Daca AI-ul nu e configurat sau pica reteaua => fallback determinist pe reguli.
    """
    title = (title or "").strip()
    description = (description or "").strip()

    if not _ai_available():
        return {"task": _rule_task(title, description), "source": "rules"}

    try:
        content = _ai_generate_task_raw(title, description)
    except AiResponseError:
        raise
    except Exception:
        # Eroare de retea/http — nu blocam userul, cadem pe reguli.
        return {"task": _rule_task(title, description), "source": "rules"}

    data = _parse_json(content)
    task = _coerce_task(data if isinstance(data, dict) else {})
    if not task["title"]:
        task["title"] = title or "Task nou"
    if task["storyPoints"] is None:
        task["storyPoints"] = _rule_estimate(title, description, {})["storyPoints"]
    return {"task": task, "source": "ai"}


def _ai_generate_task_raw(title: str, description: str) -> str:
    prompt = (
        "Turn the following short request into ONE complete, well-scoped IT task.\n"
        "Produce, in Romanian:\n"
        "- title: imperative, <= 80 chars;\n"
        "- description: a short summary AND a 'Criterii de acceptanta:' bullet "
        "list; if there are external/internal dependencies, add a 'Dependente:' line;\n"
        "- story_points: integer 1..10 (effort estimate);\n"
        "- subtasks: 2..6 concrete, actionable steps, each a full sentence with "
        "enough detail to act on;\n"
        "- dependencies: list of prerequisites (by short title), or [] if none;\n"
        "- due_in_days: integer, a realistic number of days from today to finish "
        "this task;\n"
        "- rationale: one sentence justifying the estimate.\n"
        "Return STRICT JSON ONLY in this exact shape:\n"
        '{"title": "...", "description": "...", "story_points": <int>, '
        '"subtasks": ["...", "..."], "dependencies": ["..."], '
        '"due_in_days": <int>, "rationale": "..."}\n\n'
        f"Title: {title}\n"
        f"Description: {description}\n"
    )
    return _openrouter_chat(prompt, max_tokens=1500)


# ── planificare sprint (brief liber -> lista de taskuri) ────────────

def plan_sprint(brief: str) -> dict:
    """Imparte un brief liber de sprint intr-o lista de taskuri IT complete.

    Intoarce {"tasks": [task...], "source"} cu acelasi contract de task ca
    `generate_task` (title, description, storyPoints, subtasks[],
    dependencies[], dueDate). AI invalid => AiResponseError (502); retea =>
    fallback pe reguli.
    """
    brief = (brief or "").strip()
    if not brief:
        return {"tasks": [], "source": "rules"}

    if not _ai_available():
        return _rule_plan(brief)

    try:
        content = _ai_plan_raw(brief)
    except AiResponseError:
        raise
    except Exception:
        return _rule_plan(brief)

    data = _parse_json(content)
    raw = (data or {}).get("tasks") if isinstance(data, dict) else None
    if not isinstance(raw, list):
        # Unele modele intorc direct un array.
        raw = data if isinstance(data, list) else []

    tasks = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        task = _coerce_task(item)
        if not task["title"]:
            continue
        if task["storyPoints"] is None:
            task["storyPoints"] = _rule_estimate(task["title"], task["description"], {})["storyPoints"]
        tasks.append(task)
        if len(tasks) >= 40:
            break

    if not tasks:
        raise AiResponseError("Raspuns AI fara taskuri valide")

    return {"tasks": tasks, "source": "ai"}


def _ai_plan_raw(brief: str) -> str:
    prompt = (
        "You are an IT project planner. Given a free-text brief describing "
        "everything to do in a ONE-WEEK sprint, break it into a list of "
        "standard, well-scoped IT tasks (split anything huge into multiple "
        "tasks instead of one giant task).\n"
        "Each task MUST have, in Romanian:\n"
        "- title: imperative, <= 80 chars;\n"
        "- description: short summary AND a 'Criterii de acceptanta:' bullet list;\n"
        "- story_points: integer 1..10;\n"
        "- subtasks: 2..5 concrete, actionable steps, each a full sentence;\n"
        "- dependencies: list of other task titles this one depends on, or [];\n"
        "- due_in_days: realistic integer number of days from today to finish.\n"
        "Order the tasks so that dependencies come before the tasks that need them.\n"
        "Return STRICT JSON ONLY in this exact shape:\n"
        '{"tasks": [{"title": "...", "description": "...", "story_points": <int>, '
        '"subtasks": ["..."], "dependencies": ["..."], "due_in_days": <int>}]}\n\n'
        f"Brief:\n{brief}\n"
    )
    return _openrouter_chat(prompt, max_tokens=3000)


def _rule_plan(brief: str) -> dict:
    """Fallback determinist: imparte brief-ul in fragmente si face cate un task."""
    brief = brief or ""

    items: list[str] = []
    for line in brief.splitlines():
        line = line.strip()
        if not line:
            continue
        if len(line) > 80:
            parts = re.split(r"(?:^|\s)[-*•]\s+|;|\.\s+", line)
        else:
            parts = [line]
        for part in parts:
            part = part.strip(" -*•\t")
            if len(part) >= 3:
                items.append(part)

    items = items[:40]

    if not items:
        whole = brief.strip()
        if not whole:
            return {"tasks": [], "source": "rules"}
        items = [whole]

    tasks = [_rule_task(item[:80], item) for item in items]
    return {"tasks": tasks, "source": "rules"}


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


def _rule_task(title: str, description: str) -> dict:
    """Construieste un task complet determinist (fallback fara AI)."""
    title = (title or "").strip() or "Task nou"
    est = _rule_estimate(title, description, {})
    points = est["storyPoints"]

    subtasks = est["suggestedSubtasks"] or [
        "Clarifica cerintele si scopul",
        "Implementeaza solutia",
        "Testeaza si verifica rezultatul",
    ]

    body = description.strip() if description.strip() else title
    desc = (
        f"{body}\n\n"
        "Criterii de acceptanta:\n"
        "- Functionalitatea livreaza ce cere descrierea\n"
        "- Codul e testat si verificat"
    )

    # Timeline implicit proportional cu efortul (min 1 zi).
    due_days = max(1, min(14, points))

    return {
        "title": title[:80],
        "description": desc,
        "storyPoints": points,
        "subtasks": subtasks,
        "dependencies": [],
        "dueDate": _due_iso(due_days),
        "rationale": est["rationale"],
    }


# ── utilitare ───────────────────────────────────────────────────────

def _clamp_points(value) -> int:
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        n = 1
    return max(1, min(10, n))


def _str_list(value, *, limit: int = 12) -> list[str]:
    """Normalizeaza o valoare intr-o lista curata de string-uri."""
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, dict):
            # Subtask {title, detail} sau {title}.
            title = str(item.get("title") or item.get("text") or "").strip()
            detail = str(item.get("detail") or item.get("description") or "").strip()
            s = f"{title} — {detail}" if title and detail else (title or detail)
        else:
            s = str(item or "").strip()
        if s:
            out.append(s)
        if len(out) >= limit:
            break
    return out


def _coerce_task(item: dict) -> dict:
    """Normalizeaza un task din raspunsul AI in contractul nostru camelCase."""
    title = str(item.get("title") or "").strip()[:80]
    description = str(item.get("description") or "").strip()
    subtasks = _str_list(item.get("subtasks"))
    dependencies = _str_list(item.get("dependencies"))

    sp_raw = item.get("story_points", item.get("storyPoints"))
    story_points = _clamp_points(sp_raw) if sp_raw is not None else None

    due_in_days = item.get("due_in_days", item.get("dueInDays"))
    due_date = None
    try:
        if due_in_days is not None:
            due_date = _due_iso(int(round(float(due_in_days))))
    except (TypeError, ValueError):
        due_date = None

    rationale = str(item.get("rationale") or "").strip()

    return {
        "title": title,
        "description": description,
        "storyPoints": story_points,
        "subtasks": subtasks,
        "dependencies": dependencies,
        "dueDate": due_date,
        "rationale": rationale,
    }


def _due_iso(days: int) -> str:
    """Data tinta = azi + `days` zile (clamp 0..120), ora 17:00 UTC, ISO."""
    days = max(0, min(120, int(days)))
    when = (datetime.utcnow() + timedelta(days=days)).replace(
        hour=17, minute=0, second=0, microsecond=0
    )
    return when.isoformat()


def _parse_json(text: str):
    """Parseaza JSON din raspunsul modelului, robust la proza / code fences.

    Strategie:
      1) incearca json.loads pe textul curatat de fences;
      2) altfel extrage primul obiect/array JSON echilibrat (numara acoladele,
         respectand string-urile) si il parseaza.
    Arunca AiResponseError daca nu se gaseste niciun JSON valid.
    """
    if not text or not text.strip():
        raise AiResponseError("Raspuns AI gol")

    cleaned = _strip_fences(text.strip())

    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        pass

    candidate = _first_json_blob(cleaned) or _first_json_blob(text)
    if candidate is not None:
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            pass

    raise AiResponseError("AI a returnat un raspuns invalid")


def _strip_fences(text: str) -> str:
    """Scoate ```json ... ``` (oriunde) si intoarce continutul, daca exista."""
    m = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return text


def _first_json_blob(text: str) -> str | None:
    """Extrage primul obiect {...} sau array [...] echilibrat din text."""
    start = None
    opener = None
    for i, ch in enumerate(text):
        if ch in "{[":
            start = i
            opener = ch
            break
    if start is None:
        return None

    closer = "}" if opener == "{" else "]"
    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None
