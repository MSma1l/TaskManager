import enum
import uuid


class TaskStatus(str, enum.Enum):
    PENDING = "PENDING"
    DONE = "DONE"
    SKIPPED = "SKIPPED"
    NOT_DONE = "NOT_DONE"


class ProjectRole(str, enum.Enum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    MEMBER = "MEMBER"
    VIEWER = "VIEWER"


def generate_cuid():
    return str(uuid.uuid4()).replace("-", "")[:25]
