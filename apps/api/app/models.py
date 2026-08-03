"""Import hub: ensures every SQLAlchemy model is registered on Base.metadata
before Alembic autogenerate (or anything else) inspects it.
"""

from app.auth.models import OtpCode, RefreshToken, User  # noqa: F401
from app.cart.models import Cart, CartItem  # noqa: F401
from app.catalog.models import Category, Product, ProductImage  # noqa: F401
from app.cycles.models import OrderCycle  # noqa: F401
from app.orders.models import Order, OrderItem  # noqa: F401
