import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import RefreshToken, Role, TelegramAuthSession
from app.cart.models import Cart, CartItem
from app.cart.service import CartService
from app.orders.models import OrderItem, OrderStatus
from app.orders.service import OrdersService
from app.telegram import recipients
from app.users.service import (
    DELETED_NAME,
    AccountHasUnfinishedOrdersError,
    AccountNotDeletableError,
    UserNotFoundError,
    UsersService,
)
from app.wishlist.models import WishlistItem
from app.wishlist.service import WishlistService
from tests.integration.factories import make_cycle, make_product, make_user, variant_id


async def test_get_returns_the_user_behind_an_access_token(db_session: AsyncSession) -> None:
    user = await make_user(db_session, phone="+996700111222", role=Role.ADMIN)

    found = await UsersService(db_session).get(user.id)

    assert found.id == user.id
    assert found.phone == "+996700111222"
    assert found.role is Role.ADMIN


async def test_get_raises_for_unknown_user(db_session: AsyncSession) -> None:
    # Access tokens are verified without a DB lookup, so a token can outlive its user.
    with pytest.raises(UserNotFoundError):
        await UsersService(db_session).get(uuid.uuid4())


async def test_update_changes_only_the_provided_fields(db_session: AsyncSession) -> None:
    user = await make_user(db_session, phone="+996700333444")
    original_phone = user.phone

    updated = await UsersService(db_session).update(user.id, {"name": "Aigul"})

    assert updated.name == "Aigul"
    assert updated.phone == original_phone


async def test_update_with_no_fields_is_a_noop(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    original_name = user.name

    updated = await UsersService(db_session).update(user.id, {})

    assert updated.name == original_name


async def test_search_treats_like_wildcards_as_literal_text(db_session: AsyncSession) -> None:
    """ "%" and "_" are LIKE syntax, and the owner types them as characters.

    Unescaped, "_" matched any single character — so searching for a name containing an
    underscore returned every account whose name differed by one letter, and a lone "%"
    returned the whole table under the guise of a filter.
    """
    await make_user(db_session, name="Аня_К", phone="+996700000001")
    await make_user(db_session, name="АняЛК", phone="+996700000002")
    await make_user(db_session, name="Борис", phone="+996700000003")

    service = UsersService(db_session)

    underscore, total = await service.list_page(search="Аня_")
    assert [user.name for user in underscore] == ["Аня_К"]
    assert total == 1

    percent, total = await service.list_page(search="%")
    assert percent == []
    assert total == 0


async def test_blank_search_is_not_a_filter(db_session: AsyncSession) -> None:
    await make_user(db_session, name="Аня", phone="+996700000004")

    _, total = await UsersService(db_session).list_page(search="   ")

    assert total == 1


async def test_delete_account_erases_the_person_but_keeps_the_orders(
    db_session: AsyncSession,
) -> None:
    """The whole trade the erasure is built on: the person goes, the purchases stay.

    A `DELETE FROM users` would have taken the orders with it (`ON DELETE CASCADE`), and
    with them the shop's record of goods it bought and handed over.
    """
    user = await make_user(db_session, phone="+996700555111", name="Аида")
    await make_cycle(db_session)
    product = await make_product(db_session, name="Rose Serum", price_cents=1500)
    await CartService(db_session).add_item(user.id, variant_id(product), 2)
    order = await OrdersService(db_session).checkout(user.id, note=None)
    order.status = OrderStatus.COMPLETED
    await db_session.flush()

    await UsersService(db_session).delete_account(user.id)

    await db_session.refresh(user)
    assert user.name == DELETED_NAME
    assert user.phone != "+996700555111"
    assert user.deleted_at is not None

    await db_session.refresh(order)
    assert order.status is OrderStatus.COMPLETED
    assert order.total_cents == 3000
    # Queried rather than read off the relationship: `refresh` expired it, and the lines
    # are the part of the order the owner actually bought against.
    lines = (await db_session.execute(select(OrderItem))).scalars().all()
    assert [line.product_name for line in lines] == ["Rose Serum"]


async def test_delete_account_withdraws_open_orders_and_names_them(
    db_session: AsyncSession,
) -> None:
    """Open orders leave the purchase list as the customer's own cancellations, and their
    ids come back so the owner can be told which ones."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, variant_id(product), 1)
    order = await OrdersService(db_session).checkout(user.id, note=None)

    withdrawn = await UsersService(db_session).delete_account(user.id)

    assert withdrawn == [order.id]
    await db_session.refresh(order)
    assert order.status is OrderStatus.CANCELLED_BY_CUSTOMER


async def test_delete_account_leaves_finished_orders_alone(db_session: AsyncSession) -> None:
    """COMPLETED and already-cancelled orders are not "live" — nothing is bought against
    them, and rewriting their status would falsify history the owner may still be reading."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, variant_id(product), 1)
    done = await OrdersService(db_session).checkout(user.id, note=None)
    done.status = OrderStatus.COMPLETED
    await db_session.flush()

    withdrawn = await UsersService(db_session).delete_account(user.id)

    assert withdrawn == []
    await db_session.refresh(done)
    assert done.status is OrderStatus.COMPLETED


async def test_delete_account_removes_everything_that_is_not_an_order(
    db_session: AsyncSession,
) -> None:
    """Cart, wishlist, sessions and tokens go for real — none of them is history the shop
    needs, and a revoked token row still records that this account existed."""
    user = await make_user(db_session, telegram_chat_id=4242)
    await make_cycle(db_session)
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, variant_id(product), 1)
    await WishlistService(db_session).add_item(user.id, product.id)
    db_session.add(
        RefreshToken(
            user_id=user.id,
            token_hash="hash-that-should-not-outlive-the-account",
            expires_at=datetime.now(UTC) + timedelta(days=1),
        )
    )
    db_session.add(
        TelegramAuthSession(
            link_payload="payload-1",
            poll_secret_hash="secret-hash-1",
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(minutes=10),
        )
    )
    await db_session.flush()

    await UsersService(db_session).delete_account(user.id)

    assert (await db_session.execute(select(Cart))).scalars().all() == []
    # Cart items go with their cart at the database level, not through the ORM.
    assert (await db_session.execute(select(CartItem))).scalars().all() == []
    assert (await db_session.execute(select(WishlistItem))).scalars().all() == []
    assert (await db_session.execute(select(RefreshToken))).scalars().all() == []
    assert (await db_session.execute(select(TelegramAuthSession))).scalars().all() == []

    await db_session.refresh(user)
    # The binding above all: this is what the bot looks the account up by, so clearing it
    # is what actually detaches the chat.
    assert user.telegram_chat_id is None


async def test_deleted_account_is_gone_to_every_reader(db_session: AsyncSession) -> None:
    """An erased row is "not found" to the profile endpoints and absent from the owner's
    account list — it exists only to hold the orders hanging off it."""
    user = await make_user(db_session)
    service = UsersService(db_session)

    await service.delete_account(user.id)

    with pytest.raises(UserNotFoundError):
        await service.get(user.id)

    listed, total = await service.list_page()
    assert listed == []
    assert total == 0


@pytest.mark.parametrize("role", [Role.ADMIN, Role.SUPER_ADMIN])
async def test_delete_account_refuses_an_account_with_admin_rights(
    db_session: AsyncSession, role: Role
) -> None:
    """Erasure is a customer's right over their own data; an admin row is a way into the
    shop's panel, and giving that up is the owner's decision, not a button its holder
    presses in a bad moment. The way out is `set_role` back to CUSTOMER first.

    It also keeps `recipients.get_owners` honest: that query selects on role alone, so a
    nameless admin with no chat must not be a state the table can reach."""
    admin = await make_user(db_session, role=role)

    with pytest.raises(AccountNotDeletableError):
        await UsersService(db_session).delete_account(admin.id)

    await db_session.refresh(admin)
    assert admin.deleted_at is None


async def test_a_demoted_admin_may_leave(db_session: AsyncSession) -> None:
    """The refusal is about the rights, not the person: hand them back and the account
    erases like anybody else's."""
    service = UsersService(db_session)
    admin = await make_user(db_session, role=Role.ADMIN)

    await service.set_role(admin.id, Role.CUSTOMER)
    await service.delete_account(admin.id)

    await db_session.refresh(admin)
    assert admin.deleted_at is not None


async def test_two_erased_accounts_do_not_collide(db_session: AsyncSession) -> None:
    """`users.phone` is UNIQUE, so the placeholder that fills it has to differ per row —
    otherwise the second person to leave could not."""
    first = await make_user(db_session, phone="+996700888001")
    second = await make_user(db_session, phone="+996700888002")
    service = UsersService(db_session)

    await service.delete_account(first.id)
    await service.delete_account(second.id)

    await db_session.refresh(first)
    await db_session.refresh(second)
    assert first.phone != second.phone


async def test_the_same_number_can_start_over(db_session: AsyncSession) -> None:
    """Erasure releases the number: the phone is what an account is found by
    (`recipients.find_user_by_phone`), and a person who left has to be able to come back."""
    user = await make_user(db_session, phone="+996700999001")
    await UsersService(db_session).delete_account(user.id)

    assert await recipients.find_user_by_phone(db_session, "+996700999001") is None

    returning = await make_user(db_session, phone="+996700999001")
    assert returning.id != user.id


async def test_an_erased_account_keeps_its_orders_out_of_the_cycle_fan_out(
    db_session: AsyncSession,
) -> None:
    """Cycle news reaches people through their orders and carts; an erased account has no
    binding left, so it drops out of the audience on its own."""
    user = await make_user(db_session, telegram_chat_id=5151)
    cycle = await make_cycle(db_session)
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, variant_id(product), 1)
    await OrdersService(db_session).checkout(user.id, note=None)

    await UsersService(db_session).delete_account(user.id)

    assert await recipients.get_cycle_participants(db_session, cycle.id) == []
    assert await recipients.get_broadcast_audience(db_session) == []


@pytest.mark.parametrize("status", [OrderStatus.CONFIRMED, OrderStatus.READY])
async def test_delete_account_refuses_while_the_shop_still_owes_goods(
    db_session: AsyncSession, status: OrderStatus
) -> None:
    """A confirmed or ready order is goods already bought and still the person's to
    collect. Erasing here would cancel a purchase that was already made and leave the
    owner with no name and no number to ask about it."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, variant_id(product), 1)
    order = await OrdersService(db_session).checkout(user.id, note=None)
    order.status = status
    await db_session.flush()

    with pytest.raises(AccountHasUnfinishedOrdersError) as refusal:
        await UsersService(db_session).delete_account(user.id)

    # The ids travel with the refusal: "you have orders in progress" without saying
    # which ones sends the person to their list to guess.
    assert refusal.value.order_ids == [order.id]
    await db_session.refresh(user)
    assert user.deleted_at is None
    await db_session.refresh(order)
    assert order.status is status


async def test_deletion_blockers_answers_the_same_rule_the_erasure_enforces(
    db_session: AsyncSession,
) -> None:
    """The page asks this before it draws the button; `delete_account` asks it before it
    erases anything. One query, so the disabled button and the refusal cannot disagree."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)
    service = UsersService(db_session)

    await CartService(db_session).add_item(user.id, variant_id(product), 1)
    pending = await OrdersService(db_session).checkout(user.id, note=None)

    # Nothing is bought against a PENDING order, so it blocks nothing.
    assert await service.deletion_blockers(user.id) == []

    pending.status = OrderStatus.CONFIRMED
    await db_session.flush()

    assert await service.deletion_blockers(user.id) == [pending.id]


async def test_delete_account_withdraws_only_what_nobody_bought_against(
    db_session: AsyncSession,
) -> None:
    """A completed order sits next to a pending one: the erasure goes through, and only
    the pending one is withdrawn."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)
    cart = CartService(db_session)
    orders = OrdersService(db_session)

    await cart.add_item(user.id, variant_id(product), 1)
    done = await orders.checkout(user.id, note=None)
    done.status = OrderStatus.COMPLETED
    await db_session.flush()

    await cart.add_item(user.id, variant_id(product), 1)
    pending = await orders.checkout(user.id, note=None)

    withdrawn = await UsersService(db_session).delete_account(user.id)

    assert withdrawn == [pending.id]
    await db_session.refresh(done)
    assert done.status is OrderStatus.COMPLETED
