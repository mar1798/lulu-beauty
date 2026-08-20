"""When a cycle's deadline is announced, and where "already announced" is recorded.

Its own module rather than a corner of `scheduler_service`: `CyclesService.update` has to
reopen the stages a moved deadline has left behind, and importing the scheduler from the
service it is built on would close the import cycle.
"""

from dataclasses import dataclass
from datetime import timedelta


@dataclass(frozen=True)
class ReminderStage:
    """One nudge before a deadline: how early it goes out, and where "already sent" lives.

    Two stages, not one, because a reminder a day ahead and a reminder three hours ahead
    are answering different questions — "when should I get round to this?" versus "am I
    about to miss it?" — and the second one has to say so, or it reads as a repeat.
    """

    window: timedelta
    sent_at_field: str
    last_chance: bool


# Most urgent first: a cycle can become due for both stages at once (created, or its
# deadline moved, inside the narrow window), and sweep_reminders sends only the first.
REMINDER_STAGES = (
    ReminderStage(
        window=timedelta(hours=3), sent_at_field="final_reminder_sent_at", last_chance=True
    ),
    ReminderStage(window=timedelta(hours=24), sent_at_field="reminder_sent_at", last_chance=False),
)
WIDEST_REMINDER_WINDOW = max(stage.window for stage in REMINDER_STAGES)
