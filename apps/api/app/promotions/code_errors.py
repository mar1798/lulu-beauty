"""Why a promo code cannot be used. Each error names the machine code the API answers with."""

from fastapi import status


class PromoCodeError(Exception):
    """A promo code the customer typed cannot be taken.

    `code` is the `detail` of the HTTP answer (the Russian text lives on the website,
    `apiErrors.ts`) and `status_code` its status — the router and checkout map the error
    the same way, so both read them off the exception.
    """

    code = "promo_code_not_found"
    status_code = status.HTTP_404_NOT_FOUND


class PromoCodeNotFoundError(PromoCodeError):
    """No such code *for this customer*.

    Also what somebody else's code, and a revoked one, answer: the API must not confirm
    that a string is a real code to anybody but its owner.
    """

    code = "promo_code_not_found"
    status_code = status.HTTP_404_NOT_FOUND


class PromoCodeExpiredError(PromoCodeError):
    code = "promo_code_expired"
    status_code = status.HTTP_409_CONFLICT


class PromoCodeNotYetValidError(PromoCodeError):
    code = "promo_code_not_yet_valid"
    status_code = status.HTTP_409_CONFLICT


class PromoCodeAlreadyUsedError(PromoCodeError):
    """Used, or held by another order that has not been paid for yet."""

    code = "promo_code_already_used"
    status_code = status.HTTP_409_CONFLICT


class PromoCodeUsedThisCycleError(PromoCodeError):
    """An owner's code this customer may use again, but not twice in one cycle: an order of
    theirs in this cycle already holds it."""

    code = "promo_code_used_this_cycle"
    status_code = status.HTTP_409_CONFLICT


class PromoCodeConditionsNotMetError(PromoCodeError):
    code = "promo_code_conditions_not_met"
    status_code = status.HTTP_409_CONFLICT


class OrderHasPromoCodeError(PromoCodeError):
    """The order already holds a code: one order, one code. It is taken off first."""

    code = "order_has_promo_code"
    status_code = status.HTTP_409_CONFLICT


class PromoCodeTakenError(PromoCodeError):
    """The owner's code string already belongs to another owner code (archived ones
    included) or to a code issued to a customer."""

    code = "promo_code_taken"
    status_code = status.HTTP_409_CONFLICT


class PromoCodeInvalidError(PromoCodeError):
    """The owner's code string is not 4-16 Latin letters and digits."""

    code = "promo_code_invalid"
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT


class PromoCodeUserNotFoundError(PromoCodeError):
    """A personal code was assigned to an account that does not exist or was erased."""

    code = "promo_code_user_not_found"
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
