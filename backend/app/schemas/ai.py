from pydantic import BaseModel
from typing import Optional


class TaskQuestionsRequest(BaseModel):
    title: str
    description: Optional[str] = None


class EstimateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    answers: Optional[dict] = None


class GenerateTaskRequest(BaseModel):
    """Input pentru generarea unui task complet dintr-o descriere simpla."""
    title: str
    description: Optional[str] = None


class CreateTaskRequest(BaseModel):
    title: str
    description: Optional[str] = None
    # Story points alese de user (din preview-ul AI sau manual).
    storyPoints: Optional[int] = None
    # Subtaskuri (titluri) confirmate de user — persistate ca checklist.
    subtasks: Optional[list[str]] = None
    # Data tinta ISO (din timeline-ul propus de AI sau aleasa manual).
    dueDate: Optional[str] = None
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
    subtasks: Optional[list[str]] = None
    dueDate: Optional[str] = None
    columnId: Optional[str] = None


class SprintPlanApplyInput(BaseModel):
    tasks: list[PlannedTask]
