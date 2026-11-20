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


class PromoCodeConditionsNotMetError(PromoCodeError):
    code = "promo_code_conditions_not_met"
    status_code = status.HTTP_409_CONFLICT
