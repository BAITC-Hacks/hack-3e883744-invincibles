from app.contracts.domain import EmployeeContext
from app.contracts.recommendation import HistorySummary


def summarize_type_history(ctx: EmployeeContext, event_type: str) -> HistorySummary:
    event_types = {event.event_id: event.type for event in ctx.events}
    matching = [entry for entry in ctx.history if event_types.get(entry.event_id) == event_type]
    return HistorySummary(completed=sum(e.status == 'completed' for e in matching),skipped=sum(e.status == 'skipped' for e in matching),declined=sum(e.status == 'declined' for e in matching))
