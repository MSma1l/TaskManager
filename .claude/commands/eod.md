---
description: End-of-day check — actualizează CLAUDE.md dacă e cazul, sumar scurt
---

Verifică ce s-a schimbat azi în repo și actualizează `CLAUDE.md` dacă e cazul.

## Pași

1. Rulează `git log --since="6am" --oneline` ca să vezi commit-urile de azi.
   Dacă nu există commit-uri, verifică `git status` și `git diff` pentru lucru
   neîncheiat.
2. Pentru fiecare schimbare semnificativă (ignoră cosmetice/typo), evaluează:
   - A apărut un feature/folder nou care merită menționat în CLAUDE.md?
   - S-a schimbat o convenție, flow de auth, model de DB, endpoint critic?
   - S-a adăugat/scos o dependență sau o comandă de rulare (docker, alembic, npm)?
   - S-a introdus o regulă nouă pe care viitorul Claude trebuie să o știe?
3. Dacă DA → editează `CLAUDE.md` țintit (Edit tool, NU rewrite). Păstrează stilul
   scurt, focusat pe "ce nu e evident din cod". Nu duplica README/GUIDE.
4. Dacă nimic relevant nu s-a schimbat → spune explicit "CLAUDE.md e încă actual"
   și nu atinge fișierul.

## Sumar final (3 rânduri)

- **Azi**: ce s-a făcut la nivel arhitectural (nu listă de commit-uri)
- **CLAUDE.md**: ce s-a actualizat (sau "nimic")
- **Mâine**: 1 frază cu ce ar fi util de continuat

## Reguli

- Nu adăuga secțiuni noi în CLAUDE.md decât dacă ceva chiar le justifică.
- Nu explica ce face codul (identifierii o fac).
- Nu pune comentarii "added X today" — informația e în git.
- Memory doar pentru preferințe cross-project — starea proiectului stă în CLAUDE.md.
