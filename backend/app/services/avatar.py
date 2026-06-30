"""Helper partajat pentru URL-ul de avatar al unui utilizator.

Avatarul propriu-zis (base64) e stocat in `users.avatar` si e DEFERRED in ORM
ca sa nu umfle JSON-ul de listari/board (board-ul face polling la 5s). Serializatorii
nu trebuie sa atinga `user.avatar`; folosesc doar `user.avatar_version` (coloana
normala, incarcata cu randul) ca sa decida daca exista avatar si pentru cache-busting.
"""
from typing import Optional


def avatar_url(user) -> Optional[str]:
    """Intoarce URL-ul public al avatarului sau None daca userul nu are avatar.

    Forma: /api/users/{id}/avatar?v={avatar_version}
    `?v=` busteaza cache-ul browserului la fiecare schimbare de avatar.
    Decizia se ia DOAR pe `avatar_version` (ieftin), niciodata pe `avatar` (deferred).
    """
    if user is None:
        return None
    version = getattr(user, "avatar_version", 0) or 0
    if version <= 0:
        return None
    return f"/api/users/{user.id}/avatar?v={version}"
