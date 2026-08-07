from pydantic import Field

from app.auth.models import OtpPurpose
from app.common.phone import PHONE_PATTERN
from app.common.schemas import CamelModel

OTP_CODE_PATTERN = r"^\d{6}$"


class RegisterRequest(CamelModel):
    phone: str = Field(pattern=PHONE_PATTERN)
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=255)


class LoginRequest(CamelModel):
    phone: str = Field(pattern=PHONE_PATTERN)
    password: str


class ForgotPasswordRequest(CamelModel):
    phone: str = Field(pattern=PHONE_PATTERN)


class ResetPasswordRequest(CamelModel):
    phone: str = Field(pattern=PHONE_PATTERN)
    code: str = Field(pattern=OTP_CODE_PATTERN)
    new_password: str = Field(min_length=8, max_length=255)


class VerifyOtpRequest(CamelModel):
    phone: str = Field(pattern=PHONE_PATTERN)
    code: str = Field(pattern=OTP_CODE_PATTERN)
    purpose: OtpPurpose


class RefreshRequest(CamelModel):
    refresh_token: str


class LogoutRequest(CamelModel):
    refresh_token: str


class OtpSentResponse(CamelModel):
    message: str
    purpose: OtpPurpose


class TokenResponse(CamelModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
