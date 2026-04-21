from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    ui_language: str | None = None


class UserPreferencesUpdateRequest(BaseModel):
    ui_language: str | None = None


class AuthResponse(BaseModel):
    token: str
    user: UserResponse
