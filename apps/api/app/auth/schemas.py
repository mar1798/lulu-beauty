from pydantic import Field

from app.auth.models import OtpPurpose
from app.common.schemas import CamelModel

PHONE_PATTERN = r"^\+[1-9]\d{7,14}$"
OTP_CODE_PATTERN = r"^\d{6}$"


class RegisterRequest(CamelModel):
    phone: str = Field(pattern=PHONE_PATTERN)
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=255)


class LoginRequest(CamelModel):
    phone: str = Field(pattern=PHONE_PATTERN)
    password: str


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
