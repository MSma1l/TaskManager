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
    # Story points alese de user (din estimarea AI deja facuta sau manual).
    # Niciodata re-estimat aici — crearea e un insert direct, fara apel AI.
    storyPoints: Optional[int] = None
    # Acceptat pentru compatibilitate cu wizard-ul; nefolosit la creare.
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
