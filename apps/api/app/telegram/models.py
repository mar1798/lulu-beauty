import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.mixins import UUIDPrimaryKeyMixin
from app.db import Base


class RelayedMessage(UUIDPrimaryKeyMixin, Base):
    """One message the bot put into an owner's chat on somebody's behalf — and whose.

    The owner answers a customer by replying to what the bot passed on
    (`handlers.handle_owner_reply`), and this row is how that reply finds its way back:
    looked up by the chat and the id of the message replied to. It used to be read off
    the message itself — the phone on the «Покупатель:» line — but that text is partly
    the customer's: a name with a line break, or a photo whose own caption was too long
    to carry the header and so arrived under the customer's words alone, could put
    somebody else's number there, and the owner's answer went to that somebody.

    `user_id` is the writer; empty only for a wish a guest left before wishes needed an
    account. A wish's row goes with the wish (an erasure deletes those outright), and
    everything else with the account. `order_id` carries no foreign key: an order may be
    deleted while the conversation about it goes on, and `order_reference` — the «#…»
    the header showed — is kept for exactly that case.

    Never pruned: a row per passed-on message, which the 30-second limit on writing to
    the shop keeps to a trickle, and an owner may answer a message from months ago.
    """

    __tablename__ = "relayed_messages"
    __table_args__ = (
        UniqueConstraint("owner_chat_id", "message_id", name="uq_relayed_messages_chat_message"),
    )

    owner_chat_id: Mapped[int] = mapped_column(BigInteger)
    message_id: Mapped[int] = mapped_column(BigInteger)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    wanted_product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("wanted_products.id", ondelete="CASCADE"), index=True
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    order_reference: Mapped[str | None] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
