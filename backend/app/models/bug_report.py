from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Boolean, ForeignKey, JSON
from app.core.database import Base
from app.models.base import generate_cuid


class BugReport(Base):
    """Raport de testare / bug pentru un proiect (modulul QA).

    Fiecare raport conține: descriere, un checklist de pași de testare
    (`steps` JSON), status (OPEN/IN_PROGRESS/PASSED/FAILED), severitate,
    plus imagini (atașamente base64) și comentarii (tabele separate).
    """
    __tablename__ = "bug_reports"

    id = Column(String, primary_key=True, default=generate_cuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    # OPEN | IN_PROGRESS | PASSED | FAILED
    status = Column(String(20), nullable=False, default="OPEN", index=True)
    # LOW | MEDIUM | HIGH | CRITICAL
    severity = Column(String(20), nullable=False, default="MEDIUM")
    # Checklist de pași de testare: [{"id": cuid, "text": str, "done": bool,
    #   "result": "pass"|"fail"|None}], ordonat.
    steps = Column(JSON, nullable=True)

    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    assignee_id = Column(String, ForeignKey("users.id"), nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BugReportAttachment(Base):
    """Imagine/dovadă vizuală atașată unui raport (data URL base64, ca nb_sketches)."""
    __tablename__ = "bug_report_attachments"

    id = Column(String, primary_key=True, default=generate_cuid)
    bug_report_id = Column(
        String, ForeignKey("bug_reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    image_data = Column(Text, nullable=False)  # data:image/png;base64,...
    caption = Column(String(300), nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class BugReportComment(Base):
    """Comentariu pe un raport de testare."""
    __tablename__ = "bug_report_comments"

    id = Column(String, primary_key=True, default=generate_cuid)
    bug_report_id = Column(
        String, ForeignKey("bug_reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
