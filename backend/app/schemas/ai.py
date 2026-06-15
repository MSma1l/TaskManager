from pydantic import BaseModel
from typing import Optional


class TaskQuestionsRequest(BaseModel):
    title: str
    description: Optional[str] = None


class EstimateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    answers: Optional[dict] = None


class CreateTaskRequest(BaseModel):
    title: str
    description: Optional[str] = None
    answers: Optional[dict] = None
    columnId: Optional[str] = None
    assigneeId: Optional[str] = None


class SprintPlanInput(BaseModel):
    brief: str


class PlannedTask(BaseModel):
    title: str
    description: Optional[str] = None
    storyPoints: Optional[int] = None
    columnId: Optional[str] = None


class SprintPlanApplyInput(BaseModel):
    tasks: list[PlannedTask]
