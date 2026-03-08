import enum
import uuid


class TaskStatus(str, enum.Enum):
    PENDING = "PENDING"
    DONE = "DONE"
    SKIPPED = "SKIPPED"
    NOT_DONE = "NOT_DONE"


def generate_cuid():
    return str(uuid.uuid4()).replace("-", "")[:25]
