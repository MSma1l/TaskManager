from pydantic import BaseModel


class WeeklyStatsOut(BaseModel):
    total: int
    done: int
    skipped: int
    notDone: int
    percentage: float


class WeekHistoryOut(BaseModel):
    weekStart: str
    total: int
    done: int
    percentage: float


class TaskStreakOut(BaseModel):
    taskId: str
    taskTitle: str
    streak: int


class MissedTaskOut(BaseModel):
    taskId: str
    taskTitle: str
    missedCount: int
