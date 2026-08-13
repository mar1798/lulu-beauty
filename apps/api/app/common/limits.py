"""Domain limits shared across modules.

They live here rather than next to whichever schema happened to need one first: the
cart and an already-placed order hold the same lines, and a ceiling enforced on one
side but not the other is not a ceiling — it just moves where the overflow lands.
"""

# Nobody means a thousand of anything in this shop, and the order edit endpoints
# refuse to set a quantity above this, so the cart must not be able to check one out.
MAX_ITEM_QUANTITY = 999

# A wishlist is a shortlist, not a second catalog: it is returned whole on every call
# (including after each add), so an unbounded one turns a heart press into an
# ever-growing response. Well past any real use, low enough to stay one payload.
MAX_WISHLIST_ITEMS = 200

# products.price_cents is a 32-bit INTEGER: anything past this reaches Postgres as an
# out-of-range value and fails the whole request (a whole catalog import) at flush time.
MAX_PRICE_CENTS = 2_000_000_000
